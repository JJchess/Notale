import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID, createHmac } from 'node:crypto';
import { Store, type Context } from '../src/server/store.js';
import { createApps } from '../src/server/app.js';
import { documentSchema, slideSchema, commitSchema } from '../src/domain/model.js';
import { importHtml, inspectSlide } from '../src/domain/html.js';
import { applyCommands } from '../src/domain/commands.js';
import { unzipSync } from 'fflate';
import Fastify from 'fastify';

const pool = new Pool({
  connectionString:
    process.env.TEST_DATABASE_URL ??
    'postgres://notale_editor:local-editor-development@127.0.0.1:55439/notale_editor',
  max: 12,
});
const store = new Store(pool),
  scope = `test-${randomUUID()}`,
  ctx: Context = { scope, actor: 'author' };
before(() => store.migrate());
after(async () => {
  await pool.query(
    'DELETE FROM editor_mutations WHERE document_id IN (SELECT id FROM editor_documents WHERE scope=$1)',
    [scope],
  );
  await pool.query(
    'DELETE FROM editor_revision_assets WHERE document_id IN (SELECT id FROM editor_documents WHERE scope=$1)',
    [scope],
  );
  await pool.query(
    'DELETE FROM editor_revisions WHERE document_id IN (SELECT id FROM editor_documents WHERE scope=$1)',
    [scope],
  );
  await pool.query('DELETE FROM editor_documents WHERE scope=$1', [scope]);
  await pool.query('DELETE FROM editor_uploads WHERE scope=$1', [scope]);
  await pool.end();
});
function fixture() {
  return documentSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    title: 'Original',
    slides: [
      slideSchema.parse({
        id: randomUUID(),
        sourcePath: 'page-01.html',
        ...importHtml(
          '<!doctype html><html><head><style>h1{color:red}</style></head><body><main id="stage"><h1>Hello <em>world</em></h1><canvas id="lab"></canvas><input id="count" type="range" value="2"></main><script>window.example = 42</script></body></html>',
        ),
      }),
    ],
  });
}
function commit(version: number, title: string, id = randomUUID()) {
  return commitSchema.parse({
    baseVersion: version,
    mutationId: id,
    commands: [{ type: 'deck.update', title }],
  });
}

test('real PostgreSQL: simultaneous writes, dropped-response retry, and changed idempotency payload', async () => {
  const first = await store.create(ctx, fixture());
  const requests = [commit(1, 'A'), commit(1, 'B')];
  const results = await Promise.allSettled(
    requests.map((r) => store.commit(ctx, first.document.id, r)),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code, 'VERSION_CONFLICT');
  const index = results.findIndex((r) => r.status === 'fulfilled');
  const replay = await store.commit(ctx, first.document.id, requests[index]);
  assert.equal(replay.version, 2);
  await assert.rejects(
    () =>
      store.commit(ctx, first.document.id, {
        ...requests[index],
        commands: [{ type: 'deck.update', title: 'different' }],
      }),
    { code: 'IDEMPOTENCY_MISMATCH' },
  );
  assert.equal((await store.history(ctx, first.document.id)).length, 2);
});

test('rollback after revision and asset writes leaves head, history and mutation unchanged', async () => {
  const asset = await store.upload(ctx, { data: Buffer.from('original-image'), mime: 'image/png' }),
    doc = fixture();
  doc.assets['image.png'] = asset;
  const first = await store.create(ctx, doc);
  const request = commit(1, 'Must roll back');
  const faulty = new Store(pool, (stage) => {
    if (stage === 'before-commit') throw new Error('injected disconnect');
  });
  await assert.rejects(() => faulty.commit(ctx, doc.id, request), /injected disconnect/);
  assert.equal((await store.get(ctx, doc.id)).version, 1);
  assert.equal((await store.history(ctx, doc.id)).length, 1);
  const rows = await pool.query('SELECT version FROM editor_revision_assets WHERE document_id=$1', [
    doc.id,
  ]);
  assert.deepEqual(rows.rows, [{ version: 1 }]);
  assert.equal((await store.commit(ctx, doc.id, request)).version, 2);
});

