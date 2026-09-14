/** Two-layer redaction from core/redact.py: known values, then named shapes. */
const secretName = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)/i;
const patterns: Array<[string, RegExp]> = [
  ['sk', /sk-(?:ant-)?[A-Za-z0-9_-]{30,}/g],
  ['aws', /\bAKIA[0-9A-Z]{16}\b/g],
  ['github', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
  ['google', /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ['xai', /\bxai-[A-Za-z0-9]{20,}\b/g],
  ['bearer', /([Bb]earer\s+)[A-Za-z0-9._~+/=-]{30,}/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g],
  ['privkey', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g],
];
// Python re uses Unicode word boundaries; JS \b otherwise treats Chinese as punctuation.
const word = '[\\p{L}\\p{N}_]';
const boundary = `(?:(?<=${word})(?!${word})|(?<!${word})(?=${word}))`;
const unicodePatterns: Array<[string, RegExp]> = patterns.map(([name, pattern]) => [name, new RegExp(pattern.source.replaceAll('\\b', boundary), 'gu')]);
export function known(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (value && [...value].length >= 16 && secretName.test(name) && !value.startsWith('http://') && !value.startsWith('https://')) result[value] = name;
  }
  return result;
}
export function redact(text: string, env: NodeJS.ProcessEnv = process.env, extra: Record<string, string> = {}): string {
  if (!text) return text;
  for (const [value, name] of Object.entries({ ...known(env), ...extra }).sort((a, b) => [...b[0]].length - [...a[0]].length)) text = text.replaceAll(value, `<redacted:${name}>`);
  for (const [name, pattern] of unicodePatterns) text = text.replace(pattern, (...match) => (name === 'bearer' ? match[1] : '') + `<redacted:${name}>`);
  return text;
}
