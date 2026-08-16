"""模型传输层。从 notale 搬过来的那部分基础设施,只留 planner 用得到的。

一处必须说清的落差:

  `wire.py` 是我们的**标准上下文表示**,它是对 Claude Code 抓包的减法 ——
  system[] 带 cache_control 断点、四种 content block、tool_use 交结构化数据。
  但实际能用的账号走的是 **OpenAI Responses API**(`api.999555999.com`,
  `gpt-5.6-sol`),不是 Anthropic。

  所以 wire.Request 在这里是「内部规范形式」,发出去之前由 `to_responses()`
  翻一道。好处是换供应商只改这一个函数;代价是 cache_control 断点在这条链路上
  没有对应物,prefix 复用的收益拿不到 —— 那是 Anthropic 特有的。
  这一点要记着,别把 nn-06 的 token 账直接套过来比。
"""

from __future__ import annotations

import os
import random
import time
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import yaml
from dotenv import load_dotenv
from openai import (APIConnectionError, APITimeoutError, InternalServerError,
                    OpenAI, RateLimitError)

from .wire import Request

ROOT = Path(__file__).resolve().parents[1]


_OVERRIDE: dict = {}


def override(**kw) -> None:
    """按轮覆盖模型/端点。同一套 harness 要跑不同模型做对照,
    写死在 config.yaml 里就只能改文件、跑一轮、再改回来 —— 那样并发对照做不了。"""
    _OVERRIDE.update({k: v for k, v in kw.items() if v})
    config.cache_clear()
    client.cache_clear()


@lru_cache(maxsize=1)
def config() -> dict:
    load_dotenv(ROOT / ".env.local")
    c = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    c["model"].update(_OVERRIDE)
    return c


@lru_cache(maxsize=1)
def client() -> OpenAI:
    m = config()["model"]
    key = os.getenv(m["api_key_env"])
    if not key:
        raise RuntimeError(f"环境变量 {m['api_key_env']} 没有值,检查 .env.local")
    # base_url 没写路径时要补 /v1 —— 直接用裸域名会 503。notale 那边同样处理。
    p = urlsplit(m["base_url"].strip())
    base = urlunsplit((p.scheme, p.netloc, p.path.rstrip("/") or "/v1", p.query, p.fragment))
    return OpenAI(api_key=key, base_url=base, timeout=m["http_timeout_sec"],
                  max_retries=0)  # 重试由我们自己管,不让 SDK 和上层各退避一次


@dataclass
class Reply:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    raw: object = None


def to_responses(req: Request) -> dict:
    """wire.Request → Responses API 请求体。

    system 块拼成 instructions;messages 里的 text 块拼成 input。
    cache_control 在这一侧无对应物,直接丢掉 —— 丢的是信息不是语义。
    """
    instructions = "\n\n".join(b.text for b in req.system)
    parts: list[str] = []
    for m in req.messages:
        for b in m.content:
            if getattr(b, "type", None) == "text":
                parts.append(b.text)
    body = {
        "model": req.model,
        "instructions": instructions,
        "input": "\n\n".join(parts),
        "max_output_tokens": req.max_tokens,
    }
    effort = (req.output_config or {}).get("effort")
    if effort:
        body["reasoning"] = {"effort": effort}
    return body


# 退避梯子。这条中转链路上 429 和 503 都常见,而 planner 的每一步都是几分钟的
# 长生成 —— 失败重来的代价远高于多等一会,所以梯子拉长而不是拉密。
LADDER = (5, 15, 40, 90, 180, 300, 300, 300)


def ask(req: Request) -> Reply:
    """发一次调用,拿回文本。planner 的每一步都是一次这个。"""
    body = to_responses(req)
    last: Exception | None = None
    for i, wait in enumerate((0,) + LADDER):
        if wait:
            print(f"      上游 {type(last).__name__},等 {wait}s 重试 ({i}/{len(LADDER)})",
                  flush=True)
            time.sleep(wait)
        try:
            return _once(body)
        except (RateLimitError, InternalServerError, APIConnectionError, APITimeoutError) as e:
            last = e
    raise last


def respond(instructions: str, history: list, tools: list[dict], effort: str,
            tag: str = "-"):
    """带工具的一次调用,返回原始 response 对象。builder 的每一步都是一次这个。

    历史用 Responses 自己的 item 形态存,不经 wire.Message 转一道。
    理由很实际:`function_call` item 带 `call_id` 和内部 `id`,原样回传是已验证可行的
    路径;手工重建这些字段是没必要的风险。wire.py 仍是我们描述上下文的标准形式,
    但在这条链路上它只用于**记录**,不用于**重放**。
    """
    m = config()
    body = {"model": m["model"]["name"], "instructions": instructions,
            "input": history, "tools": tools, "store": False,
            "max_output_tokens": m["model"]["max_output_tokens"],
            "reasoning": {"effort": effort}}
    last: Exception | None = None
    for i, wait in enumerate((0,) + LADDER):
        if wait:
            # 抖动 ±30%。没有抖动时并发的 worker 会齐步退避、齐步重来,撞在一起
            # 继续限流 —— 实测 20 并发下累计空等 84 分钟,相当一部分是这么来的。
            w = wait * (0.7 + 0.6 * random.random())
            print(f"      [{tag}] {type(last).__name__} 等 {w:.0f}s 重试 {i}/{len(LADDER)}",
                  flush=True)
            time.sleep(w)
        try:
            return client().responses.create(**body)
        except (RateLimitError, InternalServerError, APIConnectionError, APITimeoutError) as e:
            last = e
    print(f"      [{tag}] 退避耗尽: {type(last).__name__}", flush=True)
    raise last


def text_of(r) -> str:
    """自己抽文本,不用 SDK 的 r.output_text。

    Sonnet 经这条链路回来的响应里会有 text=None 的内容块,SDK 那个 property
    直接 "".join(texts) 就抛 TypeError,把整轮 planner 打断 —— 实测 s5-nn 和
    s5-orb 都死在这。跳过 None 即可。
    """
    out = []
    for item in getattr(r, "output", None) or []:
        for c in getattr(item, "content", None) or []:
            t = getattr(c, "text", None)
            if isinstance(t, str):
                out.append(t)
    return "".join(out)


def _once(body: dict) -> Reply:
    r = client().responses.create(**body)
    u = getattr(r, "usage", None)
    return Reply(
        text=text_of(r).strip(),
        input_tokens=int(getattr(u, "input_tokens", 0) or 0),
        output_tokens=int(getattr(u, "output_tokens", 0) or 0),
        raw=r,
    )


def fill(text: str, **kw: object) -> str:
    """只替换指定的键,别的花括号原样留着。

    不能用 str.format:提示词里本来就有 `Lec.mount({index, kicker, title, take})`
    这种 JS 片段,format 会把它当占位符炸掉。提示词只会越来越多代码,
    所以换成字面替换,而不是每处去转义。
    """
    for k, v in kw.items():
        text = text.replace("{" + k + "}", str(v))
    return text


def strip_fence(text: str) -> str:
    """去掉模型习惯性包上的 ``` 围栏。

    我们让模型直接吐文件内容而不是走 tool_use,因为这条链路的工具调用形态
    和 Anthropic 不一样;代价就是要自己剥围栏。
    """
    t = text.strip()
    if not t.startswith("```"):
        return t
    lines = t.split("\n")
    if lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    return "\n".join(lines[1:]).strip() + "\n"
