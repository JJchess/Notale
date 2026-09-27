import { Pool } from 'pg';
import { developmentSecret } from './development-secret.js';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createApps } from './app.js';

// The workspace's one secrets file (Notale/.env.local, see .env.example); shell values still win.
const secrets = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env.local');
if (existsSync(secrets)) process.loadEnvFile(secrets);
const port = Number(process.env.EDITOR_PORT ?? 4310),
  contentPort = Number(process.env.EDITOR_CONTENT_PORT ?? 4311),
  host = process.env.EDITOR_HOST ?? '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host))
  console.warn(`EDITOR_HOST=${host}: the standalone identity below lets anyone who reaches this address edit every document.`);
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://notale_editor:local-editor-development@127.0.0.1:55439/notale_editor',
  max: 10,
});
const store = new Store(pool);
await store.migrate();
// Standalone development identity only. Integrators must supply their own context and policy.
const apps = createApps({
  store,
  secret: process.env.EDITOR_PREVIEW_SECRET ?? (await developmentSecret(resolve('.local'))),
  // Where the content app is reached from outside (a gateway, a container network).
  contentOrigin: process.env.EDITOR_CONTENT_ORIGIN ?? `http://127.0.0.1:${contentPort}`,
  logger: true,
  integration: {
    context: async () => ({ actor: 'local-author', scope: 'local-workspace' }),
    authorize: async () => true,
  },
});
await apps.content.listen({ host, port: contentPort });
await apps.api.listen({ host, port });
async function shutdown() {
  await apps.api.close();
  await apps.content.close();
  await pool.end();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
