"""记录层:从 Claude Code 的 transcript 行删减得到。

实测 nn-03 的 346 行里出现过 35 个字段,这里留 9 个。字段名逐字照抄(camelCase),
这样 experiments/lab/timing.py 和 experiments/lab/audit.py 能审计我们自己的 harness,
也能把 harness 的运行和 Claude Code 实验轮直接摆在一起对比。

留:
    uuid parentUuid sessionId isSidechain timestamp requestId type message toolUseResult
✂ CLI 自省      cwd version gitBranch permissionMode entrypoint userType effort promptId
✂ 界面用        aiTitle lastPrompt promptSource origin subtype durationMs messageCount isMeta
✂ 文件回滚      snapshot backup trackingPath snapshotMessageId isSnapshotUpdate messageId
✂ 其它          attachment operation mode leafUuid content session_id pendingBackgroundAgentCount

模型请求体和带时间戳的 transcript 是两份记录，不合并成一个扁平 Call。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .redact import redact


class TraceRow(BaseModel):
    """一行 transcript。落盘就是 jsonl,一行一个 TraceRow。"""

    uuid: str
    parentUuid: str | None = None  # 父子链,不用靠时间顺序猜
    sessionId: str
    isSidechain: bool = False  # True = 子 agent 自己的行
    timestamp: str  # ISO8601,带 Z
    type: Literal["user", "assistant", "system"]
    requestId: str | None = None  # 同一次 API 响应的多行共用它
    message: dict = Field(default_factory=dict)  # {role, content:[Block], usage?}
    toolUseResult: dict | str | None = None


# ------------------------------------------------------------------ 合并规则
# 下面三条都是踩出来的,写成代码是为了不再踩第二次。


class Writer:
    """把调用写成 jsonl。父子链的游标由它自己拿着 —— 之前挂在 Run 的私有字段上
    让外部函数去改,是把状态藏错了地方。"""

    def __init__(self, path, session: str):
        self.path, self.session, self.prev = path, session, None
        # planner 和 style director 并行时两条线共用一个 Writer。没有锁的话
        # self.prev 会被互相覆盖,父子链错乱,两条线的行也可能交错写进同一行。
        import threading
        self._lock = threading.Lock()

    def add(self, req_blocks: list[dict], text: str, usage: dict,
            rid: str, started: str, finished: str, tag: dict | None = None) -> None:
        """写一次调用。

        **写入前一律脱敏。** trace 逐字记录提示词和模型回复,而 builder 跑的
        Bash 打印什么就可能被模型复述什么 —— 实测 orbit-01 的 trace 里就这样
        混进了一个真实 API key,推 GitHub 之前才被拦下。proxy.py 当初对请求头
        做了 REDACT,这一层当初漏了。
        """
        import json as _j
        import uuid as _u

        req_blocks = _j.loads(redact(_j.dumps(req_blocks, ensure_ascii=False)))
        text = redact(text)
        if tag:
            tag = _j.loads(redact(_j.dumps(tag, ensure_ascii=False)))

        a = TraceRow(uuid=str(_u.uuid4()), parentUuid=self.prev, sessionId=self.session,
                     timestamp=started, type="user", requestId=rid,
                     message={"role": "user", "content": req_blocks})
        b = TraceRow(uuid=str(_u.uuid4()), parentUuid=a.uuid, sessionId=self.session,
                     timestamp=finished, type="assistant", requestId=rid,
                     message={"role": "assistant",
                              "content": [{"type": "text", "text": text}], "usage": usage},
                     toolUseResult=tag)
        with self._lock, self.path.open("a", encoding="utf-8") as f:
            self.prev = b.uuid
            for row in (a, b):
                f.write(row.model_dump_json(exclude_none=True) + "\n")

    def tool(self, *, rid: str, call_id: str, page: str, name: str,
             arguments: str, output: str, started: str, finished: str,
             seconds: float, images=()) -> None:
        """Record actual tool evidence without injecting it into model history.

        Images are content-addressed because .shots is overwritten by later checks.
        Request/response rows and their timing parent links remain unchanged.
        """
        import base64
        import hashlib
        import json
        import uuid

        pictures = []
        for media_type, encoded in images:
            data = base64.b64decode(encoded, validate=True)
            digest = hashlib.sha256(data).hexdigest()
            path = self.path.parent / '.trace-images' / digest
            path.parent.mkdir(exist_ok=True)
            # Identical concurrent writes have identical content; no mutable screenshot names.
            with self._lock:
                if not path.exists():
                    path.write_bytes(data)
            pictures.append({'path': str(path.relative_to(self.path.parent)),
                             'mimeType': media_type, 'sha256': digest, 'bytes': len(data)})
        payload = json.loads(redact(json.dumps(dict(
            page=page, call_id=call_id, name=name, arguments=arguments, output=output,
            started=started, seconds=seconds, images=pictures), ensure_ascii=False)))
        with self._lock, self.path.open('a', encoding='utf-8') as stream:
            row = TraceRow(uuid=str(uuid.uuid4()), parentUuid=self.prev, sessionId=self.session,
                           timestamp=finished, type='system', requestId=rid,
                           message={'role': 'system', 'content': []},
                           toolUseResult=payload)
            stream.write(row.model_dump_json(exclude_none=True) + '\n')
