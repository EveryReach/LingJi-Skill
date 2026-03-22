import { access } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
const isWin = process.platform === "win32";
const COMMON_PATHS = isWin
    ? [
        "C:\\ffmpeg\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe",
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
    ]
    : ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
export async function findFfmpegBin() {
    // 优先用系统 PATH 中的 ffmpeg
    try {
        const cmd = isWin ? "where" : "which";
        const { stdout } = await execFileAsync(cmd, ["ffmpeg"], { timeout: 5_000 });
        const p = stdout.trim().split(/\r?\n/)[0]; // Windows `where` 可能输出多行
        if (p)
            return p;
    }
    catch { /* 继续检查常见路径 */ }
    for (const p of COMMON_PATHS) {
        if (await access(p).then(() => true).catch(() => false))
            return p;
    }
    return null;
}
//# sourceMappingURL=ffmpeg.js.map