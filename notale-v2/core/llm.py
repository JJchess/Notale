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
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit

import yaml
from dotenv import load_dotenv
from openai import (APIConnectionError, APITimeoutError, BadRequestError,
                    InternalServerError, OpenAI, RateLimitError)

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
    truncated: bool = False


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


# ── chat-completions 适配层 ─────────────────────────────────
# 为什么要这一层:并行云的账号被砍到只剩 8 个 GLM/OCR 模型,`gpt-5.6-sol` 只在
# `api.999555999.com/v1/chat/completions` 上还能用 —— 那条路由**不支持 responses**
# (POST /v1/responses 回 200 + `{"detail":"Internal server error"}`)。
#
# 做法是**在边界处冒充 responses 对象**,不改 planner 和 builder。
# builder 直接吃 `r.output` 里 `type=="function_call"` 的 item、拿 `.call_id`
# 原样回传,那条路径是验证过的;为了换一条 wire 去重写它是没必要的风险。
# 所以这里造出同样形状的壳,让上面两层看不出区别。


def wire() -> str:
    return str(config()["model"].get("wire_api", "responses")).lower()


class _Item:
    """冒充 Responses 的一个 output item。"""

    def __init__(self, type_, *, name="", arguments="", call_id="", text=None, id_=""):
        self.type, self.name, self.arguments, self.call_id = type_, name, arguments, call_id
        self.id = id_
        self.content = [SimpleNamespace(type="output_text", text=text)] if text is not None else []

    def model_dump(self) -> dict:
        if self.type == "function_call":
            return {"type": "function_call", "name": self.name,
                    "arguments": self.arguments, "call_id": self.call_id, "id": self.id}
        return {"type": "message", "role": "assistant",
                "content": [{"type": "output_text", "text": c.text} for c in self.content]}


class _Resp:
    """冒充 Responses 的响应对象。"""

    def __init__(self, output, usage, truncated, rid):
        self.output, self.usage, self.id = output, usage, rid
        self.status = "incomplete" if truncated else "completed"
        self.incomplete_details = (SimpleNamespace(reason="max_output_tokens")
                                   if truncated else None)


# chat 的 message 里,推理放在这些键上。**必须显式跳过。**
# 这条是量出来的,代价很大:`reasoning` 被拼进正文那一次,`lec.js` 连续六次被判
# 「推理稿」、spec 重试 11 次、上限从 8,000 加到 40,000 每档打满,而我据此写下的
# 「DeepSeek 把推理稿当文件输出」是**错的**。换 wire 不能把这个坑再挖一遍。
_CHAT_REASONING_KEYS = ("reasoning", "reasoning_content", "thinking")


def _adapt_chat(r, want: int | None = None) -> _Resp:
    ch = (getattr(r, "choices", None) or [None])[0]
    msg = getattr(ch, "message", None)
    out: list[_Item] = []
    txt = getattr(msg, "content", None) if msg else None
    if isinstance(txt, str) and txt.strip():
        out.append(_Item("message", text=txt))
    for tc in (getattr(msg, "tool_calls", None) or []) if msg else []:
        fn = getattr(tc, "function", None)
        out.append(_Item("function_call", name=getattr(fn, "name", "") or "",
                         arguments=getattr(fn, "arguments", "") or "{}",
                         call_id=getattr(tc, "id", "") or "",
                         id_=getattr(tc, "id", "") or ""))
    # 没见过的形状要吵,别默默收下 —— 和 text_of 里那条白名单同一个道理。
    if msg is not None and not out:
        extra = [k for k in _CHAT_REASONING_KEYS if getattr(msg, k, None)]
        print(f"      ⚠ chat 响应里正文为空"
              f"{'(内容全在 ' + '/'.join(extra) + ',已跳过)' if extra else ''}"
              f",finish_reason={getattr(ch, 'finish_reason', None)} —— "
              f"产物缺内容先查这里,不要先怀疑模型。", flush=True)
    # usage 的字段名两边不一样:chat 是 prompt_tokens/completion_tokens,
    # responses 是 input_tokens/output_tokens。不换名的话上层读到的全是 0 ——
    # 而那两个数是日志、成本和「输出打满没打满」的判据,读成 0 等于这些判据全瞎。
    u = getattr(r, "usage", None)
    usage = SimpleNamespace(
        input_tokens=int(getattr(u, "prompt_tokens", 0) or 0),
        output_tokens=int(getattr(u, "completion_tokens", 0) or 0))
    # **截断不能只信 `finish_reason`。** 实测这条路由会撒谎:
    # `max_tokens=16` 打满、正文切在半句话("……身体可近"),
    # 它照样报 `finish_reason: "stop"`。而截断识别驱动着 OUTPUT_CEILING 的自动加倍,
    # 认不出来就会把一份结尾没了的规划往下发给 45 个建页 agent。
    # 所以再加一条可算的判据:输出 token 顶到上限就是打满 —— 别信自报,量。
    fin = getattr(ch, "finish_reason", None)
    hit_cap = bool(want) and usage.output_tokens >= want
    return _Resp(out, usage, fin == "length" or hit_cap, getattr(r, "id", "") or "")


