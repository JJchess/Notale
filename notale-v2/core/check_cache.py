#!/usr/bin/env python3
"""缓存闸:当前路由到底给不给前缀缓存,给多少。

    python3 -m core.check_cache                     # 查 config.yaml 里配的模型
    python3 -m core.check_cache --model AWS-GPT-5.6-Terra
    python3 -m core.check_cache --anthropic AWS-Claude-Sonnet-5   # 另一条 wire
    python3 -m core.check_cache --json

## 为什么需要这条

2026-08-26 之前,`cached_tokens` **全仓一个都没记过** —— `_adapt_chat` 构造 usage 时
只留 input/output,responses 那条拿得到但没人读。于是「缓存到底生效没有」这件事
在这个仓库里不可观测,只能靠一次性探针。而实测出来的落差很大:

    AWS-GPT-5.6-Sol / Terra   同前缀第二次调用命中 2478/2481 —— 99.9%
    AWS-Claude-Sonnet-5       连打三次同一个 7,632 token 前缀,三次全 0

差别不是路由问题,是**模型族**问题:OpenAI 系做自动前缀缓存(≥1024 token 门槛),
Anthropic 系不做,要显式 `cache_control` 断点。而 `to_responses()` 把断点丢了
(它在这一侧没有对应物)。所以同一条 paratera 路由上,换个模型缓存就没了,
**而且不会有任何报错或警告**。这正是要装一条闸的形状。

## 判据

- OpenAI 系:第二次调用 `cached_tokens > 0`,否则 ✗。
- Anthropic 系:走裸 `/v1/messages`,带 `cache_control` 的第二次
  `cache_read_input_tokens > 0`,且不带断点时为 0 —— 两边都要成立才算通过。

只报不改,不写任何文件。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))

from core import llm  # noqa: E402

# 要越过自动缓存的最小前缀长度(OpenAI 侧是 1024 token),给两倍余量。
_FILLER = "这是一句用于填充上下文的中文句子，内容本身没有意义，只为凑够 token 数量。\n"
PREFIX = "你是一个用于测试前缀缓存的助手。\n" + _FILLER * 120


def probe_openai(model: str) -> dict:
    """同前缀连打两次。第一次写入缓存,第二次应当命中。"""
    llm.override(name=model)
    rows = []
    for i in (1, 2):
        r = llm.respond(PREFIX, [{"role": "user", "content": "只回一个字：好"}],
                        tools=[], effort="low", tag=f"cache{i}")
        tin, _, cached = llm.usage_of(r)
        rows.append({"input_tokens": tin, "cached": cached})
        if i == 1:
            time.sleep(1)
    second = rows[1]
    return {"model": model, "wire": llm.wire(), "calls": rows,
            # cached is None 表示这条路由压根不报 —— 跟「报了但是 0」不是一回事
            "reported": second["cached"] is not None,
            "ok": bool(second["cached"]),
            "hit_rate": (second["cached"] or 0) / max(second["input_tokens"], 1)}


def probe_anthropic(model: str) -> dict:
    """Anthropic 系走裸 /v1/messages,因为 to_responses() 会把断点丢掉。

    带断点和不带断点各打一次,两边都要对上才算通过 —— 只看「带断点命中」
    分不清是断点起作用还是路由本来就在缓存。
    """
    cfg = llm.config()["model"]
    base = str(cfg["base_url"]).rstrip("/")
    key = os.environ[cfg["api_key_env"]]

    def call(with_cc: bool) -> dict:
        block = {"type": "text", "text": PREFIX}
        if with_cc:
            block["cache_control"] = {"type": "ephemeral"}
        body = {"model": model, "max_tokens": 16, "system": [block],
                "messages": [{"role": "user", "content": "只回一个字：好"}]}
        req = urllib.request.Request(
            base + "/messages", method="POST", data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "x-api-key": key,
                     "anthropic-version": "2023-06-01",
                     "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read()).get("usage", {})

    warm = call(True)
    time.sleep(1)
    hit = call(True)
    time.sleep(1)
    bare = call(False)
    return {"model": model, "wire": "messages",
            "with_cache_control": {"write": warm.get("cache_creation_input_tokens", 0),
                                   "read": hit.get("cache_read_input_tokens", 0)},
            "without": {"read": bare.get("cache_read_input_tokens", 0),
                        "input_tokens": bare.get("input_tokens", 0)},
            "ok": bool(hit.get("cache_read_input_tokens"))
                  and not bare.get("cache_read_input_tokens")}


def main() -> None:
    a = argparse.ArgumentParser()
    a.add_argument("--model", help="OpenAI 系模型;不给就用 config.yaml 里的")
    a.add_argument("--anthropic", help="改走裸 /v1/messages 探这个模型")
    a.add_argument("--json", action="store_true")
    n = a.parse_args()

    if n.anthropic:
        res = probe_anthropic(n.anthropic)
    else:
        res = probe_openai(n.model or llm.config()["model"]["name"])

    if n.json:
        print(json.dumps(res, ensure_ascii=False, indent=1))
    elif n.anthropic:
        w = res["with_cache_control"]
        print(f"\n▸ 缓存闸 · {res['model']} (wire=messages)")
        print(f"  带 cache_control   写入 {w['write']:,}  读取 {w['read']:,}")
        print(f"  不带               读取 {res['without']['read']:,}  "
              f"input {res['without']['input_tokens']:,}")
        print("  ✓ 断点生效" if res["ok"] else "  ✗ 断点没生效 —— 这个模型现在是全额计费")
    else:
        c = res["calls"]
        print(f"\n▸ 缓存闸 · {res['model']} (wire={res['wire']})")
        for i, row in enumerate(c, 1):
            print(f"  第{i}次  input {row['input_tokens']:,}  "
                  f"cached {'(未报)' if row['cached'] is None else format(row['cached'], ',')}")
        if not res["reported"]:
            print("  ✗ 这条路由不报 cached_tokens —— 命中率无法观测,别拿它做成本判断")
        elif res["ok"]:
            print(f"  ✓ 命中 {res['hit_rate']*100:.1f}%")
        else:
            print("  ✗ 第二次仍未命中 —— 前缀缓存没生效")
    sys.exit(0 if res["ok"] else 1)


if __name__ == "__main__":
    main()
