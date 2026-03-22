export type DouyinInfo = {
    type: "video" | "note";
    title: string;
    author: string;
    duration: number;
    videoUrl: string;
    noteText: string;
};
/** 从抖音短链接或标准 URL 中提取 aweme_id 和内容类型 */
export declare function extractAwemeId(url: string): {
    id: string;
    type: "video" | "note";
} | null;
/** 通过移动端分享页面获取内容信息（无需 cookies） */
export declare function fetchDouyinInfo(awemeId: string, contentType: "video" | "note"): Promise<DouyinInfo | null>;
/** 从视频直链下载音频 → 返回 MP3 路径 */
export declare function downloadDouyinAudio(videoUrl: string): Promise<string | null>;
