/** RGB resampling port of Pillow 12.1.0 libImaging/Resample.c and Reduce.c.
 * Copyright and permission notice: resources/notices/Pillow-LICENSE.
 * sharp decodes/encodes; filtering uses Pillow's bounds and 22-bit rounding.
 */
import sharp from 'sharp';
import { crc32, deflateSync } from 'node:zlib';

const precision = 2 ** 22;
function sinc(x: number): number { if (x === 0) return 1; x *= Math.PI; return Math.sin(x) / x; }
function coefficients(input: number, output: number, kernel: 'lanczos' | 'bicubic' = 'lanczos', extent = input): Array<{ start: number; weights: number[] }> {
  const scale = extent / output, filterScale = Math.max(scale, 1), support = (kernel === 'bicubic' ? 2 : 3) * filterScale;
  return Array.from({ length: output }, (_, index) => {
    const center = (index + 0.5) * scale;
    const start = Math.max(0, Math.trunc(center - support + 0.5));
    const end = Math.min(input, Math.trunc(center + support + 0.5));
    const weights = Array.from({ length: end - start }, (_, x) => {
      const distance = (x + start - center + 0.5) * (1 / filterScale);
      if (kernel === 'bicubic') { const x = Math.abs(distance); return x < 1 ? (1.5 * x - 2.5) * x * x + 1 : x < 2 ? (((x - 5) * x + 8) * x - 4) * -0.5 : 0; }
      return distance >= -3 && distance < 3 ? sinc(distance) * sinc(distance / 3) : 0;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    return { start, weights: weights.map(value => {
      const normalized = sum ? value / sum : value;
      return Math.trunc(normalized * precision + (normalized < 0 ? -0.5 : 0.5));
    }) };
  });
}
const pixel = (sum: number) => Math.max(0, Math.min(255, Math.floor(sum / precision)));

export function resizeRgb(data: Buffer, width: number, height: number, targetWidth: number, targetHeight: number, options: { kernel?: 'lanczos' | 'bicubic'; extent?: [number, number] } = {}): Buffer {
  if (![width, height, targetWidth, targetHeight].every(value => Number.isSafeInteger(value) && value > 0) || data.length !== width * height * 3) throw new Error('Invalid RGB dimensions');
  const [extentX, extentY] = options.extent ?? [width, height];
  let horizontal = data;
  if (width !== targetWidth || extentX !== width) {
    horizontal = Buffer.alloc(targetWidth * height * 3);
    const filters = coefficients(width, targetWidth, options.kernel, extentX);
    for (let y = 0; y < height; y++) for (let x = 0; x < targetWidth; x++) {
      const { start, weights } = filters[x]!;
      for (let channel = 0; channel < 3; channel++) {
        let sum = precision / 2;
        for (let i = 0; i < weights.length; i++) sum += data[(y * width + start + i) * 3 + channel]! * weights[i]!;
        horizontal[(y * targetWidth + x) * 3 + channel] = pixel(sum);
      }
    }
  }
  if (height === targetHeight && extentY === height) return horizontal;
  const output = Buffer.alloc(targetWidth * targetHeight * 3), filters = coefficients(height, targetHeight, options.kernel, extentY);
  for (let y = 0; y < targetHeight; y++) {
    const { start, weights } = filters[y]!;
    for (let x = 0; x < targetWidth; x++) for (let channel = 0; channel < 3; channel++) {
      let sum = precision / 2;
      for (let i = 0; i < weights.length; i++) sum += horizontal[((start + i) * targetWidth + x) * 3 + channel]! * weights[i]!;
      output[(y * targetWidth + x) * 3 + channel] = pixel(sum);
    }
  }
  return output;
}

async function decodeRgb(input: Buffer, crop?: { left: number; top: number; width: number; height: number }, ignoreIcc = true): Promise<{ data: Buffer; width: number; height: number }> {
  const metadata = await sharp(input).metadata();
  if (metadata.space === 'grey16' && metadata.channels === 1) {
    let decoder = sharp(input, { ignoreIcc }).toColourspace('grey16');
    if (crop) decoder = decoder.extract(crop);
    const { data, info } = await decoder.raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
    const samples = new Uint16Array(data.buffer, data.byteOffset, data.length / 2);
    // Pillow I;16 -> RGB clips integer samples; it does not scale 0..65535 to 0..255.
    const rgb = Buffer.alloc(samples.length * 3);
    samples.forEach((value, index) => rgb.fill(Math.min(255, value), index * 3, index * 3 + 3));
    return { data: rgb, width: info.width, height: info.height };
  }
  if (metadata.space === 'cmyk') {
    let decoder = sharp(input, { ignoreIcc }).pipelineColourspace('cmyk').toColourspace('cmyk');
    if (crop) decoder = decoder.extract(crop);
    const { data, info } = await decoder.raw().toBuffer({ resolveWithObject: true });
    const rgb = Buffer.alloc(info.width * info.height * 3);
    for (let pixel = 0; pixel < info.width * info.height; pixel++) {
      const black = 255 - data[pixel * 4 + 3]!;
      for (let channel = 0; channel < 3; channel++) rgb[pixel * 3 + channel] = Math.floor(((255 - data[pixel * 4 + channel]!) * black + 127) / 255);
    }
    return { data: rgb, width: info.width, height: info.height };
  }
  let decoder = sharp(input, { ignoreIcc }).toColourspace('srgb').removeAlpha();
  if (crop) decoder = decoder.extract(crop);
  const { data, info } = await decoder.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
export async function resizeRgbPng(input: Buffer, width: number, height: number, crop?: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const decoded = await decodeRgb(input, crop);
  const resized = resizeRgb(decoded.data, decoded.width, decoded.height, width, height);
  const png = await sharp(resized, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const icc = (await sharp(input).metadata()).icc;
  if (!icc) return png;
  // Pillow preserves the source ICC through RGB conversion and resize. Insert
  // its PNG profile chunk without applying another colour transform to pixels.
  const body = Buffer.concat([Buffer.from('iCCPICC Profile\0\0', 'binary'), deflateSync(icc)]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(body.length - 4, 0); body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), chunk.length - 4);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

/** Pillow convert('RGB').thumbnail((limit, limit)) followed by JPEG quality=82. */
export async function thumbnailJpeg(input: Buffer, limit: number): Promise<{ data: Buffer; width: number; height: number }> {
  let { data, width, height } = await decodeRgb(input, undefined, true);
  const aspect = width / height;
  let w = width, h = height;
  const roundAspect = (value: number, score: (n: number) => number) => Math.max(score(Math.floor(value)) <= score(Math.ceil(value)) ? Math.floor(value) : Math.ceil(value), 1);
  if (width > limit || height > limit) {
    w = h = Math.floor(limit);
    if (w / h >= aspect) w = roundAspect(h * aspect, n => Math.abs(aspect - n / h));
    else h = roundAspect(w / aspect, n => n === 0 ? 0 : Math.abs(aspect - w / n));
    const fx = Math.max(1, Math.trunc(width / w / 2)), fy = Math.max(1, Math.trunc(height / h / 2));
    const extent: [number, number] = [Math.fround(width / fx), Math.fround(height / fy)];
    if (fx > 1 || fy > 1) {
      const rw = Math.ceil(width / fx), rh = Math.ceil(height / fy), reduced = Buffer.alloc(rw * rh * 3);
      for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
        const right = Math.min((x + 1) * fx, width), bottom = Math.min((y + 1) * fy, height), count = (right - x * fx) * (bottom - y * fy);
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let yy = y * fy; yy < bottom; yy++) for (let xx = x * fx; xx < right; xx++) sum += data[(yy * width + xx) * 3 + c]!;
          reduced[(y * rw + x) * 3 + c] = Math.floor((sum + Math.floor(count / 2)) * Math.trunc(Math.fround(2 ** 32 / Math.fround(256 * count))) / 2 ** 24);
        }
      }
      data = reduced; width = rw; height = rh;
    }
    data = resizeRgb(data, width, height, w, h, { kernel: 'bicubic', extent });
  }
  const jpeg = await sharp(data, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 82, chromaSubsampling: '4:2:0', optimiseCoding: false }).toBuffer();
  // libvips strips JFIF without metadata; Pillow emits this default 1x1-density marker.
  return { data: Buffer.concat([jpeg.subarray(0, 2), Buffer.from('ffe000104a46494600010100000100010000', 'hex'), jpeg.subarray(2)]), width: w, height: h };
}
