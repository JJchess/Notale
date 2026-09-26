import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises';
import { join } from 'node:path';

/** The standalone development server needs stable signing across restarts too.
 * Publish a complete private file atomically without replacing another starter's
 * key. Integrated deployments continue to supply their host-managed secret. */
export async function developmentSecret(directory: string): Promise<string> {
  const path = join(directory, 'preview-secret');
  async function read() {
    const value = (await readFile(path, 'utf8')).trim();
    if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid local preview signing secret');
    return value;
  }
  try {
    return await read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `preview-secret-${randomUUID()}.tmp`);
  await writeFile(temporary, randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 });
  try {
    try {
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    return await read();
  } finally {
    await unlink(temporary);
  }
}
