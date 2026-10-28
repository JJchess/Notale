import { createHash } from 'node:crypto';
import { unzip, unzipSync, zip, strFromU8, strToU8, type AsyncZippable } from 'fflate';
import { lookup } from 'mime-types';
import { MOTALE_FORMAT, MOTALE_MANIFEST, isMotaleEnvelope, motaleFilename, type MotaleEnvelope } from '@notale/format';
import { DomainError, filePath, invariant } from '../domain/model.js';
export { motaleFilename };

/** The limits of a .notale import, for the same reasons. */
const LIMITS = { files: 10_000, unpacked: 150_000_000 };
/** What a Motale delivery keeps from its workspace that doesn't play (Motale's src/workspace/archive.ts). */
const LEFTOVER = /(?:^|\/)[^/]+\.(?:md|sh)$|^[^/]+\.mjs$|^style\.json$/;
const PACKED = /\.(?:m4a|mp3|jpe?g|png|webp|woff2?|wasm|zip)$/i;
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Open a .motale: limits on the central directory before anything is inflated, then every file against the manifest. */
export async function decodeMotale(bytes: Uint8Array): Promise<{ manifest: MotaleEnvelope; files: Record<string, Uint8Array> }> {
  let total = 0, count = 0;
  const paths = new Set<string>();
  try {
    unzipSync(bytes, { filter: entry => {
      if (entry.name.endsWith('/')) return false;
      invariant(filePath.safeParse(entry.name).success, 'INVALID_PROJECT', `Unsafe path in the package: ${entry.name}`);
      invariant(!paths.has(entry.name), 'INVALID_PROJECT', 'Duplicate archive path');
      paths.add(entry.name);
      total += entry.originalSize;
      invariant(++count <= LIMITS.files && total <= LIMITS.unpacked, 'TOO_LARGE', 'Expanded Motale exceeds resource limits', 413);
      return false;
    } });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    invariant(false, 'INVALID_PROJECT', 'Not a .motale file');
  }
  const raw = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(bytes, { filter: entry => !entry.name.endsWith('/') }, (error, data) => error ? reject(error) : resolve(data)));
  invariant(raw[MOTALE_MANIFEST], 'INVALID_PROJECT', 'Motale manifest is missing');
  let manifest: unknown;
  try { manifest = JSON.parse(strFromU8(raw[MOTALE_MANIFEST])); } catch { invariant(false, 'INVALID_PROJECT', 'Motale manifest is not JSON'); }
  invariant(isMotaleEnvelope(manifest), 'INVALID_PROJECT', 'Expected Motale format version 1');
  const { [MOTALE_MANIFEST]: _, ...files } = raw;
  for (const name of Object.keys(files)) invariant(manifest.files[name], 'INVALID_PROJECT', `${name} is not in the manifest`);
  for (const [name, file] of Object.entries(manifest.files)) {
    invariant(files[name], 'MISSING_ASSET', `Missing ${name}`);
    invariant(sha256(files[name]) === file.hash, 'ASSET_HASH_MISMATCH', `Corrupt asset ${name}`);
  }
  invariant(files['acts.json'] && files[MOTALE_FORMAT.entry], 'INVALID_PROJECT', 'Motale player or acts.json is missing');
  return { manifest, files };
}

/** Pack a Motale film's files (leftovers dropped), with `author` written in as author.json and named in acts.json. */
export function encodeMotale(files: Record<string, Uint8Array>, film: { id: string; cut: number }, author?: unknown): Promise<Uint8Array> {
  const all: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) if (!LEFTOVER.test(name) && name !== MOTALE_MANIFEST) all[name] = bytes;
  invariant(all['acts.json'] && all[MOTALE_FORMAT.entry], 'INVALID_PROJECT', 'Motale player or acts.json is missing');
  const acts = JSON.parse(strFromU8(all['acts.json'])) as Record<string, unknown>;
  if (author !== undefined) {
    all['author.json'] = strToU8(JSON.stringify(author));
    acts.author = 'author.json';
    all['acts.json'] = strToU8(JSON.stringify(acts, null, 2));
  }
  const manifest: MotaleEnvelope = {
    ...MOTALE_FORMAT,
    film: { ...film, title: typeof acts.title === 'string' ? acts.title : film.id, ...(all['cover.jpg'] ? { cover: 'cover.jpg' } : {}), bridge: 'motale-bridge/2' },
    files: Object.fromEntries(Object.entries(all).map(([name, bytes]) => [name, { hash: sha256(bytes), size: bytes.length, mime: lookup(name) || 'application/octet-stream' }])),
  };
  const zippable: AsyncZippable = { [MOTALE_MANIFEST]: strToU8(JSON.stringify(manifest, null, 2)) };
  for (const [name, bytes] of Object.entries(all)) zippable[name] = [bytes, { level: PACKED.test(name) ? 0 : 6 }];
  return new Promise((resolve, reject) => zip(zippable, { mtime: '2020-01-01' }, (error, data) => error ? reject(error) : resolve(data)));
}

/** A key for a package's contents, as Motale computes it: the same film opened twice is one folder. */
export const motaleKey = (manifest: MotaleEnvelope) =>
  sha256(strToU8(JSON.stringify(Object.entries(manifest.files).map(([name, file]) => [name, file.hash]).sort()))).slice(0, 16);
