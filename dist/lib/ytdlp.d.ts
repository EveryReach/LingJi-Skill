import type { YtDlpInfo } from "../types.js";
export declare const BIN_PATH: string;
export declare function ensureBinary(): Promise<void>;
export declare function dumpInfo(url: string, extraArgs?: string[]): Promise<YtDlpInfo>;
export declare function parseSubtitleText(url: string, ext: string): Promise<string>;