test('historical assets survive replacement and restore; resources from other scope are rejected', async () => {
  const doc = fixture(),
    original = await store.upload(ctx, { data: Buffer.from('old'), mime: 'image/png' });
  doc.assets['image.png'] = original;
  await store.create(ctx, doc);
  const next = await store.upload(ctx, { data: Buffer.from('new'), mime: 'image/png' });
  await store.commit(
    ctx,
    doc.id,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [{ type: 'asset.put', path: 'image.png', asset: next }],
    }),
  );
  assert.equal((await store.asset(ctx, doc.id, 1, 'image.png')).data.toString(), 'old');
  assert.equal((await store.asset(ctx, doc.id, 2, 'image.png')).data.toString(), 'new');
  const restored = await store.restore(ctx, doc.id, 1, 2, randomUUID());
  assert.equal(restored.version, 3);
  assert.equal(restored.document.assets['image.png'].hash, original.hash);
  await assert.rejects(() => store.get({ scope: 'someone-else', actor: 'author' }, doc.id), {
    code: 'NOT_FOUND',
  });
  const other = fixture();
  other.assets['stolen.png'] = original;
  await assert.rejects(() => store.create({ scope: 'someone-else', actor: 'author' }, other), {
    code: 'MISSING_ASSET',
  });
});

test('object edits preserve original script and canvas; rejected batches make no partial change', async () => {
  const doc = fixture(),
    s = doc.slides[0],
    objects = inspectSlide(s),
    title = objects.find((o) => o.tag === 'h1')!,
    canvas = objects.find((o) => o.tag === 'canvas')!;
  const changed = applyCommands(
    doc,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [
        {
          type: 'element.patch',
          slideId: s.id,
          target: title.id,
          patch: { richText: 'Edited <strong>title</strong>', style: { color: 'blue' } },
        },
        {
          type: 'element.transform',
          slideId: s.id,
          target: canvas.id,
          transform: { x: 30, y: 20 },
        },
      ],
    }).commands,
  );
  assert.match(changed.slides[0].html, /window.example = 42/);
  assert.equal(inspectSlide(changed.slides[0]).find((o) => o.tag === 'canvas')!.id, canvas.id);
  assert.match(changed.slides[0].html, /translate: 30px 20px/);
  assert.throws(
    () =>
      applyCommands(
        doc,
        commitSchema.parse({
          baseVersion: 1,
          mutationId: randomUUID(),
          commands: [
            { type: 'deck.update', title: 'partial' },
            {
              type: 'element.patch',
              slideId: s.id,
              target: objects.find((o) => o.attributes.id === 'stage')!.id,
              patch: { text: 'oops' },
            },
          ],
        }).commands,
      ),
    { code: 'DESTRUCTIVE_TEXT' },
  );
  assert.equal(doc.title, 'Original');
  assert.equal(doc.slides[0].html, s.html);
});

test('HTTP authorization, immutable preview grants and portable project round trip', async () => {
  const doc = fixture();
  doc.assets['image.png'] = await store.upload(ctx, {
    data: Buffer.from('picture'),
    mime: 'image/png',
  });
  doc.assets['notale-runtime-notices.txt'] = await store.upload(ctx, {data: Buffer.from('User notes'), mime: 'text/plain'});
  await store.create(ctx, doc);
  const apps = createApps({
    store,
    secret: 'test-only-preview-key',
    contentOrigin: 'http://content.test',
    integration: { context: async () => ctx, authorize: async (_ctx, action) => action !== 'edit' },
  });
  try {
    const denied = await apps.api.inject({
      method: 'POST',
      url: `/api/documents/${doc.id}/commits`,
      payload: commit(1, 'Denied'),
    });
    assert.equal(denied.statusCode, 403);
    const preview = await apps.api.inject(`/api/documents/${doc.id}/preview`);
    assert.equal(preview.statusCode, 200);
    const url = new URL(preview.json().slides[0].url);
    const html = await apps.content.inject(url.pathname);
    assert.equal(html.statusCode, 200);
    assert.match(html.body, /window.example = 42/);
    const runtimeSource = html.body.match(/<script[^>]+src="([^"]*__notale_runtime__\/bridge\.js)"/);
    assert.ok(runtimeSource, 'preview links the isolated runtime');
    const runtimeUrl = new URL(runtimeSource[1], url);
    const runtimeResponse = await apps.content.inject(runtimeUrl.pathname + runtimeUrl.search);
    assert.equal(runtimeResponse.statusCode, 200);
    assert.match(runtimeResponse.body, /NotaleBridge/);
    const wrongVersion = await apps.content.inject(
      url.pathname.replace(`/${doc.id}/1/`, `/${doc.id}/2/`),
    );
    assert.equal(wrongVersion.statusCode, 403);
    const exported = await apps.api.inject(`/api/documents/${doc.id}/export?version=1`);
    assert.equal(exported.statusCode, 200);
    const files = unzipSync(exported.rawPayload);
    assert.ok(files['notale-project.json']);
    assert.ok(files['index.html']);
    assert.equal(Buffer.from(files['notale-runtime-notices.txt']).toString(), 'User notes');
    assert.match(Buffer.from(files['notale-runtime-notices-2.txt']).toString(), /Notale contributors/);
    assert.match(Buffer.from(files['notale-runtime-notices-2.txt']).toString(), /Apache License/);
    assert.equal(Buffer.from(files['image.png']).toString(), 'picture');
    const imported = await apps.api.inject({
      method: 'POST',
      url: '/api/import',
      payload: { data: exported.rawPayload.toString('base64') },
    });
    assert.equal(imported.statusCode, 201, imported.body);
    assert.notEqual(imported.json().document.id, doc.id);
    assert.equal(imported.json().document.slides[0].html, doc.slides[0].html);
  } finally {
    await apps.api.close();
    await apps.content.close();
  }
});

