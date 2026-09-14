/** Public image retrieval: baseline DNS validation and connection pinning. */
import { lookup } from 'node:dns/promises';
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import ipaddr from 'ipaddr.js';
import sharp from 'sharp';
import { RESOURCES } from '../core/guidance.js';

export const mediaInstructions = JSON.parse(readFileSync(path.join(RESOURCES, 'media-instructions.json'), 'utf8'));
export const valueError = (message: string) => Object.assign(new Error(message), { name: 'ValueError' });
export function publicAddress(raw: string): boolean {
  let address = ipaddr.parse(raw);
  if (address.kind() === 'ipv6' && (address as ipaddr.IPv6).isIPv4MappedAddress()) address = (address as ipaddr.IPv6).toIPv4Address();
  const constants = mediaInstructions.networks[address.kind() === 'ipv4' ? '4' : '6'];
  const contains = (cidr: string) => { const [network, bits] = ipaddr.parseCIDR(cidr); return address.kind() === network.kind() && address.match(network, bits); };
  return !(constants.shared && contains(constants.shared)) && (!constants.private.some(contains) || constants.exceptions.some(contains));
}
export async function publicGet(raw: string, deadline: number, signal?: AbortSignal): Promise<IncomingMessage> {
  let url: URL;
  try { url = new URL(raw); } catch { throw valueError('图片地址必须是无凭据的公开 HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw valueError('图片地址必须是无凭据的公开 HTTP(S) URL');
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw Object.assign(new Error('图片下载超时'), { name: 'TimeoutError' });
  const combined = AbortSignal.any([AbortSignal.timeout(Math.ceil(remaining)), ...(signal ? [signal] : [])]);
  combined.throwIfAborted();
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let abortLookup!: () => void;
  const addresses = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    abortLookup = () => reject(combined.reason);
    combined.addEventListener('abort', abortLookup, { once: true });
    if (combined.aborted) { abortLookup(); return; }
    // OS DNS lookup itself is not abortable; abandon its result without opening a socket.
    lookup(host, { all: true }).then(resolve, reject);
  }).finally(() => combined.removeEventListener('abort', abortLookup));
  combined.throwIfAborted();
  if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw valueError('图片地址解析到非公网地址');
  const address = addresses[0]!;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      signal: combined, agent: false, headers: { 'User-Agent': 'Notale-image-search/1.0' },
      // Validate all answers, then connect only to the chosen checked address.
      lookup: (_host, options, callback) => {
        if (options.all) callback(null, [address]); else callback(null, address.address, address.family);
      },
    }, resolve);
    request.setTimeout(Math.min(30000, Math.max(1, deadline - performance.now())), () => request.destroy(Object.assign(new Error('timed out'), { name: 'TimeoutError' })));
    request.on('error', reject);
  });
}
export type PublicGet = typeof publicGet;
export async function imageInfo(file: string): Promise<[string, number, number]> {
  const metadata = await sharp(file, { limitInputPixels: false }).metadata();
  const extension = ({ jpeg: '.jpg', png: '.png', gif: '.gif', webp: '.webp' } as Record<string, string>)[metadata.format!];
  const width = metadata.width!, height = metadata.pageHeight ?? metadata.height!;
  // Pillow's MAX_IMAGE_PIXELS warning is promoted to an error by the baseline.
  if (width * height > 89478485) throw valueError(`图片超过解码器的安全尺寸：Image size (${width * height} pixels) exceeds limit of ${width * height > 178956970 ? 178956970 : 89478485} pixels, could be decompression bomb DOS attack.`);
  if (!extension) throw valueError(`不支持的浏览器图片格式：${metadata.format?.toUpperCase() ?? 'None'}`);
  await sharp(file, { limitInputPixels: 89478485 }).raw().toBuffer();
  return [extension, width, height];
}
export async function downloadImage(url: string, out: string, index: number, deadline: number, signal?: AbortSignal, get: PublicGet = publicGet): Promise<[string, number, number]> {
  const partial = path.join(out, String(index).padStart(2, '0') + '.part');
  try {
    for (let redirect = 0; redirect < 6; redirect++) {
      signal?.throwIfAborted();
      if (performance.now() >= deadline) throw Object.assign(new Error('图片下载超时'), { name: 'TimeoutError' });
      const response = await get(url, deadline, signal);
      try {
        if ([301, 302, 303, 307, 308].includes(response.statusCode!)) {
          if (!response.headers.location) throw valueError('图片重定向缺少 Location');
          url = new URL(response.headers.location, url).href; continue;
        }
        if (response.statusCode !== 200) throw Object.assign(new Error(`图片下载 HTTP ${response.statusCode}: ${response.statusMessage}`), { name: 'OSError' });
        const handle = await open(partial, 'wx');
        try {
          for await (const chunk of response) {
            signal?.throwIfAborted();
            if (performance.now() >= deadline) throw Object.assign(new Error('图片下载超时'), { name: 'TimeoutError' });
            await handle.writeFile(chunk);
          }
        } finally { await handle.close(); }
        const [extension, width, height] = await imageInfo(partial), target = path.join(out, String(index).padStart(2, '0') + extension);
        await rename(partial, target); return [target, width, height];
      } finally { response.destroy(); }
    }
    throw valueError('图片重定向过多');
  } finally { await unlink(partial).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
