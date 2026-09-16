/** Rewrite candidate URLs without splitting commas inside data URLs or descriptors. */
export function rewriteSrcset(source: string, rewrite: (url: string) => string): string {
  const space = (char: string) => /[\t\n\f\r ]/.test(char);
  let at = 0, copied = 0, result = '';
  while (at < source.length) {
    while (at < source.length && (space(source[at]) || source[at] === ',')) at++;
    const start = at;
    while (at < source.length && !space(source[at])) at++;
    let end = at;
    while (end > start && source[end - 1] === ',') end--;
    if (end > start) {
      result += source.slice(copied, start) + rewrite(source.slice(start, end));
      copied = end;
    }
    if (end < at) continue;
    let parentheses = 0;
    while (at < source.length) {
      const char = source[at++];
      if (char === '(') parentheses++;
      else if (char === ')') parentheses = Math.max(0, parentheses - 1);
      else if (char === ',' && !parentheses) break;
    }
  }
  return result + source.slice(copied);
}
