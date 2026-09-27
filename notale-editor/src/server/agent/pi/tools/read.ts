// Forked from earendil-works/pi packages/coding-agent/src/core/tools/read.ts@fde38ed (MIT). Trimmed for the notale editor.
// Produces a plain AgentTool (no ToolDefinition/ExtensionContext, renderers or prompt snippets); images go through sharp.
import { constants } from "node:fs";
import { access as fsAccess, readFile as fsReadFile } from "node:fs/promises";
import { type Static, Type } from "typebox";
import type { AgentTool } from "../agent/types.js";
import type { Api, FileContent, ImageContent, Model, TextContent } from "../ai/types.js";
import { type MediaReadOptions, PDF_DEFAULT_PAGES, PDF_MAX_PAGES, readMedia } from "./media-read.js";
import { type ImageResizeOptions, processImage } from "./image.js";
import { detectSupportedImageMimeTypeFromFile } from "./mime.js";
import { resolveReadPathAsync } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult, truncateHead } from "./truncate.js";

const readSchema = Type.Object({
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
	pages: Type.Optional(Type.String({ description: `PDF only: a page range like "3-5" or "7". Defaults to the first ${PDF_DEFAULT_PAGES} pages; at most ${PDF_MAX_PAGES} per call.` })),
});

export type ReadToolInput = Static<typeof readSchema>;

export interface ReadToolDetails {
	truncation?: TruncationResult;
}

/**
 * Pluggable operations for the read tool.
 * Override these to delegate file reading to remote systems (for example SSH).
 */
export interface ReadOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Check if file is readable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
	/** Detect image MIME type, return null or undefined for non-images */
	detectImageMimeType?: (absolutePath: string) => Promise<string | null | undefined>;
}

const defaultReadOperations: ReadOperations = {
	readFile: (path) => fsReadFile(path),
	access: (path) => fsAccess(path, constants.R_OK),
	detectImageMimeType: detectSupportedImageMimeTypeFromFile,
};

export interface ReadToolOptions {
	/** Whether to auto-resize images. Default: true */
	autoResizeImages?: boolean;
	/** Resize profile. Default: fit within 2000x2000. */
	resizeOptions?: ImageResizeOptions;
	/**
	 * Model the tool result goes to (upstream reads it from ExtensionContext). When it has no
	 * image input, a text note says the image will be omitted.
	 */
	model?: Model<Api> | (() => Model<Api> | undefined);
	/** Custom operations for file reading. Default: local filesystem */
	operations?: ReadOperations;
	/** PDFs and video (Notale addition). Without it, read treats every non-image file as text, as pi does. */
	media?: MediaReadOptions;
}

function getNonVisionImageNote(model: Model<Api> | undefined): string | undefined {
	if (!model || model.input.includes("image")) {
		return undefined;
	}
	return "[Current model does not support images. The image will be omitted from this request.]";
}