test('removing a still-referenced asset fails atomically', async () => {
  const doc = fixture();
  doc.slides[0].html = importHtml('<main id="stage"><img src="image.png"></main>').html;
  doc.assets['image.png'] = await store.upload(ctx, {
    data: Buffer.from('referenced-image'),
    mime: 'image/png',
  });
  await store.create(ctx, doc);
  await assert.rejects(
    () =>
      store.commit(
        ctx,
        doc.id,
        commitSchema.parse({
          baseVersion: 1,
          mutationId: randomUUID(),
          commands: [{ type: 'asset.remove', path: 'image.png' }],
        }),
      ),
    { code: 'MISSING_RESOURCE' },
  );
  assert.equal((await store.get(ctx, doc.id)).version, 1);
  assert.equal(
    (await store.asset(ctx, doc.id, 1, 'image.png')).data.toString(),
    'referenced-image',
  );
});

test('editor routes embed in a host plugin without replacing host identity or routes', async () => {
  const host = Fastify();
  host.get('/host-status', async () => ({ host: true }));
  let content: ReturnType<typeof createApps>['content'] | undefined;
  await host.register(async (scoped) => {
    const apps = createApps({
      api: scoped,
      store,
      secret: 'test-secret',
      contentOrigin: 'http://content.test',
      serveWorkbench: false,
      integration: {
        context: async (req) => ({ scope, actor: String(req.headers['x-host-user'] ?? '') }),
        authorize: async () => true,
      },
    });
    content = apps.content;
  });
  try {
    assert.equal((await host.inject('/host-status')).statusCode, 200);
    assert.equal((await host.inject('/api/documents')).statusCode, 401);
    assert.equal(
      (await host.inject({ url: '/api/documents', headers: { 'x-host-user': 'author' } }))
        .statusCode,
      200,
    );
    assert.equal((await host.inject('/workbench.html')).statusCode, 404);
    const schema = await host.inject('/api/schema');
    assert.equal(schema.statusCode, 200, schema.body);
    assert.ok(schema.json().commit.properties.commands);
  } finally {
    await host.close();
    await content?.close();
  }
});

test('signed content serves exact byte ranges, If-Range fallback and unsatisfiable lengths', async () => {
  const doc = fixture(),
    asset = await store.upload(ctx, { data: Buffer.from('0123456789'), mime: 'video/webm' });
  doc.assets['clip.webm'] = asset;
  await store.create(ctx, doc);
  const { api, content } = createApps({
    store,
    secret: 'range-test-secret-long-enough',
    contentOrigin: 'http://content.test',
    integration: { context: async () => ctx, authorize: async () => true },
  });
  try {
    assert.equal((await api.inject('/api/schema')).statusCode, 200);
    const preview = (await api.inject(`/api/documents/${doc.id}/preview`)).json(),
      url = new URL(preview.slides[0].url),
      path = url.pathname.replace('page-01.html', 'clip.webm');
    const part = await content.inject({ url: path, headers: { range: 'bytes=2-5' } });
    assert.equal(part.statusCode, 206);
    assert.equal(part.body, '2345');
    assert.equal(part.headers['content-range'], 'bytes 2-5/10');
    assert.equal(part.headers['content-length'], '4');
    const suffix = await content.inject({
      url: path,
      headers: { range: 'bytes=-3', 'if-range': `"${asset.hash}"` },
    });
    assert.equal(suffix.statusCode, 206);
    assert.equal(suffix.body, '789');
    const stale = await content.inject({
      url: path,
      headers: { range: 'bytes=2-5', 'if-range': '"old"' },
    });
    assert.equal(stale.statusCode, 200);
    assert.equal(stale.body, '0123456789');
    const missing = await content.inject({ url: path, headers: { range: 'bytes=10-' } });
    assert.equal(missing.statusCode, 416);
    assert.equal(missing.headers['content-range'], 'bytes */10');
    const head = await content.inject({
      method: 'HEAD',
      url: path,
      headers: { range: 'bytes=2-5' },
    });
    assert.equal(head.statusCode, 200);
    assert.equal(head.headers['content-length'], '10');
    assert.equal(head.body, '');
  } finally {
    await api.close();
    await content.close();
  }
});

