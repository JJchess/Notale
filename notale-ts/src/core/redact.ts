const secretName = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)/i;
const patterns = [
  /sk-(?:ant-)?[A-Za-z0-9_-]{30,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bxai-[A-Za-z0-9]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let result = text;
  const values = Object.entries(env)
    .filter(([name, value]) => secretName.test(name) && value && value.length >= 16 && !/^https?:/.test(value))
    .sort((a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0));
  for (const [name, value] of values) result = result.replaceAll(value!, `<redacted:${name}>`);
  for (const pattern of patterns) result = result.replace(pattern, "<redacted:secret>");
  return result;
}
