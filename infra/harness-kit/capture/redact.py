"""脱敏层。

采集下来的东西必然带密钥。proxy 抓的是完整请求(含请求头),trajectory 里
逐字记着模型跑过的 shell 输出 —— 实测有一轮的记录里就这样混进了一个真实
API key,推 GitHub 之前才被内容级扫描拦下。

靠 `.gitignore` 躲开是绕过不是修复:采集数据是做时间和成本审计的唯一来源,
不该永远不能分享。**每次采集完先擦一遍再说别的。**

两条防线,缺一不可:

1. **已知值** —— 从环境变量里取我们自己的密钥原值,逐字替换。这条最准,
   因为它认的是值不是形状。
2. **通用形态** —— 别人的 key、会话 token、JWT、私钥块。我们不知道它们的值,
   只能按形状拦。

    from redact import redact
    redact(text)                                  # 返回脱敏后的文本

    python3 redact.py runs/<label>/*.json ...     # 就地擦已有文件
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# 名字里带这些词的环境变量,值当作密钥
_SECRETY = re.compile(r"(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL)", re.I)

# 形态兜底。每一条都在真实数据里验证过误报情况:
#   AIza 那条实测在 base64 数据流里会撞(匹配长度 82,真 key 是 39),
#   所以用 \b 和精确长度收紧,而不是 {30,}。
_PATTERNS = [
    ("sk", re.compile(r"sk-(?:ant-)?[A-Za-z0-9_-]{30,}")),
    ("aws", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("github", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b")),
    ("google", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("xai", re.compile(r"\bxai-[A-Za-z0-9]{20,}\b")),
    ("bearer", re.compile(r"([Bb]earer\s+)[A-Za-z0-9._~+/=-]{30,}")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+")),
    ("privkey", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----")),
]


def known() -> dict[str, str]:
    """环境里我们自己的密钥:{值: 变量名}。值短于 16 字符的不算,免得误伤。

    只取值,不取形状 —— 这条防线认得准,能拦住形态兜底漏掉的自定义格式。
    """
    out: dict[str, str] = {}
    for k, v in os.environ.items():
        if v and len(v) >= 16 and _SECRETY.search(k) and not v.startswith(("http://", "https://")):
            out[v] = k
    return out


def redact(text: str, extra: dict[str, str] | None = None) -> str:
    if not text:
        return text
    for val, name in sorted({**known(), **(extra or {})}.items(), key=lambda x: -len(x[0])):
        text = text.replace(val, f"<redacted:{name}>")
    for name, pat in _PATTERNS:
        text = pat.sub(lambda m: (m.group(1) if pat.groups else "") + f"<redacted:{name}>", text)
    return text


def scrub(path: Path) -> tuple[int, int]:
    """就地擦一个文件。返回 (原字节数, 擦掉多少处)。"""
    raw = path.read_text(encoding="utf-8", errors="replace")
    out = redact(raw)
    n = out.count("<redacted:") - raw.count("<redacted:")
    if n:
        path.write_text(out, encoding="utf-8")
    return len(raw), n


def main() -> None:
    # .env.local 里的密钥要先进环境,`known()` 才认得出它们。
    # python-dotenv 不是硬依赖 —— 没装就只靠形态兜底,少一条防线但不至于跑不起来。
    try:
        from dotenv import load_dotenv
        for candidate in (Path.cwd() / ".env.local", Path(__file__).resolve().parents[1] / ".env.local"):
            if candidate.is_file():
                load_dotenv(candidate)
    except ImportError:
        print("  (未装 python-dotenv,只用形态兜底)")
    files = [Path(a) for a in sys.argv[1:]]
    if not files:
        print("用法: python3 redact.py <文件...>")
        return
    for f in files:
        if not f.is_file():
            continue
        size, n = scrub(f)
        print(f"  {f}  {size // 1024}KB  擦掉 {n} 处" if n else f"  {f}  干净")


if __name__ == "__main__":
    main()
