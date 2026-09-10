import { posix } from 'node:path';
import valueParser from 'postcss-value-parser';
export function rebaseUrl(value: string, from: string, to: string) {
  if (!value || /^(#|[a-z][\w+.-]*:|\/)/i.test(value)) return value;
  const split = value.search(/[?#]/),
    path = split < 0 ? value : value.slice(0, split),
    suffix = split < 0 ? '' : value.slice(split);
  return (
    (posix.relative(posix.dirname(to), posix.join(posix.dirname(from), path)) ||
      posix.basename(path)) + suffix
  );
}
export function rebaseCss(
  css: string,
  from: string,
  to: string,
  ids: ReadonlyMap<string, string> = new Map(),
) {
  const parsed = valueParser(css);
  parsed.walk((node) => {
    if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
    const first = node.nodes[0],
      url =
        node.nodes.length === 1 && first?.type === 'string'
          ? first.value
          : valueParser.stringify(node.nodes).trim();
    const value =
      url.startsWith('#') && ids.has(url.slice(1))
        ? '#' + ids.get(url.slice(1))
        : rebaseUrl(url, from, to);
    const replacement = valueParser(`url(${JSON.stringify(value)})`).nodes[0];
    if (replacement.type === 'function') node.nodes = replacement.nodes;
    return false;
  });
  return parsed.toString();
}
export function rebaseTheme(theme: Record<string, string>, from: string, to: string) {
  return Object.fromEntries(
    Object.entries(theme).map(([key, value]) => [key, rebaseCss(value, from, to)]),
  );
}
