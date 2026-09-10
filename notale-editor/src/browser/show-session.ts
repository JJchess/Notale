export type ShowCheckpoint = {
  documentId: string;
  version: number;
  slideId: string;
  step: number;
  max: number;
  started: number;
  blank: boolean;
  speaker: boolean;
  overview: boolean;
};
/** A session is tied to an immutable revision; saved indexes cannot silently
 * refer to different pages after an editor reorders the document. */
export function readShowCheckpoint(
  raw: string | null,
  documentId: string,
  version: number,
): ShowCheckpoint | undefined {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (
      !value ||
      value.documentId !== documentId ||
      value.version !== version ||
      typeof value.slideId !== 'string' ||
      !Number.isSafeInteger(value.step) ||
      value.step < 0 ||
      value.step > 500 ||
      !Number.isSafeInteger(value.max) ||
      value.max < value.step ||
      value.max > 500 ||
      !Number.isFinite(value.started) ||
      value.started <= 0 ||
      value.started > Date.now() + 1000 ||
      !['blank', 'speaker', 'overview'].every((key) => typeof value[key] === 'boolean')
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}
