export interface ModelRef { providerId: string; modelId: string }
export interface ModelCatalog {
  defaultModel?: ModelRef;
  providers: { id: string; label: string; models: { id: string; label: string; configured: boolean }[] }[];
}
export function parseModelRef(value: unknown): ModelRef | undefined {
  if (!value || typeof value !== 'object') return;
  const model = value as Record<string, unknown>;
  if (typeof model.providerId === 'string' && model.providerId && typeof model.modelId === 'string' && model.modelId) return { providerId: model.providerId, modelId: model.modelId };
}
export function sameModel(a?: ModelRef, b?: ModelRef) { return a?.providerId === b?.providerId && a?.modelId === b?.modelId; }
export function lastModel(): ModelRef | undefined {
  try { return parseModelRef(JSON.parse(localStorage.getItem('notale-model') ?? 'null')); } catch { return; }
}
export function rememberModel(model: ModelRef) { try { localStorage.setItem('notale-model', JSON.stringify(model)); } catch { /* The draft still carries the choice. */ } }
