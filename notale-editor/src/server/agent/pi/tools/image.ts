// Forked from earendil-works/pi packages/coding-agent/src/utils/{image-process,image-resize-core,image-resize}.ts@fde38ed (MIT). Trimmed for the notale editor.
// Photon (WASM) replaced by sharp. Kept: fit within 2000x2000, keep the mime type, dimension hint,
// the same result shape and messages. EXIF orientation is applied by sharp's rotate().
import sharp from "sharp";

export interface ImageResizeOptions {
	maxWidth?: number; // Default: 2000
	maxHeight?: number; // Default: 2000
	maxBytes?: number; // Default: 4.5MB of base64 payload
}

export interface ProcessImageOptions {
	/** Whether to resize images to inline provider limits. Default: true */
	autoResizeImages?: boolean;
	resizeOptions?: ImageResizeOptions;
}

export type ProcessImageResult =
	| {
			ok: true;
			data: string;
			mimeType: string;
			hints: string[];
	  }
	| {
			ok: false;
			message: string;
	  };

// 4.5MB of base64 payload.
const DEFAULT_MAX_BYTES = 4.5 * 1024 * 1024;

type SharpFormat = "png" | "jpeg" | "gif" | "webp";

function normalizeSupportedImageMimeType(mimeType: string): SharpFormat | null {
	switch (mimeType.split(";")[0]?.trim().toLowerCase()) {
		case "image/png":
			return "png";
		case "image/jpeg":
		case "image/jpg":
			return "jpeg";
		case "image/gif":
			return "gif";
		case "image/webp":
			return "webp";
		default:
			return null;
	}
}

export async function processImage(
	bytes: Uint8Array,
	mimeType: string,
	options?: ProcessImageOptions,
): Promise<ProcessImageResult> {
	const autoResizeImages = options?.autoResizeImages ?? true;
	const maxWidth = options?.resizeOptions?.maxWidth ?? 2000;
	const maxHeight = options?.resizeOptions?.maxHeight ?? 2000;
	const maxBytes = options?.resizeOptions?.maxBytes ?? DEFAULT_MAX_BYTES;

	const supported = normalizeSupportedImageMimeType(mimeType);
	// Unsupported inline formats (e.g. BMP) are converted to PNG.
	const format: SharpFormat = supported ?? "png";
	const hints: string[] = [];
	if (!supported) hints.push(`[Image converted from ${mimeType} to image/png.]`);

	try {
		const metadata = await sharp(bytes).metadata();
		const originalWidth = metadata.autoOrient?.width ?? metadata.width ?? 0;
		const originalHeight = metadata.autoOrient?.height ?? metadata.height ?? 0;
		const needsResize = autoResizeImages && (originalWidth > maxWidth || originalHeight > maxHeight);

		let output: Buffer;
		let width = originalWidth;
		let height = originalHeight;
		if (!needsResize && supported) {
			output = Buffer.from(bytes);
		} else {
			const { data, info } = await sharp(bytes)
				.rotate()
				.resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })
				.toFormat(format)
				.toBuffer({ resolveWithObject: true });
			output = data;
			width = info.width;
			height = info.height;
		}

		const base64 = output.toString("base64");
		// ponytail: no quality/size fallback ladder like pi's photon path; add one if 2000px images overflow maxBytes.
		if (autoResizeImages && base64.length >= maxBytes) {
			return { ok: false, message: "[Image omitted: could not be resized below the inline image size limit.]" };
		}
		if (width !== originalWidth || height !== originalHeight) {
			const scale = originalWidth / width;
			hints.push(
				`[Image: original ${originalWidth}x${originalHeight}, displayed at ${width}x${height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`,
			);
		}
		return { ok: true, data: base64, mimeType: `image/${format}`, hints };
	} catch {
		return {
			ok: false,
			message: "[Image omitted: could not be converted to a supported inline image format.]",
		};
	}
}
