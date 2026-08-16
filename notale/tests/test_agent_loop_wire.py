from types import SimpleNamespace

import pytest

from notale.agents.loop import (
    ConversationMessage,
    ImageBlock,
    MessageComplete,
    ModelRequest,
    OpenAICompatibleClient,
    ReasoningBlock,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    Usage,
    complete_model_request,
)
from notale.utils.retry import RetryPolicy


def test_responses_request_body_replays_reasoning_tools_and_images():
    schema = {
        "type": "object",
        "properties": {"ok": {"type": "boolean"}},
        "required": ["ok"],
        "additionalProperties": False,
    }
    tools = [{
        "name": "inspect_page",
        "description": "inspect",
        "input_schema": {
            "type": "object",
            "properties": {"revision": {"type": "integer"}},
            "required": ["revision"],
            "additionalProperties": False,
        },
    }]
    messages = [
        ConversationMessage.from_user_text("build page"),
        ConversationMessage(
            role="assistant",
            content=[
                ReasoningBlock(id="rs-1", encrypted_content="encrypted", summary=[]),
                ToolUseBlock(id="call-1", name="inspect_page", input={"revision": 1}),
            ],
        ),
        ConversationMessage(
            role="user",
            content=[
                ToolResultBlock(
                    tool_use_id="call-1",
                    content='{"status":"success"}',
                    images=[ImageBlock(image_url="data:image/png;base64,AAAA")],
                )
            ],
        ),
    ]

    body = ModelRequest(
        model="gpt-5.6-terra",
        messages=messages,
        system_prompt="system",
        max_tokens=128_000,
        reasoning_effort="xhigh",
        tools=tools,
        response_schema=schema,
        response_schema_name="notale_probe",
    ).to_responses_body()

    assert body["model"] == "gpt-5.6-terra"
    assert body["instructions"] == "system"
    assert body["store"] is False
    assert body["reasoning"] == {"effort": "xhigh"}
    assert body["include"] == ["reasoning.encrypted_content"]
    assert body["text"]["format"] == {
        "type": "json_schema",
        "name": "notale_probe",
        "strict": True,
        "schema": schema,
    }
    assert body["tools"] == [{
        "type": "function",
        "name": "inspect_page",
        "description": "inspect",
        "parameters": tools[0]["input_schema"],
        "strict": False,
    }]
    assert body["input"] == [
        {"role": "user", "content": "build page"},
        {"type": "reasoning", "id": "rs-1", "summary": [], "encrypted_content": "encrypted"},
        {
            "type": "function_call",
            "call_id": "call-1",
            "name": "inspect_page",
            "arguments": '{"revision": 1}',
        },
        {
            "type": "function_call_output",
            "call_id": "call-1",
            "output": '{"status":"success"}',
        },
        {
            "role": "user",
            "content": [{
                "type": "input_image",
                "image_url": "data:image/png;base64,AAAA",
                "detail": "high",
            }],
        },
    ]


def test_responses_strict_output_schema_requires_every_declared_property():
    source = {
        "type": "object",
        "properties": {
            "primary": {"type": "string"},
            "secondary": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        },
        "required": ["primary"],
    }
    request = ModelRequest(
        model="gpt-5.6-terra",
        messages=[ConversationMessage.from_user_text("style")],
        system_prompt="system",
        max_tokens=100,
        reasoning_effort="xhigh",
        tools=[],
        response_schema=source,
    )

    output = request.to_responses_body()["text"]["format"]["schema"]

    assert output["required"] == ["primary", "secondary"]
    assert output["additionalProperties"] is False
    assert source["required"] == ["primary"]


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


def test_multimodal_user_message_uses_openai_image_url_blocks():
    message = ConversationMessage.from_user_text_and_image(
        "inspect this page", "data:image/png;base64,AAAA", detail="high"
    )
    body = ModelRequest(
        model="anthropic/claude-sonnet-5",
        messages=[message],
        system_prompt="layout inspector",
        max_tokens=100,
        reasoning_effort="low",
        tools=[],
    ).to_openai_body()

    assert body["messages"] == [
        {"role": "system", "content": "layout inspector"},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "inspect this page"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64,AAAA",
                        "detail": "high",
                    },
                },
            ],
        },
    ]


