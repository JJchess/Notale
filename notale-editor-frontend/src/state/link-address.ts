export function linkAddress(value: string) {
  const input = value.trim();
  if (!input) throw Error("请输入链接地址");
  let url: URL;
  const address = /^[^\s/:]+\.[^\s/:]+(?::\d+)?(?:[/?#].*)?$/.test(input)
    ? "https://" + input
    : input;
  try {
    url = new URL(address);
  } catch {
    throw Error("请输入有效的网页、邮件或电话链接");
  }
  if (!["https:", "http:", "mailto:", "tel:"].includes(url.protocol))
    throw Error("请输入网页、邮件或电话链接");
  return url.href;
}
