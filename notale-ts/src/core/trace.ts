/** Python transcript schema; synchronous append keeps each call pair atomic in Node. */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { redact } from './redact.js';
import { jsonText, parsePythonJson } from './json.js';

type Block = Record<string, unknown>;
export class TraceWriter {
  private previous: string | undefined;
  constructor(readonly file: string, readonly session: string, private readonly env: NodeJS.ProcessEnv = process.env) {}
  private clean<T>(value: T): T { return parsePythonJson(redact(jsonText(value), this.env)); }
  add(request: Block[], text: string, usage: Block, rid: string, started: string, finished: string, tag?: Block): void {
    const userId = randomUUID(), assistantId = randomUUID();
    const common = { sessionId: this.session, isSidechain: false, requestId: rid };
    const user = { ...common, uuid: userId, ...(this.previous ? { parentUuid: this.previous } : {}), timestamp: started, type: 'user', message: { role: 'user', content: this.clean(request) } };
    const assistant = { ...common, uuid: assistantId, parentUuid: userId, timestamp: finished, type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: redact(text, this.env) }], usage }, ...(tag ? { toolUseResult: this.clean(tag) } : {}) };
    appendFileSync(this.file, jsonText(user, { compact: true, nonFiniteAsNull: true }) + '\n' + jsonText(assistant, { compact: true, nonFiniteAsNull: true }) + '\n', 'utf8');
    this.previous = assistantId;
  }
  tool(input: { rid: string; call_id: string; page: string; name: string; arguments: string; output: string; started: string; finished: string; seconds: number; images?: Array<[string, string]> }): void {
    const images = (input.images ?? []).map(([mimeType, encoded]) => {
      // Buffer.from silently accepts invalid base64; Python validate=True does not.
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Invalid base64 image evidence');
      const data = Buffer.from(encoded, 'base64');
      const sha256 = createHash('sha256').update(data).digest('hex');
      const relative = `.trace-images/${sha256}`;
      const file = path.join(path.dirname(this.file), relative);
      mkdirSync(path.dirname(file), { recursive: true });
      if (!existsSync(file)) writeFileSync(file, data);
      return { path: relative, mimeType, sha256, bytes: data.length };
    });
    const { rid, finished, images: _images, ...fields } = input;
    const row = { uuid: randomUUID(), ...(this.previous ? { parentUuid: this.previous } : {}), sessionId: this.session, isSidechain: false, timestamp: finished, type: 'system', requestId: rid,
      message: { role: 'system', content: [] }, toolUseResult: this.clean({ ...fields, images }) };
    appendFileSync(this.file, jsonText(row, { compact: true, nonFiniteAsNull: true }) + '\n', 'utf8');
    // Tool evidence does not advance the request/response parent cursor in the baseline.
  }
}