def test_tool_result_image_is_replayed_after_the_tool_message():
    message = ConversationMessage(
        role="user",
        content=[
            ToolResultBlock(
                tool_use_id="inspect-1",
                content='{"html":"<section data-notale-page>完整页面</section>"}',
                images=[
                    ImageBlock(
                        image_url="data:image/png;base64,AAAA",
                        detail="high",
                    )
                ],
            )
        ],
    )

    body = ModelRequest(
        model="anthropic/claude-sonnet-5",
        messages=[message],
        system_prompt="builder style guide",
        max_tokens=100,
        reasoning_effort="low",
        tools=[],
    ).to_openai_body()

    assert body["messages"] == [
        {"role": "system", "content": "builder style guide"},
        {
            "role": "tool",
            "tool_call_id": "inspect-1",
            "content": '{"html":"<section data-notale-page>完整页面</section>"}',
        },
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "data:image/png;base64,AAAA",
                        "detail": "high",
                    },
                }
            ],
        },
    ]


@pytest.mark.asyncio
async def test_complete_model_request_retries_the_whole_stream():
    class FlakyClient:
        calls = 0

        async def stream_message(self, request):
            del request
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("Concurrency limit exceeded for account")
            yield MessageComplete(
                ConversationMessage(role="assistant", content=[TextBlock(text="done")]),
                Usage(input_tokens=3, output_tokens=1),
                "stop",
            )

    request = ModelRequest(
        model="fake",
        messages=[ConversationMessage.from_user_text("hello")],
        system_prompt="system",
        max_tokens=10,
        reasoning_effort="low",
        tools=[],
    )
    retries = []
    client = FlakyClient()
    complete, _, meta = await complete_model_request(
        client,
        request,
        policy=RetryPolicy(
            timeout_sec=1,
            rate_limit_base_sec=0,
            rate_limit_cap_sec=0,
            jitter=0,
        ),
        on_retry=lambda *values: retries.append(values),
    )
    assert complete.message.text == "done"
    assert client.calls == 2
    assert meta["attempts"] == 2
    assert retries == [(1, "rate_limit", 0.0)]


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


class _Responses:
    def __init__(self, events):
        self.events = events
        self.body = None

    async def create(self, **body):
        self.body = body
        return _Chunks(self.events)


class _ResponseItem(SimpleNamespace):
    def model_dump(self, *, exclude_none=False):
        values = dict(vars(self))
        if exclude_none:
            values = {key: value for key, value in values.items() if value is not None}
        return values


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


@pytest.mark.asyncio
async def test_responses_stream_preserves_encrypted_reasoning_and_tool_call():
    reasoning = _ResponseItem(
        type="reasoning",
        id="rs-1",
        summary=[],
        content=[],
        encrypted_content="encrypted",
        status=None,
    )
    function_call = _ResponseItem(
        type="function_call",
        call_id="call-1",
        name="edit_page",
        arguments='{"revision":0}',
    )
    final = SimpleNamespace(
        status="completed",
        error=None,
        output=[reasoning, function_call],
        usage=SimpleNamespace(input_tokens=21, output_tokens=8),
    )
    responses = _Responses([
        SimpleNamespace(type="response.output_item.done", item=reasoning),
        SimpleNamespace(type="response.output_item.done", item=function_call),
        SimpleNamespace(type="response.completed", response=final),
    ])
    transport = object.__new__(OpenAICompatibleClient)
    transport.model = "gpt-5.6-terra"
    transport.wire_api = "responses"
    transport._client = SimpleNamespace(responses=responses)
    request = ModelRequest(
        model=transport.model,
        messages=[ConversationMessage.from_user_text("build")],
        system_prompt="system",
        max_tokens=100,
        reasoning_effort="xhigh",
        tools=[],
    )

    events = [event async for event in transport.stream_message(request)]

    complete = next(event for event in events if isinstance(event, MessageComplete))
    assert complete.message.tool_uses[0].id == "call-1"
    assert complete.message.tool_uses[0].input == {"revision": 0}
    replay = complete.message.content[0]
    assert isinstance(replay, ReasoningBlock)
    assert replay.encrypted_content == "encrypted"
    assert complete.usage.input_tokens == 21
    assert complete.usage.output_tokens == 8
    assert responses.body == request.to_responses_body()
