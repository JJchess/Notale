import { Pool } from 'pg';
import { developmentSecret } from './development-secret.js';
import { resolve } from 'node:path';
import { Store } from './store.js';
import { createApps } from './app.js';

const port = Number(process.env.EDITOR_PORT ?? 4310),
  contentPort = Number(process.env.EDITOR_CONTENT_PORT ?? 4311);
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
  contentOrigin: `http://127.0.0.1:${contentPort}`,
  logger: true,
  integration: {
    context: async () => ({ actor: 'local-author', scope: 'local-workspace' }),
    authorize: async () => true,
  },
});
await apps.content.listen({ host: '127.0.0.1', port: contentPort });
await apps.api.listen({ host: '127.0.0.1', port });
async function shutdown() {
  await apps.api.close();
  await apps.content.close();
  await pool.end();
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
