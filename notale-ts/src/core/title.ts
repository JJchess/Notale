/** Shared by conversational generation and hosts that start a run directly. */
export const TITLE_MAX = 300;
export const AUTO_TITLE_MAX = 80;
export const TITLE_INSTRUCTION = '为讲义拟一个准确、简洁的标题，通常不超过 80 个字符。沿用作者明确指定的标题；否则概括主题，不照抄整段请求，不添加引号、解释或宣传语，使用作者要求的语言。';

export function normalizeTitle(value: unknown, limit = TITLE_MAX): string | undefined {
  if (typeof value !== 'string') return undefined;
  const title = value.replace(/\s+/gu, ' ').trim();
  // Match the editor schema's UTF-16 length limit without leaving half a surrogate pair.
  return title.slice(0, limit).replace(/[\uD800-\uDBFF]$/u, '') || undefined;
}
