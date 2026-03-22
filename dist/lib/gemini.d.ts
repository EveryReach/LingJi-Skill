/** Download audio via yt-dlp → upload to Gemini → transcribe and summarize. */
export declare function transcribeAudio(url: string, title: string, author: string, extraArgs?: string[]): Promise<string | null>;
/** Transcribe from an existing local audio file → upload to Gemini → summarize. */
export declare function transcribeFromFile(audioFile: string, title: string, author: string): Promise<string | null>;
/** Summarize article text via Gemini (same PKM framework as audio, no transcription). */
export declare function summarizeText(text: string, title: string, author: string): Promise<string | null>;
