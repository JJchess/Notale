"""运行记录使用的 token 用量结构；旧请求模型位于 Notale/legacy/notale-v2/harness/wire.py。"""

from pydantic import BaseModel


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
