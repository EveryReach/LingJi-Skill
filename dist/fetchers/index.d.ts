/** fetchUrl 返回的结构化结果 */
export type FetchResult = {
    text: string;
    title: string;
    author: string;
    contentType: "video" | "article" | "generic";
    platform: string;
    wordCount: number;
};
/**
 * 统一内容抓取入口。
 * - 先用 yt-dlp --dump-json 探测：成功 → 视频路径；失败 → 网页文章路径（Jina Reader）。
 * - 视频路径：字幕优先，无字幕则 yt-dlp 下载音频 → Gemini 转文字+总结。
 */
export declare function fetchUrl(url: string): Promise<FetchResult>;