def _chat_body(body: dict) -> dict:
    """responses 请求体 → chat/completions 请求体。"""
    msgs: list[dict] = []
    if body.get("instructions"):
        msgs.append({"role": "system", "content": body["instructions"]})
    inp = body.get("input")
    if isinstance(inp, str):
        msgs.append({"role": "user", "content": inp})
    else:
        msgs += _chat_history(inp or [])
    out = {"model": body["model"], "messages": msgs,
           "max_tokens": body.get("max_output_tokens")}
    if body.get("tools"):
        # responses 的工具是平铺 {name, description, parameters};
        # chat 要包一层 {"type":"function","function":{...}}。
        out["tools"] = [{"type": "function",
                         "function": {k: v for k, v in t.items() if k != "type"}}
                        for t in body["tools"]]
    return out


def _chat_history(items: list) -> list[dict]:
    """Responses 形态的历史 → chat messages。

    builder 把历史按 Responses item 存(那样 `call_id` 能原样回传),
    所以每一次调用都要在这里翻译回去。三种 item 各有对应物:
        {"role":"user"|...}      → 原样
        function_call            → assistant + tool_calls
        function_call_output     → role="tool" + tool_call_id
    """
    msgs: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        ty = it.get("type")
        if ty == "function_call":
            msgs.append({"role": "assistant", "content": None,
                         "tool_calls": [{"id": it.get("call_id") or it.get("id") or "",
                                         "type": "function",
                                         "function": {"name": it.get("name", ""),
                                                      "arguments": it.get("arguments") or "{}"}}]})
        elif ty == "function_call_output":
            msgs.append({"role": "tool", "tool_call_id": it.get("call_id", ""),
                         "content": str(it.get("output", ""))})
        elif ty == "message" or it.get("role"):
            c = it.get("content")
            if isinstance(c, list):
                c = "".join(x.get("text", "") for x in c if isinstance(x, dict))
            msgs.append({"role": it.get("role", "assistant"), "content": c or ""})
    return msgs


# 退避梯子。这条中转链路上 429 和 503 都常见,而 planner 的每一步都是几分钟的
# 长生成 —— 失败重来的代价远高于多等一会,所以梯子拉长而不是拉密。
LADDER = (5, 15, 40, 90, 180, 300, 300, 300)

# 空响应最多重试几次(见 ask())。3 次 = 最多多等 5+15+40=60s。
EMPTY_RUNGS = 3

# 一次请求最多来得及吐多少 output token。= 最慢实测吞吐(70 tok/s) × http_timeout_sec(900s)。
# 超过这个数的请求不可能在超时前回来,所以自动升档到此为止 —— 再升只是把
# 「截断」换成「超时」,两者都是白等。
OUTPUT_CEILING = 60_000

# 超时最多重试几次。**不能和限流共用整条梯子** —— 这是量出来的:
# ape-01 那轮 PLAN.md 连续超时,走了 4 级就烧掉 1 小时 20 分钟且毫无进展,
# 按 8 级走完最坏要两个半小时才失败。原因是一次超时的代价是
# `http_timeout_sec`(900s)的死等,而限流的代价只是梯子上那点退避。
# 限流说"稍后再来",值得等;900s 超时说"这个请求完不成",重试八次是纯浪费。
# 流水线里最慢的一步实测 416s,所以 3 次尝试(≈45 分钟上限)足够区分抖动和系统性故障。
TIMEOUT_RUNGS = 2


class EmptyReply(RuntimeError):
    """回来了,但没有文本。

    这条链路特有的失败形状,而且**比抛异常更危险** —— 实测 s5-orb 的 theme.css
    那一步 `out=229 tok / 0 字符`:模型只出了 reasoning,一个字的正文都没有。
    `text_of()` 只防住了 SDK 在 text=None 上抛 TypeError,防不住"回来是空的"。
    不把它变成异常,planner 就会把空串写进 theme.css 继续往下走,
    结果是整套页面无样式而**没有任何一处报错**。宁可炸。
    """