test('invalid imported master CSS aborts the whole transaction and preserves prior settings', async () => {
  const doc = fixture(),
    asset = await store.upload(ctx, {
      data: Buffer.from('@import "cycle.css";'),
      mime: 'text/css',
    });
  doc.assets['cycle.css'] = asset;
  await store.create(ctx, doc);
  await assert.rejects(
    () =>
      store.commit(
        ctx,
        doc.id,
        commitSchema.parse({
          baseVersion: 1,
          mutationId: randomUUID(),
          commands: [
            { type: 'deck.update', title: 'Must roll back' },
            {
              type: 'layout.set',
              layout: {
                id: 'cyclic',
                name: 'Cycle',
                html: '<footer>Footer</footer>',
                css: '@import "cycle.css";',
              },
            },
          ],
        }),
      ),
    { code: 'CSS_IMPORT_CYCLE' },
  );
  assert.equal((await store.get(ctx, doc.id)).document.title, 'Original');
  assert.equal((await store.history(ctx, doc.id)).length, 1);
});

test('deleting a linked page requires repairing its references in the same atomic batch', async () => {
  const doc = fixture();
  doc.slides[0].html = importHtml('<main id="stage"><a href="two.html">Next</a></main>').html;
  doc.slides.push(
    slideSchema.parse({
      id: 'two',
      sourcePath: 'two.html',
      ...importHtml('<main id="stage">Second</main>'),
    }),
  );
  await store.create(ctx, doc);
  await assert.rejects(
    () =>
      store.commit(
        ctx,
        doc.id,
        commitSchema.parse({
          baseVersion: 1,
          mutationId: randomUUID(),
          commands: [{ type: 'slide.delete', slideId: 'two' }],
        }),
      ),
    { code: 'MISSING_RESOURCE' },
  );
  assert.equal((await store.get(ctx, doc.id)).version, 1);
  const target = inspectSlide(doc.slides[0]).find((o) => o.tag === 'a')!.id;
  const saved = await store.commit(
    ctx,
    doc.id,
    commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [
        { type: 'element.delete', slideId: doc.slides[0].id, target },
        { type: 'slide.delete', slideId: 'two' },
      ],
    }),
  );
  assert.equal(saved.document.slides.length, 1);
});

test('restore replay returns its original revision after later edits and rejects changed targets or actors', async () => {
  const original = await store.create(ctx, fixture()),
    id = original.document.id,
    mutationId = randomUUID();
  await store.commit(ctx, id, commit(1, 'Edited'));
  const restored = await store.restore(ctx, id, 1, 2, mutationId);
  assert.equal(restored.version, 3);
  await store.commit(ctx, id, commit(3, 'Later work'));
  const replay = await store.restore(ctx, id, 1, 2, mutationId);
  assert.equal(replay.version, 3);
  assert.equal(replay.document.title, 'Original');
  assert.equal((await store.get(ctx, id)).document.title, 'Later work');
  await assert.rejects(() => store.restore(ctx, id, 2, 2, mutationId), {
    code: 'IDEMPOTENCY_MISMATCH',
  });
  await assert.rejects(() => store.restore({ ...ctx, actor: 'other' }, id, 1, 2, mutationId), {
    code: 'IDEMPOTENCY_MISMATCH',
  });
  assert.equal((await store.history(ctx, id)).length, 4);
});

