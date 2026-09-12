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
  query: z.string().trim().min(1).max(10_000),
  minutes: z.number().int().min(1).max(360).default(45),
  audience: z.string().trim().max(2_000).default("具备基础知识的学习者"),
  scenario: z.string().trim().max(2_000).default("课堂讲授与课后复习"),
  style: z.string().trim().max(2_000).default("根据内容选择克制、清晰的教学视觉"),
});
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;

export const runEventKindSchema = z.enum([
  "run.started",
  "phase.changed",
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