# 网关的 fallback 失败会伪装成 400。实测原文:
#     400 The `reasoning_content` in the thinking mode must be passed back to the API.
#     Error doing the fallback: ServiceUnavailableError:
#     No available channel for model deepseek-v4-flash-turbo under group common_7
# 前半句像是我们的请求格式错了,**但那是假的** —— 同一份历史用三种回传形式
# (原样剥 status / 整个不回传 reasoning / content→reasoning_content)实测全部通过。
# 真正的原因是上游某条 fallback 通道没有可用容量,而它的抱怨被套进了 400。
# 400 默认不重试,于是一个 subagent 崩掉,ThreadPoolExecutor 把异常传出来,
# **整个 builder 停掉、剩下 38 路一起没了** —— 52 页只交付 21 页就是这么来的。
_GATEWAY_HINTS = ("no available channel", "error doing the fallback",
                  "serviceunavailable", "must be passed back to the api")


def _is_gateway_flake(e: Exception) -> str:
    """这个 400 是不是网关抖动(而不是我们的请求真有问题)。命中就返回**哪一条**命中了。

    返回命中的那条提示词,不返回 True —— 打印里只留 70 字符时,
    日志上是六行一模一样的 `invalid req…`,既看不出命中了哪条、
    也分不开「真抖动」和「我们的请求真有问题但被误判成抖动、于是白重试八次」。
    """
    m = str(e).lower()
    return next((h for h in _GATEWAY_HINTS if h in m), "")


def ask(req: Request, min_chars: int = 1) -> Reply:
    """发一次调用,拿回文本。planner 的每一步都是一次这个。

    `min_chars` —— 短于这个数视同上游抖动,走同一条退避梯子重试。
    调用方按步给:theme.css / PLAN.md 这类产物不可能只有几十个字符。
    """
    body = to_responses(req)
    last: Exception | None = None
    # 空响应只在梯子前 EMPTY_RUNGS 级上重试。限流值得等 300s,空响应不值得:
    # 它要么是一次抖动(重来一次就好),要么是确定性的(等多久都一样)。
    # 走满整条梯子会白等 15 分钟,每一步都这样就是一整轮。
    empties = timeouts = 0
    escalated = False
    t_start = time.time()
    for i, wait in enumerate((0,) + LADDER):
        if wait and last is not None:
            # `last is None` 只在「上一轮不是异常」时出现 —— 现在只有截断自动升档
            # 会走到那里,它自己已经打过一行了,不该再打一句「上游 NoneType」。
            print(f"      上游 {type(last).__name__},等 {wait}s 重试 ({i}/{len(LADDER)})"
                  f"  已累计死等 {time.time()-t_start:.0f}s", flush=True)
            time.sleep(wait)
        try:
            r = _once(body)
            if r.truncated:
                cap = int(body.get("max_output_tokens") or 0)
                # **截断自动升一档,只升一次。** 手工改常量是行不通的:
                # spec 那一步我按不同模型的观测手工改了四次(8k → 20k → 40k → 60k),
                # 每次都要杀掉重跑。上限本质上是「按一个模型的观测定的数」,
                # 换模型就不够,所以该由 harness 自己抬,而不是等人来抬。
                if cap and cap * 2 <= OUTPUT_CEILING and not body.get("_escalated"):
                    body = {**body, "max_output_tokens": cap * 2, "_escalated": True}
                    body.pop("_escalated")           # 别把自定义键发给上游
                    escalated = True
                    print(f"      产物在 {cap:,} tok 处被截断,自动升到 {cap*2:,} 重试一次",
                          flush=True)
                    continue
                raise RuntimeError(
                    f"产物被 max_output_tokens 截断(已出 {r.output_tokens} tok,"
                    f"上限 {cap:,}"
                    + (",已自动升过一档" if escalated else "")
                    + f")。再往上就超过这条链路能吐的量(约 {OUTPUT_CEILING:,},"
                    f"= 最慢实测吞吐 70 tok/s × 超时 {config()['model']['http_timeout_sec']}s)。"
                    f"这不是上限不够,是这一步在要一份写不完的东西 —— 去看它的输入。")
            if len(r.text) < min_chars:
                empties += 1
                last = EmptyReply(f"只回了 {len(r.text)} 字符(要求 ≥{min_chars}),"
                                  f"输出 {r.output_tokens} tok")
                if empties > EMPTY_RUNGS:
                    raise last
                continue
            return r
        except BadRequestError as e:
            hint = _is_gateway_flake(e)
            if not hint:
                raise
            last = e
            print(f"      400 命中网关抖动特征「{hint}」,重试。原文: "
                  f"{' '.join(str(e).split())[:300]}", flush=True)
        except (RateLimitError, InternalServerError, APIConnectionError, APITimeoutError) as e:
            last = e
            if isinstance(e, (APITimeoutError, APIConnectionError)):
                timeouts += 1
                if timeouts > TIMEOUT_RUNGS:
                    print(f"      超时 {timeouts} 次,不再重试(累计死等 "
                          f"{time.time()-t_start:.0f}s)。梯子是给限流用的,"
                          f"超时重试八次只会白烧墙钟。", flush=True)
                    raise last
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
            if wire() == "chat":
                cb = _chat_body(body)
                return _adapt_chat(
                    client().chat.completions.create(**cb), cb.get("max_tokens"))
            return client().responses.create(**body)
        except BadRequestError as e:
            hint = _is_gateway_flake(e)
            if not hint:
                raise
            last = e
            print(f"      [{tag}] 400 命中网关抖动特征「{hint}」,重试。原文: "
                  f"{' '.join(str(e).split())[:300]}", flush=True)
        except (RateLimitError, InternalServerError, APIConnectionError, APITimeoutError) as e:
            last = e
    print(f"      [{tag}] 退避耗尽: {type(last).__name__}", flush=True)
    raise last


