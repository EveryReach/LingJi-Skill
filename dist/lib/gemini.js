import { access, mkdir, unlink } from "fs/promises";
import { execFile } from "child_process";
import { homedir } from "os";
import { resolve } from "path";
import { promisify } from "util";
import { ensureBinary, BIN_PATH } from "./ytdlp.js";
import { findFfmpegBin } from "./ffmpeg.js";
const execFileAsync = promisify(execFile);
const MODEL = "gemini-2.5-flash";
const TMP_DIR = resolve(homedir(), ".lingji", "tmp");
const PKM_FRAMEWORK = `请按以下框架输出，每个部分都要言之有物，不要废话：

## 一句话核心
用一句话（≤40字）说清楚：这个内容的核心主张、方法或发现是什么？
（这是整个分析最重要的部分，要直击本质）

## 为什么值得留存
这个内容解决了什么具体问题？提供了什么别处难以找到的视角或方法？
（2-3句，回答"我为什么要把它存下来"）

## 精华洞见
列出3-5个最有价值的洞见或方法，每条要包含具体细节，不要泛泛而谈：
- 【洞见名称】具体说明（含关键细节、数据、步骤或反直觉之处）

## 可立即行动的建议
看完后可以直接做的事（1-3条）。如果内容偏理论或无明显行动项，跳过此节。

## 值得记住的原话或案例
1-2个最值得记住的金句、数据或具体案例（尽量贴近原文）。

## 背景标注
- 适合人群：（谁最该看这个）
- 内容类型：（教程/观点/案例/访谈/其他）
- 标签：（3-5个，小写，逗号分隔）`;
function buildAudioPrompt(title, author) {
    return `你是一个顶级的知识内容策展人，专为个人知识管理（PKM）服务。
你的任务不是简单转录或摘要，而是像一个聪明的朋友看完这个视频后，用最精炼的方式告诉我：「这个视频值得留存的精华到底是什么，我以后怎么用它」。

视频标题：${title}
作者：${author || "未知"}

${PKM_FRAMEWORK}

---

## 完整转录
（将音频中的语音逐字转录，保持原始语言，用于后续精确检索）`;
}
function buildTextPrompt(title, author) {
    return `你是一个顶级的知识内容策展人，专为个人知识管理（PKM）服务。
你的任务不是简单摘要，而是像一个聪明的朋友看完这篇文章后，用最精炼的方式告诉我：「这篇文章值得留存的精华到底是什么，我以后怎么用它」。

文章标题：${title}
作者：${author || "未知"}

${PKM_FRAMEWORK}`;
}
async function uploadAndAnalyze(audioFile, title, author, apiKey) {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const { GoogleAIFileManager } = await import("@google/generative-ai/server");
    const genAI = new GoogleGenerativeAI(apiKey);
    const fileManager = new GoogleAIFileManager(apiKey);
    console.error("[OpenClaw] 上传音频至 Gemini File API...");
    const { file } = await fileManager.uploadFile(audioFile, {
        mimeType: "audio/mpeg",
        displayName: title,
    });
    try {
        const model = genAI.getGenerativeModel({ model: MODEL });
        const result = await model.generateContent([
            buildAudioPrompt(title, author),
            { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
        ]);
        console.error("[OpenClaw] Gemini 音频分析完成");
        return result.response.text() || null;
    }
    finally {
        await fileManager.deleteFile(file.name).catch((e) => console.error("[OpenClaw] 删除 Gemini 临时文件失败:", e));
    }
}
/** Download audio via yt-dlp → upload to Gemini → transcribe and summarize. */
export async function transcribeAudio(url, title, author, extraArgs = []) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("[OpenClaw] 未设置 GEMINI_API_KEY");
        return null;
    }
    const ffmpegBin = await findFfmpegBin();
    if (!ffmpegBin) {
        console.error("[OpenClaw] 未找到 ffmpeg（brew install ffmpeg）");
        return null;
    }
    await ensureBinary();
    await mkdir(TMP_DIR, { recursive: true });
    const audioBase = resolve(TMP_DIR, `ytaudio-${Date.now()}`);
    const audioFile = `${audioBase}.mp3`;
    try {
        console.error("[OpenClaw] 下载音频为 MP3...");
        await execFileAsync(BIN_PATH, [
            "--extract-audio", "--audio-format", "mp3", "--audio-quality", "5",
            "--ffmpeg-location", ffmpegBin,
            "-o", `${audioBase}.%(ext)s`,
            "--no-playlist", "--no-warnings",
            // 国内站点绕过代理直连
            ...(["bilibili.com", "douyin.com", "ixigua.com", "kuaishou.com", "xiaohongshu.com"].some(h => url.includes(h)) ? ["--proxy", ""] : []),
            ...extraArgs,
            url,
        ], { timeout: 180_000 });
        if (!(await access(audioFile).then(() => true).catch(() => false))) {
            console.error("[OpenClaw] MP3 未生成，转码失败");
            return null;
        }
        return await uploadAndAnalyze(audioFile, title, author, apiKey);
    }
    catch (e) {
        console.error("[OpenClaw] 音频处理失败:", e);
        return null;
    }
    finally {
        await unlink(audioFile).catch(() => { });
    }
}
/** Transcribe from an existing local audio file → upload to Gemini → summarize. */
export async function transcribeFromFile(audioFile, title, author) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("[OpenClaw] 未设置 GEMINI_API_KEY");
        return null;
    }
    try {
        const result = await uploadAndAnalyze(audioFile, title, author, apiKey);
        return result;
    }
    catch (e) {
        console.error("[OpenClaw] Gemini 转录失败:", e);
        return null;
    }
    finally {
        await unlink(audioFile).catch(() => { });
    }
}
/** Summarize article text via Gemini (same PKM framework as audio, no transcription). */
export async function summarizeText(text, title, author) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error("[OpenClaw] 未设置 GEMINI_API_KEY");
        return null;
    }
    try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL });
        console.error("[OpenClaw] 文章发送至 Gemini 进行结构化总结...");
        const result = await model.generateContent([
            buildTextPrompt(title, author),
            `以下是文章全文：\n\n${text.slice(0, 100_000)}`,
        ]);
        console.error("[OpenClaw] Gemini 文章总结完成");
        return result.response.text() || null;
    }
    catch (e) {
        console.error("[OpenClaw] Gemini 文章总结失败:", e);
        return null;
    }
}
//# sourceMappingURL=gemini.js.map