test('preview leases renew stable URLs across instances only after scoped host reauthorization', async () => {
  const doc = fixture();
  doc.assets['sound.wav'] = await store.upload(ctx, {
    data: Buffer.from('0123456789'),
    mime: 'audio/wav',
  });
  await store.create(ctx, doc);
  let identity = ctx,
    allowed = true;
  const options = {
    store,
    secret: 'shared-lease-secret',
    contentOrigin: 'http://content.test',
    integration: {
      context: async () => identity,
      authorize: async () => allowed,
    },
  };
  const first = createApps(options),
    second = createApps({ ...options, store: new Store(pool) });
  try {
    const preview = (await first.api.inject(`/api/documents/${doc.id}/preview?version=1`)).json();
    const url = new URL(preview.slides[0].url);
    const hash = (await import('../src/server/store.js')).sha256(preview.channel);
    assert.ok(preview.expiresAt > Date.now());
    assert.equal(preview.renewAfterMs, 1800000);
    const legacy = (expires: number) => {
      const payload = Buffer.from(
        JSON.stringify({ scope: ctx.scope, id: doc.id, version: 1, expires }),
      ).toString('base64url');
      return (
        payload +
        '.' +
        createHmac('sha256', 'shared-lease-secret').update(payload).digest('base64url')
      );
    };
    assert.equal(
      (
        await first.content.inject(
          url.pathname.replace(preview.channel, legacy(Date.now() + 60000)),
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await first.content.inject(url.pathname.replace(preview.channel, legacy(Date.now() - 1))))
        .statusCode,
      403,
    );

    assert.equal((await second.content.inject(url.pathname)).statusCode, 200);
    await pool.query(
      "UPDATE editor_preview_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",
      [hash],
    );
    assert.equal((await first.content.inject(url.pathname)).statusCode, 403);
    const renew = (channel = preview.channel, version = 1) =>
      second.api.inject({
        method: 'POST',
        url: `/api/documents/${doc.id}/preview/renew`,
        payload: { channel, version },
      });
    allowed = false;
    assert.equal((await renew()).statusCode, 403);
    allowed = true;
    identity = { ...ctx, actor: 'other-author' };
    assert.equal((await renew()).statusCode, 403);
    identity = { ...ctx, scope: 'other-scope' };
    assert.equal((await renew()).statusCode, 403);
    identity = ctx;
    assert.equal((await renew(preview.channel + 'x')).statusCode, 403);
    assert.equal((await renew(preview.channel, 2)).statusCode, 403);
    assert.equal((await first.content.inject(url.pathname)).statusCode, 403);
    await store.commit(ctx, doc.id, commit(1, 'New head'));
    const results = await Promise.all([renew(), renew()]);
    for (const result of results) {
      assert.equal(result.statusCode, 200, result.body);
      assert.equal(result.json().channel, preview.channel);
      assert.equal(result.json().version, 1);
    }
    assert.equal((await first.content.inject(url.pathname)).statusCode, 200);
    const assetPath = url.pathname.replace(/page-01.html$/, 'sound.wav');
    const range = await first.content.inject({ url: assetPath, headers: { range: 'bytes=2-5' } });
    assert.equal(range.statusCode, 206);
    assert.equal(range.body, '2345');
    assert.equal((await store.get(ctx, doc.id)).version, 2);
    assert.equal(
      (
        await pool.query(
          'SELECT count(*)::int AS n FROM editor_preview_leases WHERE token_hash=$1',
          [hash],
        )
      ).rows[0].n,
      1,
    );
    // Expired-row pruning is reversible only through a fresh authorized host
    // renewal. The possession of an expired URL alone never reactivates it.
    await pool.query('DELETE FROM editor_preview_leases WHERE token_hash=$1', [hash]);
    assert.equal((await first.content.inject(url.pathname)).statusCode, 403);
    assert.equal((await renew()).statusCode, 200);
    assert.equal((await first.content.inject(url.pathname)).statusCode, 200);
  } finally {
    await first.api.close();
    await first.content.close();
    await second.api.close();
    await second.content.close();
  }
});

test('native chart schema defaults preserve pre-upgrade insert and clipboard mutation replay', async () => {
  for (const kind of ['insert', 'clipboard']) {
    const doc = fixture(),
      slide = doc.slides[0];
    await store.create(ctx, doc);
    const target = inspectSlide(slide).find((o) => o.tag === 'h1')!.id;
    const request = commitSchema.parse({
      baseVersion: 1,
      mutationId: randomUUID(),
      commands: [
        kind === 'insert'
          ? {
              type: 'slide.insert',
              after: slide.id,
              slide: { ...slide, id: randomUUID(), sourcePath: 'copy.html' },
            }
          : {
              type: 'elements.transfer',
              slideId: slide.id,
              sourceSlideId: slide.id,
              sourceSnapshot: slide,
              targets: [target],
              mode: 'copy',
            },
      ],
    });
    const saved = await store.commit(ctx, doc.id, request);
    const legacy: any = structuredClone(request);
    const legacySlide =
      kind === 'insert' ? legacy.commands[0].slide : legacy.commands[0].sourceSnapshot;
    delete legacySlide.nativeCharts;
    const { sha256 } = await import('../src/server/store.js');
    await pool.query(
      'UPDATE editor_mutations SET request_hash=$1 WHERE document_id=$2 AND mutation_id=$3',
      [sha256(JSON.stringify(legacy)), doc.id, request.mutationId],
    );
    await store.commit(ctx, doc.id, commit(2, 'Later head'));
    const { api, content } = createApps({
      store,
      secret: 'native-upgrade-test-secret',
      contentOrigin: 'http://127.0.0.1:4311',
      integration: { context: async () => ctx, authorize: async () => true },
    });
    try {
      const replay = await api.inject({
        method: 'POST',
        url: `/api/documents/${doc.id}/commits`,
        payload: legacy,
      });
      assert.equal(replay.statusCode, 200, replay.body);
      assert.deepEqual(replay.json(), saved);
      const changed = structuredClone(legacy);
      const changedSlide =
        kind === 'insert' ? changed.commands[0].slide : changed.commands[0].sourceSnapshot;
      changedSlide.nativeCharts = {
        changed: { adapter: 'echarts', option: { series: [{ lineStyle: { width: 9 } }] } },
      };
      const mismatch = await api.inject({
        method: 'POST',
        url: `/api/documents/${doc.id}/commits`,
        payload: changed,
      });
      assert.equal(mismatch.statusCode, 409, mismatch.body);
      assert.equal(mismatch.json().error, 'IDEMPOTENCY_MISMATCH');
      await assert.rejects(
        () => store.commit({ ...ctx, actor: 'different' }, doc.id, commitSchema.parse(legacy)),
        { code: 'IDEMPOTENCY_MISMATCH' },
      );
      assert.equal((await store.get(ctx, doc.id)).version, 3);
      assert.equal((await store.history(ctx, doc.id)).length, 3);
    } finally {
      await api.close();
      await content.close();
    }
  }
});

test('causal sync API: pending create copy delete, missing dependency and immutable retries',async()=>{
 const doc=fixture();await store.create(ctx,doc);
 const slideId=doc.slides[0].id,target=inspectSlide(doc.slides[0]).find(o=>o.tag==='h1')!.id;
 const apps=createApps({store,secret:'test-only-causal-key',contentOrigin:'http://content.test',integration:{context:async()=>ctx,authorize:async()=>true}});
 const submit=(payload:unknown)=>apps.api.inject({method:'POST',url:`/api/documents/${doc.id}/sync/v2`,payload:payload as any});
 try{
  const animation={id:randomUUID(),target,step:1,effect:'pulse',trigger:'click',duration:1000};
  const predecessor={baseVersion:1,mutationId:randomUUID(),commands:[{type:'animation.set',slideId,animation}]};
  const copyId=randomUUID();
  const copy={baseVersion:1,mutationId:randomUUID(),dependencies:[predecessor.mutationId],commands:[{type:'animation.set',slideId,animation:{...animation,id:copyId}},{type:'animation.reorder',slideId,ids:[animation.id,copyId]}]};
  assert.equal((await submit(copy)).statusCode,409);
  assert.equal((await submit({baseVersion:1,mutationId:randomUUID(),commands:[{type:'deck.update',title:'Remote title'}]})).statusCode,200);
  assert.equal((await submit(predecessor)).statusCode,200);
  const copied=await submit(copy);assert.equal(copied.statusCode,200,copied.body);
  const remove={baseVersion:1,mutationId:randomUUID(),dependencies:[predecessor.mutationId,copy.mutationId],commands:[{type:'animation.remove',slideId,id:copyId}]};
  const removed=await submit(remove);assert.equal(removed.statusCode,200,removed.body);
  const repeated=await submit(copy);assert.equal(repeated.statusCode,200,repeated.body);assert.equal(repeated.json().committedVersion,copied.json().committedVersion);
  const changed=await submit({...copy,dependencies:[]});assert.equal(changed.statusCode,409);
  const final=await store.get(ctx,doc.id);assert.equal(final.document.title,'Remote title');assert.deepEqual(final.document.slides[0].animations.map(a=>a.id),[animation.id]);
 }finally{await apps.api.close();await apps.content.close();}
});