# output item 的白名单/黑名单。**只认列出来的,其余一律吵。**
_TEXT_ITEMS = frozenset({"message", "output_text", None})
_SKIP_ITEMS = frozenset({"reasoning", "function_call", "function_call_output",
                         "web_search_call", "file_search_call", "computer_call"})


def text_of(r) -> str:
    """自己抽文本,不用 SDK 的 r.output_text。

    两件事必须自己做:

    1. **跳过 text=None 的块。** Sonnet 经这条链路回来的响应里有这种块,
       SDK 那个 property 直接 `"".join(texts)` 就抛 TypeError,把整轮 planner 打断
       —— 实测 s5-nn / s5-orb 都死在这。

    2. **只取 `type='message'` 的 item,丢掉 `type='reasoning'`。**
       这条是后来量出来的,代价很大:DeepSeek-V4-Flash 把推理放在一个独立的
       `type='reasoning'` item 里(它自己分得很清楚),而这个函数原来不按 item 类型
       过滤,于是把推理**拼在正文前面**。实测一次调用:

           item[0] type='reasoning'  «我们只需要输出markdown。要求第一行是…»
           item[1] type='message'    «# page-07 · 测试 · **120 秒** …»   ← 正文完全合格

       后果是一连串误判,而且全都指向错的方向:`lec.js` 连续六次被判成"推理稿"、
       `spec` 11 次重试、上限从 8,000 一路加到 40,000 每档打满 —— 我据此写下
       「DeepSeek 把推理稿当文件内容输出」,**那个结论是错的**。
       GPT 那边一直没事,因为它不返回带文本的 reasoning item ——
       **所以这是个只在某些模型上显形的 bug**,而不是模型的毛病。
    """
    out, unknown = [], set()
    for item in getattr(r, "output", None) or []:
        ty = getattr(item, "type", None)
        if ty in _SKIP_ITEMS:
            continue
        if ty not in _TEXT_ITEMS:
            # **没见过的 item 类型必须吵。** 这个函数出过两次同类事故,
            # 两次都是"默默收下了不该收的东西":先是 text=None 的块抛 TypeError,
            # 后是 reasoning item 被拼进正文、骗了十几轮误判。
            # 根因不是漏了某个 if,是它对任何带 .content[].text 的 item 都收,
            # 从不问「这是什么」。改成白名单之后,下一个没见过的形状会立刻显形,
            # 而不是变成一段看不见的污染。
            unknown.add(str(ty))
            continue
        for c in getattr(item, "content", None) or []:
            t = getattr(c, "text", None)
            if isinstance(t, str):
                out.append(t)
    if unknown:
        print(f"      ⚠ 响应里有没见过的 output item 类型 {sorted(unknown)} —— "
              f"已跳过。如果产物缺内容,先查这里,不要先怀疑模型。", flush=True)
    return "".join(out)


def _once(body: dict) -> Reply:
    if wire() == "chat":
        cb = _chat_body(body)
        r = _adapt_chat(client().chat.completions.create(**cb), cb.get("max_tokens"))
    else:
        r = client().responses.create(**body)
    u = getattr(r, "usage", None)
    # 撞上 max_output_tokens 的截断。Responses API 会给
    # status="incomplete" + incomplete_details.reason="max_output_tokens"。
    # **必须显式拿出来** —— 截断的产物看上去是一份正常文件,只是结尾没了,
    # 而下游(theme/contract/brief)会照着这份残缺的规划一路建二十多页。
    det = getattr(r, "incomplete_details", None)
    return Reply(
        text=text_of(r).strip(),
        input_tokens=int(getattr(u, "input_tokens", 0) or 0),
        output_tokens=int(getattr(u, "output_tokens", 0) or 0),
        raw=r,
        truncated=(getattr(r, "status", None) == "incomplete"
                   or getattr(det, "reason", None) == "max_output_tokens"),
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
