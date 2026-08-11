from types import SimpleNamespace

import pytest

from notale.agents.loop import (
    ConversationMessage,
    MessageComplete,
    ModelRequest,
    OpenAICompatibleClient,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
)


def test_openai_request_body_matches_openharness_v019_golden():
    tools = [{
        "name": "edit_page",
        "description": "edit",
        "input_schema": {
            "type": "object",
            "properties": {"html": {"type": "string"}},
            "required": ["html"],
        },
    }]
    messages = [
        ConversationMessage.from_user_text("build page"),
        ConversationMessage(
            role="assistant",
            content=[
                TextBlock(text="working"),
                ToolUseBlock(
                    id="call-1",
                    name="edit_page",
                    input={"html": "<section>页</section>"},
                ),
            ],
        ),
        ConversationMessage(
            role="user",
            content=[
                ToolResultBlock(
                    tool_use_id="call-1",
                    content='{"revision":1}',
                )
            ],
        ),
    ]

    body = ModelRequest(
        model="anthropic/claude-sonnet-5",
        messages=messages,
        system_prompt="system\n# skill",
        max_tokens=128_000,
        reasoning_effort="low",
        tools=tools,
    ).to_openai_body()

    assert body == {
        "model": "anthropic/claude-sonnet-5",
        "messages": [
            {"role": "system", "content": "system\n# skill"},
            {"role": "user", "content": "build page"},
            {
                "role": "assistant",
                "content": "working",
                "reasoning_content": "",
                "tool_calls": [{
                    "id": "call-1",
                    "type": "function",
                    "function": {
                        "name": "edit_page",
                        "arguments": '{"html": "<section>\\u9875</section>"}',
                    },
                }],
            },
            {"role": "tool", "tool_call_id": "call-1", "content": '{"revision":1}'},
        ],
        "stream": True,
        "max_tokens": 128_000,
        "extra_body": {"reasoning": {"effort": "low"}},
        "tools": [{
            "type": "function",
            "function": {
                "name": "edit_page",
                "description": "edit",
                "parameters": tools[0]["input_schema"],
            },
        }],
    }


class _Chunks:
    def __init__(self, chunks):
        self.chunks = chunks

    def __aiter__(self):
        self._items = iter(self.chunks)
        return self

    async def __anext__(self):
        try:
            return next(self._items)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


class _Completions:
    def __init__(self, chunks):
        self.chunks = chunks
        self.body = None

    async def create(self, **body):
        self.body = body
        return _Chunks(self.chunks)


@pytest.mark.asyncio
async def test_streaming_client_assembles_split_tool_arguments_and_usage():
    def empty_delta(**values):
        fields = {"content": None, "reasoning_content": None, "tool_calls": None}
        fields.update(values)
        return SimpleNamespace(**fields)
    chunks = [
        SimpleNamespace(
            usage=None,
            choices=[SimpleNamespace(
                finish_reason=None,
                delta=empty_delta(content="<think>hidden</think>working"),
            )],
        ),
        SimpleNamespace(
            usage=None,
            choices=[SimpleNamespace(
                finish_reason=None,
                delta=empty_delta(
                    reasoning_content="reason ",
                    tool_calls=[SimpleNamespace(
                        index=0,
                        id="call-1",
                        function=SimpleNamespace(name="edit_page", arguments='{"revision":'),
                    )],
                ),
            )],
        ),
        SimpleNamespace(
            usage=None,
            choices=[SimpleNamespace(
                finish_reason="tool_calls",
                delta=empty_delta(
                    reasoning_content="continued",
                    tool_calls=[SimpleNamespace(
                        index=0,
                        id=None,
                        function=SimpleNamespace(name=None, arguments="0}"),
                    )],
                ),
            )],
        ),
        SimpleNamespace(
            usage=SimpleNamespace(prompt_tokens=12, completion_tokens=7),
            choices=[],
        ),
    ]
    completions = _Completions(chunks)
    transport = object.__new__(OpenAICompatibleClient)
    transport.model = "anthropic/claude-sonnet-5"
    transport._client = SimpleNamespace(
        chat=SimpleNamespace(completions=completions)
    )
    request = ModelRequest(
        model=transport.model,
        messages=[ConversationMessage.from_user_text("build")],
        system_prompt="system",
        max_tokens=100,
        reasoning_effort="low",
        tools=[],
    )

    events = [event async for event in transport.stream_message(request)]

    complete = next(event for event in events if isinstance(event, MessageComplete))
    assert complete.message.text == "working"
    assert complete.message.tool_uses[0].id == "call-1"
    assert complete.message.tool_uses[0].input == {"revision": 0}
    assert complete.message._reasoning == "reason continued"
    assert complete.usage.input_tokens == 12
    assert complete.usage.output_tokens == 7
    assert completions.body == request.to_openai_body()
