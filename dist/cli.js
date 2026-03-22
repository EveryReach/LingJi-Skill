/**
 * OpenClaw CLI
 *
 * 用法：
 *   npx tsx src/cli.ts fetch <url>              抓取内容并保存到飞书
 *   npx tsx src/cli.ts search [选项]             搜索飞书知识库
 *     --week                                    最近一周
 *     --month                                   最近一个月
 *     --today                                   今天
 *     --type video|article                      按类型筛选
 *     --limit N                                 返回条数（默认 20）
 *     <关键词>                                   按标题搜索
 *
 * 环境变量：
 *   GEMINI_API_KEY           — 必需（无字幕视频的音频转录）
 *   FEISHU_APP_ID            — 飞书应用 App ID
 *   FEISHU_APP_SECRET        — 飞书应用 App Secret
 *   FEISHU_BITABLE_APP_TOKEN — 多维表格 App Token
 *   FEISHU_BITABLE_TABLE_ID  — 多维表格 Table ID
 */
import { fetchUrl } from "./fetchers/index.js";
import { createRecord, searchRecords } from "./lib/feishu.js";
const [command, ...args] = process.argv.slice(2);
if (!command || command === "--help" || command === "-h") {
    console.log(`OpenClaw - 智能内容抓取与知识提炼

用法:
  npx tsx src/cli.ts fetch <url>         抓取并保存到飞书
  npx tsx src/cli.ts search [选项]        搜索知识库
    --week                               最近一周
    --month                              最近一个月
    --today                              今天
    --type video|article                 按类型
    --limit N                            条数
    <关键词>                              按标题搜`);
    process.exit(0);
}
if (command === "fetch") {
    await handleFetch(args[0]);
}
else if (command === "search") {
    await handleSearch(args);
}
else {
    // 兼容：直接传 URL 也当 fetch 用
    if (command.startsWith("http")) {
        await handleFetch(command);
    }
    else {
        console.error(`未知命令: ${command}，用 --help 查看帮助`);
        process.exit(1);
    }
}
// ── fetch ───────────────────────────────────────────────────────────────────────
async function handleFetch(url) {
    if (!url) {
        console.error("用法: npx tsx src/cli.ts fetch <url>");
        process.exit(1);
    }
    console.error(`[OpenClaw] 抓取: ${url}\n`);
    const result = await fetchUrl(url);
    const summary = extractSummary(result.text);
    // 输出内容
    console.log(result.text);
    // 保存到飞书
    try {
        const recordId = await createRecord({
            title: result.title,
            url,
            author: result.author,
            contentType: result.contentType === "article" ? "article" : "video",
            platform: result.platform,
            summary,
            content: result.text,
            wordCount: result.wordCount,
        });
        console.error(`\n[OpenClaw] 已保存到飞书 (record_id: ${recordId})`);
    }
    catch (e) {
        console.error(`\n[OpenClaw] 飞书保存失败: ${e instanceof Error ? e.message : e}`);
    }
}
// ── search ──────────────────────────────────────────────────────────────────────
async function handleSearch(args) {
    const opts = {};
    const keywords = [];
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--week")
            opts.dateRange = "TheLastWeek";
        else if (arg === "--month")
            opts.dateRange = "TheLastMonth";
        else if (arg === "--today")
            opts.dateRange = "Today";
        else if (arg === "--type" && args[i + 1]) {
            opts.contentType = args[++i];
        }
        else if (arg === "--limit" && args[i + 1]) {
            opts.limit = parseInt(args[++i]);
        }
        else if (!arg.startsWith("--"))
            keywords.push(arg);
    }
    if (keywords.length > 0)
        opts.keyword = keywords.join(" ");
    console.error("[OpenClaw] 搜索知识库...\n");
    try {
        const result = await searchRecords(opts);
        if (!result.items?.length) {
            console.log("未找到匹配的记录。");
            return;
        }
        console.log(`找到 ${result.total ?? result.items.length} 条记录：\n`);
        for (const item of result.items) {
            const f = item.fields;
            const title = extractText(f["标题"]);
            const url = f["URL"]?.link || "";
            const type = extractText(f["类型"]);
            const summary = extractText(f["摘要"]);
            const time = f["抓取时间"];
            const date = time ? new Date(time).toLocaleDateString("zh-CN") : "";
            console.log(`  ${title}`);
            console.log(`    ${date} | ${type} | ${url}`);
            if (summary)
                console.log(`    ${summary.slice(0, 100)}...`);
            console.log();
        }
    }
    catch (e) {
        console.error(`[OpenClaw] 搜索失败: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
    }
}
// ── 工具函数 ────────────────────────────────────────────────────────────────────
/** 飞书字段值可能是 string、富文本对象数组、或其他，统一提取纯文本 */
function extractText(val) {
    if (typeof val === "string")
        return val;
    if (Array.isArray(val))
        return val.map((v) => v.text ?? "").join("");
    if (val && typeof val === "object" && "text" in val)
        return val.text;
    return String(val ?? "");
}
/**
 * 从抓取内容中提取摘要：
 * - Gemini 结构化输出 → 提取"一句话核心"到"可立即行动的建议"之间的全部内容
 * - 纯字幕/文章 → 取前 2000 字
 */
function extractSummary(text) {
    // 尝试提取 Gemini 结构化输出的核心部分（从"一句话核心"到"完整转录"之前）
    const startMarkers = ["## 一句话核心", "## 为什么值得留存"];
    const endMarkers = ["## 完整转录", "---\n\n"];
    let startIdx = -1;
    for (const m of startMarkers) {
        const idx = text.indexOf(m);
        if (idx !== -1) {
            startIdx = idx;
            break;
        }
    }
    if (startIdx !== -1) {
        let endIdx = text.length;
        for (const m of endMarkers) {
            const idx = text.indexOf(m, startIdx + 100);
            if (idx !== -1 && idx < endIdx)
                endIdx = idx;
        }
        return text.slice(startIdx, endIdx).trim();
    }
    // 非结构化内容：跳过 header，取正文前 2000 字
    const divider = text.indexOf("---\n\n");
    const body = divider !== -1 ? text.slice(divider + 5) : text;
    return body.slice(0, 2000).trim();
}
//# sourceMappingURL=cli.js.map