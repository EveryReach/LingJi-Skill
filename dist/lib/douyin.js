/**
 * 抖音内容提取 — 不依赖 yt-dlp，不需要登录 cookies。
 * 支持视频和图文笔记两种类型。
 * 通过访问移动端分享页面获取 SSR 数据。
 */
import { resolve } from "path";
import { homedir } from "os";
import { access, mkdir, unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { findFfmpegBin } from "./ffmpeg.js";
const execFileAsync = promisify(execFile);
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const TMP_DIR = resolve(homedir(), ".lingji", "tmp");
/** 从抖音短链接或标准 URL 中提取 aweme_id 和内容类型 */
export function extractAwemeId(url) {
    const noteMatch = url.match(/\/(?:share\/)?note\/(\d+)/);
    if (noteMatch)
        return { id: noteMatch[1], type: "note" };
    const videoMatch = url.match(/\/(?:share\/)?video\/(\d+)/);
    if (videoMatch)
        return { id: videoMatch[1], type: "video" };
    return null;
}
/** 通过移动端分享页面获取内容信息（无需 cookies） */
export async function fetchDouyinInfo(awemeId, contentType) {
    try {
        const shareUrl = `https://m.douyin.com/share/${contentType}/${awemeId}/`;
        console.error(`[OpenClaw] 抖音: 访问 ${contentType} 页面...`);
        const res = await fetch(shareUrl, {
            headers: { "User-Agent": UA },
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
        });
        const html = await res.text();
        // 优先 _ROUTER_DATA（移动端更可靠）
        const routerMatch = html.match(/_ROUTER_DATA\s*=\s*(\{.+?\});?\s*<\/script>/s);
        if (routerMatch) {
            try {
                return parseRouterData(JSON.parse(routerMatch[1]), contentType);
            }
            catch { /* JSON parse failed, try next */ }
        }
        // 备选 RENDER_DATA
        const renderMatch = html.match(/id="RENDER_DATA"[^>]*>([^<]+)/);
        if (renderMatch) {
            const decoded = decodeURIComponent(renderMatch[1]);
            return parseRegex(decoded, contentType);
        }
        // 再试 meta description（兜底）
        const metaDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]{1,500})"/);
        if (metaDesc) {
            const metaAuthor = html.match(/<meta[^>]*name="author"[^>]*content="([^"]{1,100})"/);
            return {
                type: contentType,
                title: metaDesc[1],
                author: metaAuthor?.[1] ?? "",
                duration: 0,
                videoUrl: "",
                noteText: contentType === "note" ? metaDesc[1] : "",
            };
        }
        console.error("[OpenClaw] 抖音: 未找到可解析的数据");
        return null;
    }
    catch (e) {
        console.error("[OpenClaw] 抖音页面获取失败:", e instanceof Error ? e.message : e);
        return null;
    }
}
/** 从结构化 _ROUTER_DATA 中提取 */
function parseRouterData(data, contentType) {
    const loaderData = data.loaderData;
    if (!loaderData)
        return null;
    // 找到包含 videoInfoRes 的 key
    let itemList;
    for (const val of Object.values(loaderData)) {
        if (!val || typeof val !== "object")
            continue;
        const v = val;
        const infoRes = v.videoInfoRes;
        if (infoRes?.item_list?.length) {
            itemList = infoRes.item_list;
            break;
        }
    }
    if (!itemList?.[0])
        return null;
    const item = itemList[0];
    const desc = item.desc ?? "";
    const author = item.author?.nickname ?? "";
    const duration = typeof item.duration === "number" ? Math.round(item.duration / 1000) : 0;
    // 视频播放地址
    let videoUrl = "";
    const video = item.video;
    if (video) {
        const playAddr = video.play_addr;
        videoUrl = playAddr?.url_list?.[0] ?? "";
    }
    return {
        type: contentType,
        title: desc,
        author,
        duration,
        videoUrl,
        noteText: contentType === "note" ? desc : "",
    };
}
/** 用正则从 JSON 字符串中提取（备选） */
function parseRegex(json, contentType) {
    const descMatch = json.match(/"desc"\s*:\s*"([^"]{1,500})"/);
    const authorMatch = json.match(/"nickname"\s*:\s*"([^"]{1,100})"/);
    const durationMatch = json.match(/"duration"\s*:\s*\{[^}]*"value"\s*:\s*(\d+)/) ??
        json.match(/"duration"\s*:\s*(\d+)/);
    const playMatch = json.match(/"play_addr"[^}]*"url_list"\s*:\s*\["([^"]+)"/) ??
        json.match(/"download_addr"[^}]*"url_list"\s*:\s*\["([^"]+)"/);
    if (!descMatch && !playMatch)
        return null;
    const desc = descMatch?.[1] ?? "";
    return {
        type: contentType,
        title: desc,
        author: authorMatch?.[1] ?? "",
        duration: durationMatch ? Math.round(parseInt(durationMatch[1]) / 1000) : 0,
        videoUrl: playMatch?.[1]?.replace(/\\u002F/g, "/") ?? "",
        noteText: contentType === "note" ? desc : "",
    };
}
/** 从视频直链下载音频 → 返回 MP3 路径 */
export async function downloadDouyinAudio(videoUrl) {
    const ffmpegBin = await findFfmpegBin();
    if (!ffmpegBin) {
        console.error("[OpenClaw] 未找到 ffmpeg");
        return null;
    }
    await mkdir(TMP_DIR, { recursive: true });
    const videoFile = resolve(TMP_DIR, `douyin-${Date.now()}.mp4`);
    const audioFile = resolve(TMP_DIR, `douyin-${Date.now()}.mp3`);
    try {
        // 抖音 CDN 需要：1) 使用 /play/（无水印）而非 /playwm/，2) 分两步获取 CDN URL
        const playUrl = videoUrl.replace("/playwm/", "/play/");
        // 步骤1：获取 302 重定向后的 CDN URL
        console.error("[OpenClaw] 抖音: 获取 CDN 地址...");
        const cdnUrl = await getCdnUrl(playUrl);
        if (!cdnUrl) {
            console.error("[OpenClaw] 抖音: 无法获取 CDN 地址");
            return null;
        }
        // 步骤2：直接下载 CDN 视频（不带 Referer，否则 403）
        console.error("[OpenClaw] 抖音: 下载视频...");
        await downloadFile(cdnUrl, videoFile);
        // 步骤3：用 ffmpeg 从本地文件提取音频
        console.error("[OpenClaw] 抖音: 提取音频...");
        await execFileAsync(ffmpegBin, [
            "-i", videoFile,
            "-vn", "-acodec", "mp3", "-q:a", "5", "-y", audioFile,
        ], { timeout: 300_000 });
        // 清理视频文件
        await unlink(videoFile).catch(() => { });
        if (await access(audioFile).then(() => true).catch(() => false)) {
            return audioFile;
        }
        return null;
    }
    catch (e) {
        console.error("[OpenClaw] 抖音音频下载失败:", e instanceof Error ? e.message : e);
        await unlink(videoFile).catch(() => { });
        await unlink(audioFile).catch(() => { });
        return null;
    }
}
/** 获取 302 重定向后的 CDN URL */
async function getCdnUrl(playUrl) {
    const res = await fetch(playUrl, {
        method: "HEAD",
        headers: { "User-Agent": UA, "Referer": "https://www.douyin.com/" },
        redirect: "manual",
    });
    if (res.status === 302 || res.status === 301) {
        return res.headers.get("location");
    }
    // 如果没有重定向，可能 URL 直接就是 CDN 地址
    return playUrl;
}
/** 下载文件到本地 */
async function downloadFile(url, dest) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    await import("fs/promises").then(fs => fs.writeFile(dest, Buffer.from(buffer)));
}
//# sourceMappingURL=douyin.js.map