/**
 * 小红书内容抓取模块
 *
 * 方法：移动端页面 + 解析 __INITIAL_STATE__ JSON 数据
 * - PC 端页面是 JS 渲染，无法直接抓取
 * - Jina Reader 返回 451（小红书屏蔽海外 IP）
 * - yt-dlp 经常失败（需要 cookies）
 *
 * 解决方案：
 * 1. 用移动端 UA 访问页面，获取 HTML
 * 2. 从 __INITIAL_STATE__ 中提取 JSON 数据
 * 3. 解析出标题、作者、描述、视频 URL
 * 4. 下载视频 → ffmpeg 提取音频 → Gemini 转录
 */
import { transcribeFromFile } from "./gemini.js";
import { unlink, writeFile } from "fs/promises";
import { homedir } from "os";
import { resolve } from "path";
import { mkdir } from "fs/promises";
const TMP_DIR = resolve(homedir(), ".lingji", "tmp");
const UA = "Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
/** 从 URL 中提取笔记 ID */
export function extractNoteId(url) {
    // https://www.xiaohongshu.com/explore/69b52b5a000000001a02660c
    const match = url.match(/xiaohongshu\.com\/explore\/([a-f0-9]+)/);
    if (match)
        return match[1];
    // https://www.xiaohongshu.com/discovery/item/69b52b5a000000001a02660c
    const match2 = url.match(/xiaohongshu\.com\/discovery\/item\/([a-f0-9]+)/);
    if (match2)
        return match2[1];
    // xhslink.com 短链接
    return null;
}
/** 从移动端页面获取笔记数据 */
export async function fetchXHSNoteData(noteId) {
    const url = `https://www.xiaohongshu.com/explore/${noteId}`;
    console.error(`[OpenClaw] 小红书：获取笔记数据 ${noteId}...`);
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(15_000),
        });
        const html = await res.text();
        // 提取 __INITIAL_STATE__ JSON
        const stateMatch = html.match(/__INITIAL_STATE__=({.+?})<\/script>/);
        if (!stateMatch) {
            console.error("[OpenClaw] 小红书：未找到 __INITIAL_STATE__");
            return null;
        }
        const state = JSON.parse(stateMatch[1]);
        // 数据路径：noteData.data.noteData 或 note.noteDetailMap
        const noteData = state?.noteData?.data?.noteData || state?.note?.noteDetailMap?.[noteId]?.note;
        if (!noteData) {
            console.error("[OpenClaw] 小红书：未找到笔记数据");
            return null;
        }
        // 提取视频 URL
        let videoUrl;
        const masterUrl = noteData?.video?.media?.stream?.h264?.[0]?.masterUrl;
        if (masterUrl) {
            // 解码 Unicode 转义：http:\u002F\u002F... → http://...
            videoUrl = masterUrl.replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
        }
        const result = {
            noteId: noteData.noteId || noteId,
            title: noteData.title || "小红书笔记",
            author: noteData.user?.nickname || noteData.user?.nickName || "",
            desc: noteData.desc || "",
            type: noteData.type === "video" ? "video" : "normal",
            videoUrl,
            duration: noteData.video?.media?.video?.duration,
        };
        console.error(`[OpenClaw] 小红书：${result.title} (${result.type === "video" ? "视频" : "图文"})`);
        return result;
    }
    catch (e) {
        console.error("[OpenClaw] 小红书获取失败:", e);
        return null;
    }
}
/** 下载小红书视频并提取音频 */
export async function downloadXHSAudio(videoUrl) {
    await mkdir(TMP_DIR, { recursive: true });
    const videoFile = resolve(TMP_DIR, `xhs_${Date.now()}.mp4`);
    const audioFile = videoFile.replace(".mp4", ".mp3");
    try {
        console.error("[OpenClaw] 小红书：下载视频...");
        const res = await fetch(videoUrl, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        await writeFile(videoFile, Buffer.from(buffer));
        // 用 ffmpeg 提取音频
        console.error("[OpenClaw] 小红书：提取音频...");
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const execFileAsync = promisify(execFile);
        // 查找 ffmpeg
        const ffmpegPaths = [
            "C:/ffmpeg/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe",
            "C:/ffmpeg/bin/ffmpeg.exe",
            "ffmpeg",
        ];
        let ffmpegBin = "ffmpeg";
        for (const p of ffmpegPaths) {
            try {
                await execFileAsync(p, ["-version"]);
                ffmpegBin = p;
                break;
            }
            catch { /* try next */ }
        }
        await execFileAsync(ffmpegBin, [
            "-i", videoFile,
            "-vn", "-acodec", "libmp3lame", "-q:a", "2",
            audioFile, "-y"
        ], { timeout: 60_000 });
        // 删除视频文件
        await unlink(videoFile).catch(() => { });
        console.error("[OpenClaw] 小红书：音频提取完成");
        return audioFile;
    }
    catch (e) {
        console.error("[OpenClaw] 小红书下载失败:", e);
        await unlink(videoFile).catch(() => { });
        return null;
    }
}
/** 抓取小红书笔记（视频或图文） */
export async function fetchXiaohongshu(url) {
    const noteId = extractNoteId(url);
    if (!noteId)
        return null;
    const data = await fetchXHSNoteData(noteId);
    if (!data)
        return null;
    // 图文笔记：直接用 desc 走总结
    if (data.type !== "video") {
        const content = data.desc || data.title;
        return {
            title: data.title,
            author: data.author,
            content,
            contentType: "article",
            wordCount: content.length,
        };
    }
    // 视频：下载音频 → Gemini 转录
    if (!data.videoUrl) {
        console.error("[OpenClaw] 小红书：未找到视频 URL");
        return null;
    }
    const audioFile = await downloadXHSAudio(data.videoUrl);
    if (!audioFile)
        return null;
    const transcript = await transcribeFromFile(audioFile, data.title, data.author);
    // 删除音频文件
    await unlink(audioFile).catch(() => { });
    if (!transcript)
        return null;
    return {
        title: data.title,
        author: data.author,
        content: transcript,
        contentType: "video",
        wordCount: transcript.split(/\s+/).filter(Boolean).length,
    };
}
//# sourceMappingURL=xiaohongshu.js.map