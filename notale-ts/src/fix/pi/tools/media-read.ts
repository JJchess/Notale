// Notale addition to the pi fork: what `read` does with a PDF, a video or other binary. The model
// gets the file natively when it can (Kimi Code's way for video: upload, keep the reference, wrap it
// in <video path=...>), and otherwise the best it can take -- text and page images of a PDF,
// keyframes of a video, or just the facts -- so a turn never stops on an unreadable file. Kept
// identical in notale-ts and notale-editor (tools/check-istar-sync.mjs).
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { MediaUploader } from "../ai/gemini-files.js";
import type { Api, FileContent, ImageContent, Model, TextContent } from "../ai/types.js";
import { pdfPageImages, pdfPages, pdfSlice, pdfText, probeVideo, videoFrames } from "./media-fallback.js";
import { sniff } from "./media-sniff.js";

export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
/** Claude Code's Read: a PDF over 10 pages needs a range, and a call reads at most 20. */
export const PDF_DEFAULT_PAGES = 10, PDF_MAX_PAGES = 20;

export interface MediaReadOptions {
	/** Makes a file sendable natively (Gemini's Files API). Without one, files are never sent natively. */
	uploader?: MediaUploader;
	/** Where derived files go (PDF slices, frames, page images): a scratch directory, not the deck. */
	scratch: string;
}
type Block = TextContent | ImageContent | FileContent;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const reason = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Parses "3-5" or "7" against a document of `total` pages. */
export function pageRange(pages: string | undefined, total: number): { first: number; last: number } {
	if (!pages?.trim()) return { first: 1, last: Math.min(total, PDF_DEFAULT_PAGES) };
	const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(pages);
	if (!match) throw new Error(`pages must look like "3-5" or "7", not "${pages}"`);
	const first = Number(match[1]), last = Number(match[2] ?? match[1]);
	if (first < 1 || last < first || first > total) throw new Error(`pages ${pages} is outside 1-${total}`);
	if (last - first + 1 > PDF_MAX_PAGES) throw new Error(`at most ${PDF_MAX_PAGES} pages per read; asked for ${last - first + 1}`);
	return { first, last: Math.min(last, total) };
}

/** Content for a file that is not text or an image, or undefined when it is text (read goes on as usual). */
export async function readMedia(absolutePath: string, shownPath: string, pages: string | undefined, model: Model<Api> | undefined, options: MediaReadOptions, signal?: AbortSignal): Promise<Block[] | undefined> {
	const sniffed = await sniff(absolutePath);
	if (sniffed.kind === "text") return undefined;
	if (sniffed.kind === "binary") return [{ type: "text", text: `[${shownPath} is a binary file, not text, an image, a PDF or a video. Inspect it with bash if needed (file, unzip -l, python).]` }];
	const { size, mtimeMs } = await stat(absolutePath);
	if (size === 0) throw new Error(`${shownPath} is empty`);
	if (size > MAX_MEDIA_BYTES) throw new Error(`${shownPath} is ${mb(size)}; files over ${mb(MAX_MEDIA_BYTES)} cannot be read`);
	const input = model?.input ?? ["text", "image"];
	const key = createHash("sha256").update(`${absolutePath}\n${mtimeMs}\n${pages ?? ""}`).digest("hex").slice(0, 16);
	const scratch = (what: string) => join(options.scratch, `${key}-${what}`);

	if (sniffed.kind === "pdf") {
		const total = await pdfPages(absolutePath);
		if (!total) throw new Error(`${shownPath} could not be opened as a PDF`);
		const { first, last } = pageRange(pages, total);
		const whole = first === 1 && last === total;
		const note = whole ? `${total} pages` : `pages ${first}-${last} of ${total}${pages ? "" : `; read more with pages="${last + 1}-${Math.min(total, last + PDF_DEFAULT_PAGES)}"`}`;
		const header = `Read PDF ${shownPath} (${mb(size)}, ${note})`;
		if (input.includes("pdf") && options.uploader) {
			try {
				let path = absolutePath, bytes = size;
				if (!whole) { path = scratch("pages.pdf"); await pdfSlice(absolutePath, first, last, path, scratch("split")); bytes = (await stat(path)).size; }
				const part: FileContent = { type: "file", mimeType: "application/pdf", path, name: shownPath, bytes, pages: last - first + 1 };
				await options.uploader.prepare(part, signal);
				return [{ type: "text", text: header }, { type: "text", text: `<document path="${shownPath}">` }, part, { type: "text", text: "</document>" }];
			} catch (cause) {
				if (signal?.aborted) throw cause;
				return pdfFallback(`${header}\n[Could not send the PDF itself (${reason(cause)}); here are its text and pages instead.]`);
			}
		}
		return pdfFallback(header);
		async function pdfFallback(text: string): Promise<Block[]> {
			const blocks: Block[] = [{ type: "text", text }, { type: "text", text: `<document path="${shownPath}">` }, { type: "text", text: (await pdfText(absolutePath, first, last)).trim() || "(no extractable text; possibly scanned)" }];
			if (input.includes("image")) for (const page of await pdfPageImages(absolutePath, first, last, scratch("pages"))) blocks.push({ type: "text", text: `Page ${page.page}:` }, { type: "image", data: page.data, mimeType: page.mimeType });
			blocks.push({ type: "text", text: "</document>" });
			return blocks;
		}
	}

	const info = await probeVideo(absolutePath);
	const facts = [sniffed.mimeType, mb(size), info.seconds !== undefined ? `${info.seconds} s` : "", info.width ? `${info.width}x${info.height}` : ""].filter(Boolean).join(", ");
	const header = `Read video ${shownPath} (${facts})`;
	const frames = async (text: string): Promise<Block[]> => {
		const shots = await videoFrames(absolutePath, scratch("frames"), { ...(info.seconds !== undefined ? { seconds: info.seconds } : {}) });
		return [{ type: "text", text: `${text}\n[${shots.length} keyframes follow, each with its time; the audio is not transcribed. For a closer look at a moment, extract frames with ffmpeg in bash and read them.]` },
			{ type: "text", text: `<video path="${shownPath}">` },
			...shots.flatMap((shot): Block[] => [{ type: "text", text: `t=${shot.seconds}s` }, { type: "image", data: shot.data, mimeType: shot.mimeType }]),
			{ type: "text", text: "</video>" }];
	};
	if (input.includes("video") && options.uploader) {
		const part: FileContent = { type: "file", mimeType: sniffed.mimeType, path: absolutePath, name: shownPath, bytes: size, ...(info.seconds !== undefined ? { seconds: info.seconds } : {}) };
		try {
			await options.uploader.prepare(part, signal);
			return [{ type: "text", text: `${header}\n[If you make or edit images or video with a script, read the result back before going on.]` },
				{ type: "text", text: `<video path="${shownPath}">` }, part, { type: "text", text: "</video>" }];
		} catch (cause) {
			if (signal?.aborted) throw cause;
			if (input.includes("image")) return frames(`${header}\n[Could not send the video itself (${reason(cause)}).]`);
			return [{ type: "text", text: `${header}\n[Could not send the video (${reason(cause)}), and this model does not see images. Tell the author.]` }];
		}
	}
	if (input.includes("image")) return frames(header);
	return [{ type: "text", text: `${header}\n[The current model cannot watch video or see images. Tell the author.]` }];
}
