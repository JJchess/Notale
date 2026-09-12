import { EventEmitter } from "node:events";
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  protocolVersion,
  runEventSchema,
  runSnapshotSchema,
  type CreateRunRequest,
  type RunEvent,
  type RunEventKind,
  type RunSnapshot,
} from "../protocol/index.js";
import { redact } from "./redact.js";

const runIdPattern = /^[a-z0-9][a-z0-9-]{7,80}$/;

function assertRunId(id: string): void {
  if (!runIdPattern.test(id)) throw new Error(`Invalid run id: ${id}`);
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export class RunStore {
  readonly root: string;
  readonly #events = new EventEmitter();
  readonly #writes = new Map<string, Promise<unknown>>();

  constructor(root: string) {
    this.root = path.resolve(root);
    this.#events.setMaxListeners(200);
  }

  runDir(id: string): string {
    assertRunId(id);
    return path.join(this.root, id);
  }

  async create(request: CreateRunRequest): Promise<RunSnapshot> {
    await mkdir(this.root, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
    const id = `${stamp}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const snapshot: RunSnapshot = {
      protocolVersion,
      id,
      status: "queued",
      request,
      createdAt: now,
      updatedAt: now,
      lastSequence: 0,
    };
    const directory = this.runDir(id);
    await mkdir(path.join(directory, "output"), { recursive: true });
    await writeJsonAtomic(path.join(directory, "run.json"), snapshot);
    await writeFile(path.join(directory, "events.jsonl"), "", "utf8");
    return snapshot;
  }

  async get(id: string): Promise<RunSnapshot> {
    const raw = await readFile(path.join(this.runDir(id), "run.json"), "utf8");
    return runSnapshotSchema.parse(JSON.parse(raw));
  }

  async list(): Promise<RunSnapshot[]> {
    await mkdir(this.root, { recursive: true });
    const names = await readdir(this.root);
    const rows = await Promise.all(names.filter((name) => runIdPattern.test(name)).map(async (name) => {
      try { return await this.get(name); } catch { return undefined; }
    }));
    return rows.filter((row): row is RunSnapshot => Boolean(row)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(id: string, change: Partial<Pick<RunSnapshot, "status" | "phase" | "error" | "previewUrl">>): Promise<RunSnapshot> {
    const current = await this.get(id);
    const next = runSnapshotSchema.parse({ ...current, ...change, updatedAt: new Date().toISOString() });
    await writeJsonAtomic(path.join(this.runDir(id), "run.json"), next);
    return next;
  }

  async emit(id: string, kind: RunEventKind, message: string, details: Partial<Omit<RunEvent, "protocolVersion" | "runId" | "sequence" | "timestamp" | "kind" | "message">> = {}): Promise<RunEvent> {
    return this.#serialize(id, async () => {
      const snapshot = await this.get(id);
      const event = runEventSchema.parse({
        protocolVersion,
        runId: id,
        sequence: snapshot.lastSequence + 1,
        timestamp: new Date().toISOString(),
        kind,
        message: redact(message),
        ...details,
      });
      await appendFile(path.join(this.runDir(id), "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
      const next = runSnapshotSchema.parse({
        ...snapshot,
        updatedAt: event.timestamp,
        lastSequence: event.sequence,
        ...(event.phase ? { phase: event.phase } : {}),
        ...(event.previewUrl ? { previewUrl: event.previewUrl } : {}),
      });
      await writeJsonAtomic(path.join(this.runDir(id), "run.json"), next);
      this.#events.emit(id, event);
      return event;
    });
  }

  async events(id: string, after = 0): Promise<RunEvent[]> {
    const raw = await readFile(path.join(this.runDir(id), "events.jsonl"), "utf8");
    return raw.split("\n").filter(Boolean).map((line) => runEventSchema.parse(JSON.parse(line))).filter((event) => event.sequence > after);
  }

  subscribe(id: string, listener: (event: RunEvent) => void): () => void {
    assertRunId(id);
    this.#events.on(id, listener);
    return () => this.#events.off(id, listener);
  }

  /** Capture persisted history and attach a live listener in the same per-run write queue. */
  async replayAndSubscribe(id: string, after: number, listener: (event: RunEvent) => void): Promise<{ snapshot: RunSnapshot; events: RunEvent[]; unsubscribe: () => void }> {
    return this.#serialize(id, async () => {
      const snapshot = await this.get(id);
      const events = await this.events(id, after);
      if (["completed", "failed", "cancelled"].includes(snapshot.status)) {
        return { snapshot, events, unsubscribe: () => undefined };
      }
      const unsubscribe = this.subscribe(id, listener);
      return { snapshot, events, unsubscribe };
    });
  }

  async #serialize<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#writes.get(id) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    this.#writes.set(id, current);
    try { return await current; }
    finally { if (this.#writes.get(id) === current) this.#writes.delete(id); }
  }
}
