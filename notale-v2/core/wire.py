"""传输层:从 Claude Code 的 wire request 删减得到。

抓包里 Claude Code 的请求体顶层有 10 个字段,这里留 7 个:

    model / system / messages / tools / max_tokens / thinking / output_config / stream
    ✂ metadata            device_id + account_uuid,CLI 的计费归属,我们不需要
    ✂ context_management  {clear_thinking} 是给长对话省 token 的;我们的构建调用
                          一次性,thinking 不跨轮,留着只会掩盖真实 token 曲线
    ✂ system[0]           'x-anthropic-billing-header: cc_version=...' 那一条

四种 content block 一个不删 —— 那是 API 面,不是 Claude Code 的选择。

**字段名一律照抄,包括 snake_case / camelCase 的不一致**(`input_schema` 但
`cache_control`,`tool_use_id` 但 toolUseResult 在 trace 里是 camel)。改名会让
lab/ 下已有的解析工具全部失效,而那正是照抄的理由。
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

# ------------------------------------------------------------------ blocks


class CacheControl(BaseModel):
    type: Literal["ephemeral"] = "ephemeral"


class TextBlock(BaseModel):
    type: Literal["text"] = "text"
    text: str
    cache_control: CacheControl | None = None


class ImageBlock(BaseModel):
    """一张图。**端点两种线格式都验过支持**:探针图里写的 748291 被读对了、
    两半颜色也说对了(rgb(196,78,42) 说橙红、rgb(12,74,88) 说深青)。

    加它的理由很窄:同类任务里协调者在写 deck.css 之前,把要当整页底图用的
    三张生成插画用 PIL 拼成一张 960×180 的联系表,然后**看了那张图**(它的第 22 次调用),
    才定下暖近黑的底色。它没有看那 14 张照片 —— 照片它只读描述性标题。
    所以这一条只服务一件事:让写 CSS 的那一步看见底图长什么样。
    """
    type: Literal["image"] = "image"
    data: str                                  # base64,不带 data: 前缀
    media_type: str = "image/jpeg"


class ThinkingBlock(BaseModel):
    type: Literal["thinking"] = "thinking"
    thinking: str
    signature: str


class ToolUseBlock(BaseModel):
    """模型交结构化数据的唯一通道。

    领域层(schema.py)不是从 Claude Code 删减来的,但它挂在这个槽位上:
    `Segment.model_json_schema()` 就是 ToolDef.input_schema,
    模型填的 `input` 就是 `Segment` 的实例,验证不过就重来。
    """

    type: Literal["tool_use"] = "tool_use"
    id: str
    name: str
    input: dict


class ToolResultBlock(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    tool_use_id: str
    content: str | list[dict]
    is_error: bool = False


Block = Annotated[
    Union[TextBlock, ImageBlock, ThinkingBlock, ToolUseBlock, ToolResultBlock],
    Field(discriminator="type"),
]


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: list[Block]


# ------------------------------------------------------------------ request


class ToolDef(BaseModel):
    name: str
    description: str
    input_schema: dict


class Request(BaseModel):
    """删减后的请求体。

    `system` 保留成 list 而不是压成一个字符串,唯一目的是保住 **cache_control
    断点的位置**:Claude Code 把断点打在稳定前缀之后,可变部分留在断点之后。
    这就是 views.View 的 prefix / body 划分,边界不用我们自己试。
    """

    model: str
    system: list[TextBlock]
    messages: list[Message]
    tools: list[ToolDef] = Field(default_factory=list)
    max_tokens: int = 64000
    thinking: dict = Field(default_factory=lambda: {"type": "adaptive"})
    output_config: dict = Field(default_factory=lambda: {"effort": "medium"})
    stream: bool = True


class Usage(BaseModel):
    """照抄。

    实测的坑:一次响应会落成多行(thinking / text / tool_use 各一行),
    **只有同 requestId 的最后一行 usage 是完整的**,前面几行带占位值
    (output_tokens: 2)。按第一行读会把 52k token 的生成读成 2 token,
    进而误判成「这个 subagent 卡住了」。合并规则在 trace.py 里。
    """

    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0
