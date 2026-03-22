/**
 * 飞书多维表格 API 模块
 * - 认证：App ID + App Secret → tenant_access_token（2 小时有效）
 * - 写入：POST /bitable/v1/.../records
 * - 搜索：POST /bitable/v1/.../records/search
 */
const BASE = "https://open.feishu.cn/open-apis";
let cachedToken = null;
function getEnv(name) {
    const val = process.env[name];
    if (!val)
        throw new Error(`缺少环境变量 ${name}`);
    return val;
}
function getAppToken() { return getEnv("FEISHU_BITABLE_APP_TOKEN"); }
function getTableId() { return getEnv("FEISHU_BITABLE_TABLE_ID"); }
// ── 认证 ───────────────────────────────────────────────────────────────────────
async function getTenantToken() {
    if (cachedToken && Date.now() < cachedToken.expiresAt)
        return cachedToken.token;
    const appId = getEnv("FEISHU_APP_ID");
    const appSecret = getEnv("FEISHU_APP_SECRET");
    const res = await fetch(`${BASE}/auth/v3/tenant_access_token/internal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = (await res.json());
    if (data.code !== 0 || !data.tenant_access_token) {
        throw new Error(`飞书认证失败: ${data.msg || "unknown"}`);
    }
    cachedToken = {
        token: data.tenant_access_token,
        expiresAt: Date.now() + (data.expire - 60) * 1000, // 提前 60 秒刷新
    };
    return cachedToken.token;
}
async function feishuFetch(path, body) {
    const token = await getTenantToken();
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const data = (await res.json());
    if (data.code !== 0)
        throw new Error(`飞书 API 错误: ${data.msg || `code ${data.code}`}`);
    return data.data;
}
export async function createRecord(record) {
    const appToken = getAppToken();
    const tableId = getTableId();
    const data = (await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records`, {
        fields: {
            "标题": record.title,
            "URL": { link: record.url, text: record.url },
            "作者": record.author,
            "类型": record.contentType,
            "平台": record.platform,
            "摘要": record.summary,
            "完整内容": record.content.slice(0, 50_000),
            "字数": record.wordCount,
            "抓取时间": Date.now(),
        },
    }));
    return data.record.record_id;
}
export async function searchRecords(opts) {
    const appToken = getAppToken();
    const tableId = getTableId();
    const conditions = [];
    if (opts.dateRange) {
        conditions.push({
            field_name: "抓取时间",
            operator: "is",
            value: [opts.dateRange],
        });
    }
    if (opts.contentType) {
        conditions.push({
            field_name: "类型",
            operator: "is",
            value: [opts.contentType],
        });
    }
    if (opts.keyword) {
        conditions.push({
            field_name: "标题",
            operator: "contains",
            value: [opts.keyword],
        });
    }
    const body = {
        page_size: opts.limit ?? 20,
        automatic_fields: true,
    };
    if (conditions.length > 0) {
        body.filter = { conjunction: "and", conditions };
    }
    // 按抓取时间倒序
    body.sort = [{ field_name: "抓取时间", desc: true }];
    return (await feishuFetch(`/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`, body));
}
//# sourceMappingURL=feishu.js.map