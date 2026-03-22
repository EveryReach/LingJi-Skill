export type GenericResult = {
    title: string;
    author: string;
    content: string;
    wordCount: number;
};
export declare function fetchGeneric(url: string): Promise<GenericResult>;
