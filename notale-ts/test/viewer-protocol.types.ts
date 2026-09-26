// Compile-time only (npm run typecheck): what this server sends must fit what the Viewer declares
// it reads, and what the Viewer sends must fit what this server accepts. The Viewer keeps its own
// copy of the protocol (it builds alone); this is what notices when the two drift apart.
import type * as viewer from '../../notale-viewer/src/lib/protocol.js';
import type * as viewerSession from '../../notale-viewer/src/lib/session-protocol.js';
import type { CreateRunRequest, RunEvent, RunSnapshot, createRunRequestSchema } from '../src/protocol/index.js';
import type { Entry } from '../src/session/session.js';
import type { TurnEvent } from '../src/session/turn.js';
import type { z } from 'zod';

type Fits<From, To> = [From] extends [To] ? true : never;
export const checks: [
  Fits<RunSnapshot, viewer.RunSnapshot>,
  Fits<RunEvent, viewer.RunEvent>,
  Fits<viewer.CreateRunRequest, z.input<typeof createRunRequestSchema>>,
  Fits<CreateRunRequest, viewer.CreateRunRequest>,
  Fits<Entry, viewerSession.Entry>,
  Fits<TurnEvent, viewerSession.TurnEvent>,
] = [true, true, true, true, true, true];
