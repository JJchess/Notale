import { z } from "zod";

export const protocolVersion = 1 as const;

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const createRunRequestSchema = z.object({
  query: z.string(),
  templateId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  // Python argparse imposes no safe-integer quota on duration.
  minutes: z.number().refine(Number.isInteger, "expected an integer").default(90),
  audience: z.string().default("学过一点相关基础、但没系统学过这个题目的读者"),
  scenario: z.string().default(""),
  style: z.string().default(""),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const pageProgressSchema = z.object({
  pageId: z.string(), pageTitle: z.string(),
  state: z.enum(['pending', 'generating', 'checking', 'reworking', 'ready', 'failed', 'cancelled', 'unknown']),
  message: z.string().optional(), previewUrl: z.string().optional(), updatedAt: z.string().optional(),
});
export type PageProgress = z.infer<typeof pageProgressSchema>;

export const runEventKindSchema = z.enum([
  "run.started",
  "phase.changed",
  "workflow.progress",
  "plan.ready",
  "page.progress",
  "page.started",
  "page.ready",
  "artifact.ready",
  "run.completed",
  "run.failed",
  "run.cancelled",
]);
export type RunEventKind = z.infer<typeof runEventKindSchema>;

export const runEventSchema = z.object({
  protocolVersion: z.literal(protocolVersion),
  runId: z.string(),
  sequence: z.number().int().positive(),
  timestamp: z.string().datetime(),
  kind: runEventKindSchema,
  message: z.string(),
  phase: z.string().optional(),
  workflow: z.object({
    module: z.enum(['planner', 'director']), step: z.string(),
    status: z.enum(['started', 'completed', 'reworking', 'failed', 'skipped']),
    occurredAt: z.string().datetime(),
  }).optional(),
  pages: z.array(pageProgressSchema).optional(),
  pageState: pageProgressSchema.shape.state.optional(),
  pageId: z.string().optional(),
  pageTitle: z.string().optional(),
  previewUrl: z.string().optional(),
});
export type RunEvent = z.infer<typeof runEventSchema>;

export const runSnapshotSchema = z.object({
  protocolVersion: z.literal(protocolVersion),
  id: z.string(),
  status: runStatusSchema,
  request: createRunRequestSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSequence: z.number().int().nonnegative(),
  pages: z.array(pageProgressSchema).optional(),
  phase: z.string().optional(),
  error: z.string().optional(),
  previewUrl: z.string().optional(),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

const color = z.string().regex(/^#[0-9a-f]{6}$/i, "expected a six-digit hex color");
export const lectureThemeSchema = z.object({
  background: color,
  surface: color,
  foreground: color,
  muted: color,
  accent: color,
  border: color,
  success: color,
  warning: color,
  error: color,
});
export type LectureTheme = z.infer<typeof lectureThemeSchema>;

export const codeRuntimeSchema = z.object({
  language: z.literal("python"),
  packages: z.array(z.string()).default([]),
});
export type CodeRuntime = z.infer<typeof codeRuntimeSchema>;

export const artifactManifestSchema = z.object({
  protocolVersion: z.literal(protocolVersion),
  runId: z.string(),
  entry: z.string(),
  files: z.array(z.string()),
  createdAt: z.string().datetime(),
});
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;
