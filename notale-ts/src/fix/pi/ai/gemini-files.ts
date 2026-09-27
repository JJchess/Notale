// Notale addition to the pi fork: documents and video for Gemini, the way Kimi Code sends video to
// its Files API (kimi-cli kosong/chat_provider/kimi.py): the whole file is uploaded once and the
// transcript keeps only the reference. Kimi re-uploads on every read; Gemini's files expire after
// 48 hours, so references are cached by content hash and renewed from the local file when stale.
// Kept identical in notale-ts and notale-editor (tools/check-istar-sync.mjs).
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GoogleGenAI, type Part } from "@google/genai";
import type { FileContent, Message } from "./types.js";

/** Something that makes a file part sendable before a model sees it (an upload, for Gemini). */
export interface MediaUploader {
	/** Ensures `part` can be sent: fills `uri` and `expiresAt` when it must be uploaded. Throws when it cannot. */
	prepare(part: FileContent, signal?: AbortSignal): Promise<void>;
}
/** The part of the SDK's `files` client used here (a fake in tests). */
export interface FilesClient {
	upload(params: { file: string; config: { mimeType: string; displayName?: string } }): Promise<RemoteFile>;
	get(params: { name: string }): Promise<RemoteFile>;
}
interface RemoteFile { name?: string; uri?: string; state?: string; expirationTime?: string; error?: { message?: string } }
type Cached = { uri: string; name: string; expiresAt: number; mimeType: string };

/** PDFs this small ride along in the request; everything else is uploaded (a request is re-sent on
 * every step of a turn, so a big inline file would be re-sent each time). */
export const INLINE_MAX_BYTES = 1_000_000;
/** A reference expiring within this is treated as gone. */
const RENEW_MARGIN_MS = 60 * 60 * 1000;
const READY_TIMEOUT_MS = 180_000, POLL_MS = 1_000;

export class GeminiFiles implements MediaUploader {
	private cache: Record<string, Cached> | undefined;
	private readonly client: FilesClient;
	constructor(private readonly options: { apiKey?: string; cacheFile?: string; client?: FilesClient; now?: () => number }) {
		this.client = options.client ?? (new GoogleGenAI({ apiKey: options.apiKey ?? "" }).files as unknown as FilesClient);
	}
	private now() { return this.options.now?.() ?? Date.now(); }
	private fresh(expiresAt: number | undefined) { return expiresAt !== undefined && expiresAt - this.now() > RENEW_MARGIN_MS; }
	private inline(part: FileContent) { return part.mimeType === "application/pdf" && part.bytes <= INLINE_MAX_BYTES; }

	async prepare(part: FileContent, signal?: AbortSignal): Promise<void> {
		if (this.inline(part) || (part.uri && this.fresh(part.expiresAt))) return;
		const bytes = await readFile(part.path);
		const hash = createHash("sha256").update(bytes).digest("hex");
		const cache = await this.load();
		const hit = cache[hash];
		if (hit && hit.mimeType === part.mimeType && this.fresh(hit.expiresAt)) { part.uri = hit.uri; part.expiresAt = hit.expiresAt; return; }
		let file = await this.client.upload({ file: part.path, config: { mimeType: part.mimeType, ...(part.name ? { displayName: part.name.slice(0, 100) } : {}) } });
		// Video is processed before it can be used: PROCESSING, then ACTIVE (or FAILED).
		const started = this.now();
		while (file.state === "PROCESSING") {
			if (signal?.aborted) throw signal.reason ?? new Error("aborted");
			if (this.now() - started > READY_TIMEOUT_MS) throw new Error(`Gemini is still processing ${part.path}`);
			await new Promise(resolve => setTimeout(resolve, POLL_MS));
			file = await this.client.get({ name: file.name! });
		}
		if (file.state && file.state !== "ACTIVE") throw new Error(`Gemini could not process ${part.path}: ${file.error?.message ?? file.state}`);
		if (!file.uri || !file.name) throw new Error(`Gemini returned no file reference for ${part.path}`);
		const expiresAt = file.expirationTime ? Date.parse(file.expirationTime) : this.now() + 47 * 60 * 60 * 1000;
		cache[hash] = { uri: file.uri, name: file.name, expiresAt, mimeType: part.mimeType };
		await this.save();
		part.uri = file.uri;
		part.expiresAt = expiresAt;
	}

	/** Every file part in `messages` as the Gemini part to send, renewing stale references. A file
	 * that is gone, or cannot be uploaded now, becomes a line of text rather than a failed request. */
	async parts(messages: Message[], signal?: AbortSignal): Promise<Map<FileContent, Part>> {
		const out = new Map<FileContent, Part>();
		for (const message of messages) {
			if (message.role === "assistant" || typeof message.content === "string") continue;
			for (const block of message.content) {
				if (block.type !== "file") continue;
				try {
					await stat(block.path);
					if (this.inline(block)) out.set(block, { inlineData: { mimeType: block.mimeType, data: (await readFile(block.path)).toString("base64") } });
					else { await this.prepare(block, signal); out.set(block, { fileData: { fileUri: block.uri!, mimeType: block.mimeType } }); }
				} catch (cause) {
					if (signal?.aborted) throw cause;
					out.set(block, { text: `[${block.path} could not be sent: ${cause instanceof Error ? cause.message : String(cause)}]` });
				}
			}
		}
		return out;
	}

	private async load() {
		if (this.cache) return this.cache;
		this.cache = {};
		if (this.options.cacheFile) {
			try { this.cache = JSON.parse(await readFile(this.options.cacheFile, "utf8")) as Record<string, Cached>; } catch { /* first use */ }
		}
		return this.cache;
	}
	private async save() {
		if (!this.options.cacheFile || !this.cache) return;
		await mkdir(dirname(this.options.cacheFile), { recursive: true });
		await writeFile(this.options.cacheFile, JSON.stringify(this.cache));
	}
}
