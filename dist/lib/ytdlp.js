import { execFile } from "child_process";
import { access, chmod, mkdir, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, resolve } from "path";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
const BIN_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
export const BIN_PATH = resolve(homedir(), ".lingji", "bin", BIN_NAME);
let _ready = false;
function getPlatformAssetName() {
    if (process.platform === "darwin")
        return "yt-dlp_macos";
    if (process.platform === "win32")
        return "yt-dlp.exe";
    return process.arch === "arm64" ? "yt-dlp_linux_aarch64" : "yt-dlp_linux";
}
export async function ensureBinary() {
    if (_ready)
        return;
    const exists = await access(BIN_PATH).then(() => true).catch(() => false);
    if (!exists) {
        console.error("[OpenClaw] 首次使用 yt-dlp，正在从 GitHub 下载（约 15MB）...");
        await mkdir(dirname(BIN_PATH), { recursive: true });
        const release = (await fetch("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest", { headers: { "User-Agent": "lingji-mcp-server" } }).then((r) => r.json()));
        const assetName = getPlatformAssetName();
        const asset = release.assets.find((a) => a.name === assetName);
        if (!asset)
            throw new Error(`GitHub Releases 中未找到 ${assetName}`);
        const buf = await fetch(asset.browser_download_url).then((r) => r.arrayBuffer());
        await writeFile(BIN_PATH, Buffer.from(buf));
        await chmod(BIN_PATH, 0o755);
        console.error("[OpenClaw] yt-dlp 下载完成，已缓存至", BIN_PATH);
    }
    _ready = true;
}
/** 国内平台：绕过代理直连（避免代理 IP 被拦截） */
const DOMESTIC_HOSTS = ["bilibili.com", "douyin.com", "ixigua.com", "kuaishou.com", "xiaohongshu.com", "zhihu.com", "weibo.com"];
function isDomestic(url) {
    return DOMESTIC_HOSTS.some(h => url.includes(h));
}
export async function dumpInfo(url, extraArgs = []) {
    await ensureBinary();
    // 国内站点绕过系统代理（--proxy "" 表示直连）
    const proxyArgs = isDomestic(url) ? ["--proxy", ""] : [];
    const { stdout } = await execFileAsync(BIN_PATH, ["--dump-json", "--no-warnings", ...proxyArgs, ...extraArgs, url], { timeout: 60_000 });
    return JSON.parse(stdout);
}
export async function parseSubtitleText(url, ext) {
    const raw = await fetch(url).then((r) => r.text());
    if (ext === "json3" || (ext !== "vtt" && ext !== "srt" && raw.trimStart().startsWith("{"))) {
        const json = JSON.parse(raw);
        return (json.events
            ?.flatMap((e) => e.segs?.map((s) => s.utf8 ?? "") ?? [])
            .filter(Boolean)
            .join(" ")
            .trim() ?? "");
    }
    // VTT / SRT: strip timestamps and tags, keep plain text
    return raw
        .replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}/g, "")
        .replace(/^WEBVTT\s*/m, "")
        .replace(/^\d+\s*$/gm, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{2,}/g, " ")
        .trim();
}
//# sourceMappingURL=ytdlp.js.map