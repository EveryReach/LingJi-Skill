import { GUIDE } from "../format.js";
import { dumpInfo, parseSubtitleText } from "../lib/ytdlp.js";
import { transcribeAudio, transcribeFromFile, summarizeText } from "../lib/gemini.js";
import { fetchGeneric } from "./generic.js";
import { extractAwemeId, fetchDouyinInfo, downloadDouyinAudio } from "../lib/douyin.js";
const MAX_CONTENT_LENGTH = 48_000;
function detectPlatform(url) {
    const host = url.toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be"))
        return "YouTube";
    if (host.includes("bilibili.com"))
        return "B站";
    if (host.includes("douyin.com"))
        return "抖音";
    if (host.includes("tiktok.com"))
        return "TikTok";
    if (host.includes("xiaohongshu.com") || host.includes("xhslink.com"))
        return "小红书";
    if (host.includes("weibo.com"))
        return "微博";
    if (host.includes("zhihu.com"))
        return "知乎";
    if (host.includes("ixigua.com"))
        return "西瓜视频";
    if (host.includes("kuaishou.com"))
        return "快手";
    if (host.includes("twitter.com") || host.includes("x.com"))
        return "X/Twitter";
    if (host.includes("instagram.com"))
        return "Instagram";
    if (host.includes("vimeo.com"))
        return "Vimeo";
    if (host.includes("twitch.tv"))
        return "Twitch";
    if (host.includes("reddit.com"))
        return "Reddit";
    if (host.includes("facebook.com"))
        return "Facebook";
    if (host.includes("github.com"))
        return "GitHub";
    return "网页";
}
/**
 * 统一内容抓取入口。
 * - 先用 yt-dlp --dump-json 探测：成功 → 视频路径；失败 → 网页文章路径（Jina Reader）。
 * - 视频路径：字幕优先，无字幕则 yt-dlp 下载音频 → Gemini 转文字+总结。
 */