export function createReadTool(cwd: string, options?: ReadToolOptions): AgentTool<typeof readSchema, ReadToolDetails | undefined> {
	const autoResizeImages = options?.autoResizeImages ?? true;
	const resizeOptions = options?.resizeOptions;
	const getModel = () => (typeof options?.model === "function" ? options.model() : options?.model);
	const ops = options?.operations ?? defaultReadOperations;
	return {
		name: "read",
		label: "read",
		description: `Read the contents of a file. Supports text files and images (jpg, png, gif, webp, bmp)${options?.media ? ", PDFs (use pages for long ones) and videos (mp4, mov, webm)" : ""}. Images${options?.media ? ", PDFs and videos" : ""} are sent as attachments${options?.media ? " when the model reads them natively, otherwise as extracted text, page images or keyframes" : ""}. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
		parameters: readSchema,
		constrainedSampling: { type: "json_schema", strict: "prefer" },
		async execute(_toolCallId, { path, offset, limit, pages }, signal) {
			return new Promise<{ content: (TextContent | ImageContent | FileContent)[]; details: ReadToolDetails | undefined }>(
				(resolve, reject) => {
					if (signal?.aborted) {
						reject(new Error("Operation aborted"));
						return;
					}
					let aborted = false;
					const onAbort = () => {
						aborted = true;
						reject(new Error("Operation aborted"));
					};
					signal?.addEventListener("abort", onAbort, { once: true });

					(async () => {
						try {
							const absolutePath = await resolveReadPathAsync(path, cwd);
							if (aborted) return;
							// Check if file exists and is readable.
							await ops.access(absolutePath);
							if (aborted) return;
							const mimeType = ops.detectImageMimeType ? await ops.detectImageMimeType(absolutePath) : undefined;
							let content: (TextContent | ImageContent | FileContent)[];
							let details: ReadToolDetails | undefined;
							const nonVisionImageNote = getNonVisionImageNote(getModel());
							// A PDF, a video or other binary (media-read.ts); undefined for text.
							const media = !mimeType && options?.media ? await readMedia(absolutePath, path, pages, getModel(), options.media, signal) : undefined;
							if (mimeType) {
								// Read image as binary.
								const buffer = await ops.readFile(absolutePath);
								const processed = await processImage(buffer, mimeType, {
									autoResizeImages,
									...(resizeOptions && { resizeOptions }),
								});
								if (!processed.ok) {
									let textNote = `Read image file [${mimeType}]\n${processed.message}`;
									if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
									content = [{ type: "text", text: textNote }];
								} else {
									let textNote = `Read image file [${processed.mimeType}]`;
									if (processed.hints.length > 0) textNote += `\n${processed.hints.join("\n")}`;
									if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
									content = [
										{ type: "text", text: textNote },
										{ type: "image", data: processed.data, mimeType: processed.mimeType },
									];
								}
							} else if (media) {
								content = media;
							} else {
								// Read text content.
								const buffer = await ops.readFile(absolutePath);
								const textContent = buffer.toString("utf-8");
								const allLines = textContent.split("\n");
								const totalFileLines = allLines.length;
								// Apply offset if specified. Convert from 1-indexed input to 0-indexed array access.
								const startLine = offset ? Math.max(0, offset - 1) : 0;
								const startLineDisplay = startLine + 1;
								// Check if offset is out of bounds.
								if (startLine >= allLines.length) {
									throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
								}
								let selectedContent: string;
								let userLimitedLines: number | undefined;
								// If limit is specified by the user, honor it first. Otherwise truncateHead decides.
								if (limit !== undefined) {
									const endLine = Math.min(startLine + limit, allLines.length);
									selectedContent = allLines.slice(startLine, endLine).join("\n");
									userLimitedLines = endLine - startLine;
								} else {
									selectedContent = allLines.slice(startLine).join("\n");
								}
								// Apply truncation, respecting both line and byte limits.
								const truncation = truncateHead(selectedContent);
								let outputText: string;
								if (truncation.firstLineExceedsLimit) {
									// First line alone exceeds the byte limit. Point the model at a bash fallback.
									const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine] ?? "", "utf-8"));
									outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${path} | head -c ${DEFAULT_MAX_BYTES}]`;
									details = { truncation };
								} else if (truncation.truncated) {
									// Truncation occurred. Build an actionable continuation notice.
									const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
									const nextOffset = endLineDisplay + 1;
									outputText = truncation.content;
									if (truncation.truncatedBy === "lines") {
										outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
									} else {
										outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
									}
									details = { truncation };
								} else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
									// User-specified limit stopped early, but the file still has more content.
									const remaining = allLines.length - (startLine + userLimitedLines);
									const nextOffset = startLine + userLimitedLines + 1;
									outputText = `${truncation.content}\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
								} else {
									// No truncation and no remaining user-limited content.
									outputText = truncation.content;
								}
								content = [{ type: "text", text: outputText }];
							}

							if (aborted) return;
							signal?.removeEventListener("abort", onAbort);
							resolve({ content, details });
						} catch (error: any) {
							signal?.removeEventListener("abort", onAbort);
							if (!aborted) reject(error);
						}
					})();
				},
			);
		},
	};
}
