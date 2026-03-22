const MAX_CONTENT_LENGTH = 48_000;
export async function fetchGeneric(url) {
    const r = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: "application/json", "X-No-Cache": "true" },
    });
    if (!r.ok)
        throw new Error(`Jina HTTP ${r.status}`);
    const d = (await r.json());
    if (!d.data?.content)
        throw new Error("内容为空");
    const content = d.data.content.slice(0, MAX_CONTENT_LENGTH);
    const title = d.data.title || url;
    const author = d.data.author || inferAuthor(url, title);
    return {
        title,
        author,
        content,
        wordCount: content.split(/\s+/).filter(Boolean).length,
    };
}
/** Jina 不返回 author 时，从 URL 或 title 中推断 */
function inferAuthor(url, title) {
    // X/Twitter: title 格式 "Name (@handle) on X: ..." 或 "Name on X: ..."
    if (url.includes("x.com") || url.includes("twitter.com")) {
        const m = title.match(/^(.+?)\s+(?:\(@?\w+\)\s+)?on X:/);
        if (m)
            return m[1].trim();
    }
    // GitHub: URL 格式 github.com/owner/repo
    if (url.includes("github.com")) {
        const m = url.match(/github\.com\/([^/]+)\//);
        if (m)
            return m[1];
    }
    return "";
}
//# sourceMappingURL=generic.js.map