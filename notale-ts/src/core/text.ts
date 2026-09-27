/** UTF-8 file/process text with LF newlines; `strict` throws on invalid bytes instead of substituting U+FFFD. */
export const decodeText = (bytes: Uint8Array, strict = true): string =>
  new TextDecoder('utf-8', { fatal: strict, ignoreBOM: true }).decode(bytes).replace(/\r\n?/g, '\n');
