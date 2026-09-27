// Notale addition to the pi fork: what a file is, from its first bytes (after kimi-cli's
// tools/file/utils.py, which reads the MP4 `ftyp` brand before trusting a suffix). Kept identical
// in notale-ts and notale-editor (tools/check-istar-sync.mjs).
import { open } from "node:fs/promises";

export type Sniffed =
	| { kind: "pdf"; mimeType: "application/pdf" }
	| { kind: "video"; mimeType: "video/mp4" | "video/quicktime" | "video/webm" }
	/** Not text, and not a document or video the model can read. */
	| { kind: "binary" }
	| { kind: "text" };

export const SNIFF_BYTES = 512;

/** Classifies a file's head. Images are pi's business (detectSupportedImageMimeType) and come first. */
export function sniffBytes(head: Uint8Array): Sniffed {
	const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
	if (ascii(0, 5) === "%PDF-") return { kind: "pdf", mimeType: "application/pdf" };
	// ISO base media: size(4) "ftyp" brand(4). HEIF/AVIF images share the box and are not video.
	if (head.length >= 12 && ascii(4, 8) === "ftyp") {
		const brand = ascii(8, 12);
		if (/^(heic|heix|hevc|mif1|msf1|avif|avis)$/.test(brand)) return { kind: "binary" };
		return { kind: "video", mimeType: brand === "qt  " ? "video/quicktime" : "video/mp4" };
	}
	// EBML: WebM plays, generic Matroska is not a format Gemini reads.
	if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3)
		return ascii(0, head.length).includes("webm") ? { kind: "video", mimeType: "video/webm" } : { kind: "binary" };
	// A NUL byte in the head: not text. (No suffix is trusted, so `.ts` source is never taken for MPEG-TS.)
	return head.includes(0) ? { kind: "binary" } : { kind: "text" };
}

export async function sniff(path: string): Promise<Sniffed> {
	const handle = await open(path, "r");
	try {
		const head = new Uint8Array(SNIFF_BYTES);
		const { bytesRead } = await handle.read(head, 0, SNIFF_BYTES, 0);
		return sniffBytes(head.subarray(0, bytesRead));
	} finally {
		await handle.close();
	}
}
