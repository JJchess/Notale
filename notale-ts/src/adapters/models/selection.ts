import { z } from 'zod';

export const modelRefSchema = z.object({ providerId: z.string().min(1), modelId: z.string().min(1) }).strict();
export type ModelRef = z.infer<typeof modelRefSchema>;
export const modelSelectionSchema = z.object({
  default: modelRefSchema,
  providers: z.record(z.string(), z.object({
    label: z.string(),
    models: z.record(z.string(), z.object({ label: z.string(), profile: z.string() })),
  })),
});

export function modelErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/\b503\b|UNAVAILABLE|high demand/i.test(message)) return '模型服务繁忙（503），请稍后重试或切换模型。';
  if (/\b429\b|RESOURCE_EXHAUSTED/i.test(message)) return '模型服务限流或额度不足（429），请稍后重试或切换模型。';
  if (/\b40[13]\b|UNAUTHENTICATED|PERMISSION_DENIED/i.test(message)) return '模型服务鉴权失败，请检查服务端凭据或模型权限。';
  if (/timeout|timed out/i.test(message)) return '模型响应超时，请重试或切换模型。';
  if (cause instanceof Error && cause.name === 'AbortError') return '已停止。';
  return message;
}
