/**
 * 飞书多维表格 API 模块
 * - 认证：App ID + App Secret → tenant_access_token（2 小时有效）
 * - 写入：POST /bitable/v1/.../records
 * - 搜索：POST /bitable/v1/.../records/search
 */
export type FeishuRecord = {
    title: string;
    url: string;
    author: string;
    contentType: "video" | "article";
    platform: string;
    summary: string;
    content: string;
    wordCount: number;
};
export declare function createRecord(record: FeishuRecord): Promise<string>;
export type DateRange = "TheLastWeek" | "TheLastMonth" | "Today" | "LastWeek" | "LastMonth";
type FeishuSearchResult = {
    items?: Array<{
        fields: Record<string, unknown>;
        record_id: string;
    }>;
    total?: number;
};
export type SearchOptions = {
    keyword?: string;
    dateRange?: DateRange;
    contentType?: "video" | "article";
    limit?: number;
};
export declare function searchRecords(opts: SearchOptions): Promise<FeishuSearchResult>;
export {};