export async function fetchUrl(url) {
    // 短链接解析（抖音 v.douyin.com、TikTok vm.tiktok.com 等）
    const resolved = await resolveShortUrl(url);
    // 微信公众号：直接抓取（不走 Jina，不走 yt-dlp）
    if (resolved.includes("mp.weixin.qq.com")) {
        return fetchWechatArticle(resolved);
    }
    const info = await dumpInfo(resolved).catch(() => null);
    // yt-dlp 失败时，对特定平台尝试备用方案
    if (!info) {
        // 抖音备用：自行提取视频信息 + ffmpeg 下载音频 + Gemini 转录
        const dyResult = extractAwemeId(resolved);
        if (dyResult) {
            console.error("[OpenClaw] yt-dlp 失败，尝试抖音备用方案...");
            return fetchDouyinFallback(resolved, dyResult.id, dyResult.type);
        }
        return fetchArticle(resolved);
    }
    return fetchVideo(resolved, info);
}
/** 解析短链接（302 重定向），返回最终 URL；对抖音额外规范化 */
async function resolveShortUrl(url) {
    const shortHosts = ["v.douyin.com", "vm.tiktok.com", "b23.tv", "t.co", "youtu.be"];
    try {
        const host = new URL(url).hostname;
        if (!shortHosts.some(h => host.includes(h)))
            return url;
    }
    catch {
        return url;
    }
    try {
        const res = await fetch(url, {
            redirect: "manual",
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(10_000),
        });
        let location = res.headers.get("location");
        if (location) {
            console.error(`[OpenClaw] 短链接解析: ${url} → ${location.slice(0, 80)}...`);
            // iesdouyin.com/share/video/ID 或 /share/note/ID → douyin.com/video/ID 或 /note/ID
            if (location.includes("iesdouyin.com")) {
                const videoMatch = location.match(/\/(?:share\/)?video\/(\d+)/);
                const noteMatch = location.match(/\/(?:share\/)?note\/(\d+)/);
                if (videoMatch) {
                    location = `https://www.douyin.com/video/${videoMatch[1]}`;
                }
                else if (noteMatch) {
                    location = `https://www.douyin.com/note/${noteMatch[1]}`;
                }
                console.error(`[OpenClaw] 抖音 URL 规范化: → ${location}`);
            }
            return location;
        }
    }
    catch { /* 解析失败，用原始 URL */ }
    return url;
}
async function fetchArticle(url) {
    const result = await fetchGeneric(url);
    const { title, author, content, wordCount } = result;
    const platform = detectPlatform(url);
    // 通过 Gemini 做结构化总结
    const geminiSummary = await summarizeText(content, title, author);
    if (geminiSummary) {
        let header = `标题：${title}\nURL：${url}`;
        if (author)
            header += `\n作者：${author}`;
        header += `\n平台：${platform}\n字数：约 ${wordCount}`;
        const text = `${header}\n\n${geminiSummary}\n\n---\n\n## 原文\n\n${content.slice(0, MAX_CONTENT_LENGTH)}`;
        return { text, title, author, contentType: "article", platform, wordCount };
    }
    // Gemini 失败时 fallback
    const text = `标题：${title}\nURL：${url}\n作者：${author}\n平台：${platform}\n字数：约 ${wordCount}${GUIDE}\n\n---\n\n${content}`;
    return { text, title, author, contentType: "article", platform, wordCount };
}
async function fetchVideo(url, info) {
    const title = info.title || url;
    const author = info.uploader || "";
    const duration = info.duration || 0;
    let header = `标题：${title}\nURL：${url}`;
    if (author)
        header += `\n作者：${author}`;
    if (duration)
        header += `\n时长：${Math.floor(duration / 60)}分${duration % 60}秒`;
    if (info.description?.trim())
        header += `\n简介：${info.description.slice(0, 300)}`;
    // Step 1: 尝试从 dump-json 中直接提取字幕
    const PREFERRED_LANGS = ["zh-Hans", "zh-CN", "zh", "zh-Hant", "zh-TW", "en"];
    const allSubs = { ...info.automatic_captions, ...info.subtitles };
    const langOrder = [...PREFERRED_LANGS, ...Object.keys(allSubs)];
    for (const lang of langOrder) {
        const tracks = allSubs[lang];
        if (!tracks?.length)
            continue;
        const track = tracks.find((t) => t.ext === "json3") ??
            tracks.find((t) => t.ext === "vtt") ??
            tracks[0];
        try {
            const text = await parseSubtitleText(track.url, track.ext);
            if (text) {
                const wordCount = text.split(/\s+/).filter(Boolean).length;
                console.error(`[OpenClaw] 字幕获取成功 (${lang}, ${wordCount} 词)`);
                const fullText = `${header}\n字幕来源：yt-dlp (${lang})\n字数：约 ${wordCount}${GUIDE}\n\n---\n\n${text.slice(0, MAX_CONTENT_LENGTH)}`;
                return { text: fullText, title, author, contentType: "video", platform: detectPlatform(url), wordCount };
            }
        }
        catch { /* try next track */ }
    }
    // Step 2: 无字幕 → yt-dlp 下载音频 → Gemini 转文字+总结
    console.error("[OpenClaw] 无可用字幕，尝试 Gemini 音频转录...");
    const COOKIE_HOSTS = ["douyin.com", "tiktok.com", "xiaohongshu.com"];
    const cookieArgs = COOKIE_HOSTS.some(h => url.includes(h)) ? ["--cookies-from-browser", "chrome"] : [];
    const geminiText = await transcribeAudio(url, title, author, cookieArgs);
    if (geminiText) {
        const fullText = `${header}\n字幕来源：Gemini 音频转录\n\n${geminiText}`;
        const wordCount = geminiText.split(/\s+/).filter(Boolean).length;
        return { text: fullText, title, author, contentType: "video", platform: detectPlatform(url), wordCount };
    }
    const failText = `${header}\n\n⚠️ 无可用字幕，Gemini 音频转录未能完成。\n请确认：1) 已安装 ffmpeg；2) 已设置 GEMINI_API_KEY。`;
    return { text: failText, title, author, contentType: "video", platform: detectPlatform(url), wordCount: 0 };
}
// ── 抖音备用方案 ────────────────────────────────────────────────────────────────
async function fetchDouyinFallback(url, awemeId, contentType) {
    const info = await fetchDouyinInfo(awemeId, contentType);
    const title = info?.title || `抖音${contentType === "note" ? "笔记" : "视频"} ${awemeId}`;
    const author = info?.author || "";
    const platform = "抖音";
    let header = `标题：${title}\nURL：${url}`;
    if (author)
        header += `\n作者：${author}`;
    if (info?.duration)
        header += `\n时长：${Math.floor(info.duration / 60)}分${info.duration % 60}秒`;
    header += `\n平台：抖音`;
    // 图文笔记：直接用正文走 Gemini 总结
    if (contentType === "note" && info?.noteText) {
        console.error(`[OpenClaw] 抖音图文笔记: ${title.slice(0, 40)}... (${info.noteText.length} 字)`);
        const geminiSummary = await summarizeText(info.noteText, title, author);
        if (geminiSummary) {
            const fullText = `${header}\n类型：图文笔记\n\n${geminiSummary}\n\n---\n\n## 原文\n\n${info.noteText}`;
            return { text: fullText, title, author, contentType: "article", platform, wordCount: info.noteText.length };
        }
        // Gemini 失败 fallback
        const fullText = `${header}\n类型：图文笔记${GUIDE}\n\n---\n\n${info.noteText}`;
        return { text: fullText, title, author, contentType: "article", platform, wordCount: info.noteText.length };
    }
    // 视频：下载音频 → Gemini 转录
    if (info?.videoUrl) {
        const audioFile = await downloadDouyinAudio(info.videoUrl);
        if (audioFile) {
            const geminiText = await transcribeFromFile(audioFile, title, author);
            if (geminiText) {
                const fullText = `${header}\n字幕来源：Gemini 音频转录\n\n${geminiText}`;
                const wordCount = geminiText.split(/\s+/).filter(Boolean).length;
                return { text: fullText, title, author, contentType: "video", platform, wordCount };
            }
        }
    }
    // 最后兜底
    return {
        text: `${header}\n\n⚠️ 抖音内容抓取失败。该内容可能有访问限制。`,
        title, author, contentType: contentType === "note" ? "article" : "video", platform, wordCount: 0,
    };
}
// ── 微信公众号直接抓取（不走 Jina，本地直连） ───────────────────────────────────
async function fetchWechatArticle(url) {
    console.error("[OpenClaw] 微信公众号：本地直连抓取...");
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
    });
    const html = await res.text();
    // 提取标题
    const titleMatch = html.match(/<h1[^>]*class="rich_media_title"[^>]*>([\s\S]*?)<\/h1>/);
    const title = titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim() || "微信公众号文章";
    // 提取作者
    const authorMatch = html.match(/var\s+(?:nickname|author)\s*=\s*"([^"]+)"/) ??
        html.match(/<span[^>]*class="rich_media_meta_text"[^>]*>([^<]+)</);
    const author = authorMatch?.[1]?.trim() || "";
    // 提取正文（js_content div 内的 HTML → 去标签）
    const contentMatch = html.match(/id="js_content"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<div[^>]*class="(?:rich_media_tool|ct_mpda))/);
    let content = "";
    if (contentMatch) {
        content = contentMatch[1]
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<\/h[1-6]>/gi, "\n\n")
            .replace(/<li[^>]*>/gi, "- ")
            .replace(/<\/li>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
    if (!content) {
        return {
            text: `标题：${title}\nURL：${url}\n平台：微信公众号\n\n⚠️ 无法提取正文内容（可能是微信反爬拦截）。`,
            title, author, contentType: "article", platform: "微信公众号", wordCount: 0,
        };
    }
    const wordCount = content.length;
    console.error(`[OpenClaw] 微信公众号抓取成功: ${title} (${wordCount} 字)`);
    let header = `标题：${title}\nURL：${url}`;
    if (author)
        header += `\n作者：${author}`;
    header += `\n平台：微信公众号\n字数：约 ${wordCount}`;
    // 通过 Gemini 做结构化总结
    const geminiSummary = await summarizeText(content, title, author);
    if (geminiSummary) {
        const text = `${header}\n\n${geminiSummary}\n\n---\n\n## 原文\n\n${content.slice(0, MAX_CONTENT_LENGTH)}`;
        return { text, title, author, contentType: "article", platform: "微信公众号", wordCount };
    }
    // Gemini 失败时 fallback：原文 + GUIDE 让 Claude 总结
    const text = `${header}${GUIDE}\n\n---\n\n${content.slice(0, MAX_CONTENT_LENGTH)}`;
    return { text, title, author, contentType: "article", platform: "微信公众号", wordCount };
}
//# sourceMappingURL=index.js.map