/** Single-byte ranges. Unsupported/malformed range syntax is ignored (full 200).
 * A valid but unsatisfiable range yields 416. Multipart ranges fall back to 200. */
export function byteRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | null | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  const first = match[1] ? Number(match[1]) : undefined,
    last = match[2] ? Number(match[2]) : undefined;
  if (
    (first !== undefined && !Number.isSafeInteger(first)) ||
    (last !== undefined && !Number.isSafeInteger(last))
  )
    return null;
  if (!size || (first === undefined && last === 0)) return null;
  const start = first ?? Math.max(0, size - last!),
    end = first === undefined ? size - 1 : Math.min(size - 1, last ?? size - 1);
  if (start >= size || start > end) return null;
  return { start, end };
}
