"""llm.py 离线 smoke：零网络，验证移植后行为不变。"""

import pytest

from notale.utils import llm


def test_signature_format():
    assert llm.HttpxClient().signature == "deepseek-ai/DeepSeek-V4-Flash@t0.0@s0"
    assert llm.HttpxClient(model="m", temperature=0.7, seed=None).signature == "m@t0.7@sNone"


async def test_fake_client_queue_and_purpose():
    fake = llm.FakeClient(queue=["q1"], by_purpose={"plan:skeleton": "p1"}, default="d")
    assert await fake.complete([{"role": "user", "content": "x"}], purpose="plan:skeleton") == "p1"
    assert await fake.complete([{"role": "user", "content": "x"}]) == "q1"
    assert await fake.complete([{"role": "user", "content": "x"}]) == "d"
    assert len(fake.calls) == 3


async def test_missing_api_key_raises_before_any_network(monkeypatch):
    monkeypatch.delenv("SILICONFLOW_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client = llm.HttpxClient()
    with pytest.raises(RuntimeError, match="缺 API key"):
        await client.complete([{"role": "user", "content": "hi"}])
    assert client.usage["calls"] == 0  # 未发出任何请求


def test_usage_recording():
    client = llm.HttpxClient()
    client._record_usage(
        {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
            "completion_tokens_details": {"reasoning_tokens": 2},
        }
    )
    assert client.usage == {
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "reasoning_tokens": 2,
        "total_tokens": 15,
        "calls": 1,
    }
    client._record_usage(None)  # 缺 usage 字段兜 0，不炸
    assert client.usage["calls"] == 1
