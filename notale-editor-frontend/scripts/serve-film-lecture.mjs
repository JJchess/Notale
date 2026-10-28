/** Existing lecture API for this worktree's smoke only. No parent .env loading. */
import { Store, createApps } from '@notale/editor';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = dirname(fileURLToPath(import.meta.resolve('@notale/editor')));
process.env.EDITOR_RUNTIME_DIR = runtime;
process.env.EDITOR_POSTER_DIR = resolve(root, '.local/motale-film/posters');
const pool = new Pool({ host:'127.0.0.1', port:55449, user:'film_editor', password:'film-editor-local', database:'film_editor', max:4 });
const store = new Store(pool);
await store.migrate();
const apps = createApps({ store, secret:randomBytes(32).toString('hex'),
  contentOrigin:'http://film-content.localhost:4322', serveWorkbench:false,
  integration:{ context:async()=>({actor:'film-smoke',scope:'film-smoke'}), authorize:async()=>true },
});
// Fixed task-owned sockets; EADDRINUSE is an error, never unlink another process.
await apps.content.listen({ path:resolve(root,'.local/film-content.sock') });
await apps.api.listen({ path:resolve(root,'.local/film-api.sock') });
console.log('Isolated lecture API ready: database 55449, task Unix sockets');
async function close() { await apps.api.close(); await apps.content.close(); await pool.end(); }
process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());
