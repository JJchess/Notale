from __future__ import annotations
from pathlib import Path
import json


def _write_spec(path):
    return [{'type': 'function', 'name': 'Write', 'description': '提交完整文件，不是补丁',
             'parameters': {'type': 'object', 'properties': {
                 'file_path': {'type': 'string', 'description': f'只能是 {path}'},
                 'content': {'type': 'string'}}, 'required': ['file_path', 'content'], 'additionalProperties': False}}]


def _one_write(r, target):
    calls = [o for o in r.output if getattr(o, 'type', '') == 'function_call' and o.name == 'Write']
    if len(calls) != 1:
        return None, [f'每次提交恰好一个 Write；实际 {len(calls)} 个']
    try:
        args = json.loads(calls[0].arguments)
        if not isinstance(args, dict) or set(args) != {'file_path', 'content'}:
            raise ValueError('Write 参数必须是含 file_path/content 的 JSON 对象')
        if not isinstance(args['file_path'], str) or not isinstance(args['content'], str):
            raise ValueError('Write 路径和内容必须是字符串')
        if Path(args['file_path']).resolve() != target.resolve():
            raise ValueError(f'只能写 {target}')
        if not args['content'].strip():
            raise ValueError('Write 内容不能为空')
        return args['content'], []
    except (ValueError, TypeError, OSError) as exc:
        return None, [str(exc)]
