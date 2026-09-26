import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { getEventListeners } from 'node:events';
import { streamGoogle, isRetryableAssistantError, type Api, type Model } from '../src/server/agent/pi/index.js';

/** A model service that sends headers and then nothing: the stream must give up on its own. */
test('a stream that goes quiet is cut by the idle timer, as a retryable error, and leaves no listener behind', async () => {
  const sockets = new Set<import('node:net').Socket>();
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.flushHeaders(); });
  server.on('connection', socket => { sockets.add(socket); });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  try {
    const port = (server.address() as import('node:net').AddressInfo).port;
    const model = { id: 'm', name: 'm', api: 'google-generative-ai', provider: 'google', baseUrl: `http://127.0.0.1:${port}/v1beta`, reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100_000, maxTokens: 100 } as Model<Api>;
    const run = new AbortController();
    const started = Date.now();
    const message = await streamGoogle(model, { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] }, { apiKey: 'k', signal: run.signal, timeoutMs: 300 }).result();
    assert.equal(message.stopReason, 'error');
    assert.match(message.errorMessage ?? '', /idle timeout/);
    assert.ok(Date.now() - started < 5_000);
    assert.ok(isRetryableAssistantError(message), 'the agent retries it like any transient failure');
    assert.equal(getEventListeners(run.signal, 'abort').length, 0);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(done => server.close(done));
  }
});
