export type YtDlpInfo = {
    title?: string;
    uploader?: string;
    description?: string;
    duration?: number;
    subtitles?: Record<string, Array<{
        url: string;
        ext: string;
    }>>;
    automatic_captions?: Record<string, Array<{
        url: string;
        ext: string;
    }>>;
};
