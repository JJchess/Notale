// Notale addition to the pi fork: what a model that cannot take a document or a video natively gets
// instead, made on the host with ffmpeg and poppler. Claude Code reads PDFs by page range (`pages`,
// at most 20 a call) and leaves video to the agent (ffmpeg in Bash); here the harness does the
// frames itself so the fallback does not depend on the model thinking of it. Kept identical in
// notale-ts and notale-editor (tools/check-istar-sync.mjs).
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const TOOL_TIMEOUT_MS = 120_000;
const tool = async (command: string, args: string[], options: { encoding?: "buffer" } = {}) => {
	try { return await run(command, args, { timeout: TOOL_TIMEOUT_MS, maxBuffer: 64 << 20, ...options }); }
	catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`${command} is not installed on this server`);
		throw cause;
	}
};

export interface VideoInfo { seconds?: number; width?: number; height?: number }
export async function probeVideo(path: string): Promise<VideoInfo> {
	try {
		const { stdout } = await tool("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path]);
		const info = JSON.parse(String(stdout)) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] };
		const video = info.streams?.find(stream => stream.codec_type === "video");
		const seconds = Number(info.format?.duration);
		return { ...(Number.isFinite(seconds) ? { seconds: Math.round(seconds * 10) / 10 } : {}), ...(video?.width ? { width: video.width, height: video.height! } : {}) };
	} catch { return {}; }
}

export interface Frame { seconds: number; data: string; mimeType: "image/jpeg" }
/** Up to `max` frames: first where the picture changes, then evenly to fill; each with its time. */
export async function videoFrames(path: string, dir: string, { max = 12, width = 768, seconds }: { max?: number; width?: number; seconds?: number } = {}): Promise<Frame[]> {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	const scale = `scale='min(${width},iw)':-2`;
	const grab = async (filter: string, prefix: string) => {
		const { stderr } = await tool("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-vf", `${filter},${scale},showinfo`, "-vsync", "vfr", "-q:v", "4", "-frames:v", String(max), join(dir, `${prefix}%03d.jpg`)]);
		const times = [...String(stderr).matchAll(/pts_time:([\d.]+)/g)].map(match => Number(match[1]));
		const files = (await readdir(dir)).filter(name => name.startsWith(prefix)).sort();
		return files.map((name, index) => ({ name, seconds: times[index] ?? 0 }));
	};
	let picked = await grab("select='eq(n\\,0)+gt(scene\\,0.3)'", "s");
	if (picked.length < Math.min(4, max)) {
		const every = Math.max(0.5, (seconds ?? 10) / max);
		picked = await grab(`fps=1/${every}`, "u");
	}
	return Promise.all(picked.slice(0, max).map(async frame => ({ seconds: Math.round(frame.seconds * 10) / 10, mimeType: "image/jpeg" as const, data: (await readFile(join(dir, frame.name))).toString("base64") })));
}

export async function pdfPages(path: string): Promise<number | undefined> {
	try { const pages = /Pages:\s+(\d+)/.exec(String((await tool("pdfinfo", [path])).stdout))?.[1]; return pages ? Number(pages) : undefined; }
	catch { return undefined; }
}
/** Pages `first`..`last` of `path` as their own PDF at `out`. */
export async function pdfSlice(path: string, first: number, last: number, out: string, dir: string): Promise<void> {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await tool("pdfseparate", ["-f", String(first), "-l", String(last), path, join(dir, "p%04d.pdf")]);
	const parts = (await readdir(dir)).filter(name => name.endsWith(".pdf")).sort().map(name => join(dir, name));
	await tool("pdfunite", [...parts, out]);
	await rm(dir, { recursive: true, force: true });
}
export async function pdfText(path: string, first: number, last: number): Promise<string> {
	return String((await tool("pdftotext", ["-f", String(first), "-l", String(last), "-layout", path, "-"])).stdout);
}
/** Pages `first`..`last` as PNG screenshots, for a model that sees images but not PDFs. */
export async function pdfPageImages(path: string, first: number, last: number, dir: string): Promise<{ page: number; data: string; mimeType: "image/png" }[]> {
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	await tool("pdftoppm", ["-f", String(first), "-l", String(last), "-png", "-scale-to", "1100", path, join(dir, "page")]);
	const files = (await readdir(dir)).filter(name => name.endsWith(".png")).sort();
	return Promise.all(files.map(async (name, index) => ({ page: first + index, mimeType: "image/png" as const, data: (await readFile(join(dir, name))).toString("base64") })));
}
