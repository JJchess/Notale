"""Three direct tools. No JS cells, image model, provider lookup or plugin layer."""
import asyncio
import base64
from contextlib import suppress
import mimetypes
import os
from pathlib import Path
import signal
import uuid


def function(name, description, properties, required):
    return {'type': 'function', 'function': {'name': name, 'description': description,
            'parameters': {'type': 'object', 'properties': properties, 'required': required,
                           'additionalProperties': False}}}


TOOLS = [
    function('exec_command', 'Execute bash in the workspace. Use commands to read/write/edit files, '
             'inspect PPTX and run browser scripts. Long commands return session_id; use write_stdin to continue.',
             {'cmd': {'type': 'string'}, 'workdir': {'type': 'string'},
              'yield_time_ms': {'type': 'integer'}, 'max_output_tokens': {'type': 'integer'}}, ['cmd']),
    function('write_stdin', 'Read new output or write input to a running shell session.',
             {'session_id': {'type': 'string'}, 'chars': {'type': 'string'},
              'yield_time_ms': {'type': 'integer'}, 'max_output_tokens': {'type': 'integer'}}, ['session_id']),
    function('view_image', 'View PNG/JPEG/WebP/GIF inside the workspace. Actual pixels return to this model. '
             'Rasterize SVG/PDF first.', {'path': {'type': 'string'}}, ['path']),
]


class Tools:
    def __init__(self, workspace, sandbox, log):
        self.work, self.sandbox, self.log = Path(workspace).resolve(), sandbox, log
        self.sessions = {}

    async def call(self, name, args, call_id):
        self.log('tool.started', {'call_id': call_id, 'name': name, 'arguments': args})
        try:
            if name not in {t['function']['name'] for t in TOOLS}:
                raise ValueError(f'Tool unavailable: {name}')
            result = await getattr(self, name)(**args)
            self.log('tool.completed', {'call_id': call_id, 'result': result})
            return result
        except Exception as e:
            self.log('tool.failed', {'call_id': call_id, 'error': str(e)})
            raise

    def path(self, name):
        path = Path(name)
        path = (self.work/path).resolve() if not path.is_absolute() else path.resolve()
        if not path.is_relative_to(self.work):
            raise ValueError('Path must be inside the run workspace')
        return path

    async def _read(self, process, buffer):
        while data := await process.stdout.read(65536):
            buffer.extend(data)

    async def _poll(self, sid, milliseconds, max_output_tokens):
        session = self.sessions[sid]
        process = session['process']
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(asyncio.shield(session['wait']), max(0.001, milliseconds/1000))
        if process.returncode is not None:
            await session['reader']
        output = bytes(session['buffer'][session['cursor']:]).decode(errors='replace')
        session['cursor'] = len(session['buffer'])
        self.log('process.output', {'session_id': sid, 'output': output, 'exit_code': process.returncode})
        limit = max(0, int(max_output_tokens))*4
        visible = output[:limit]+('\n[truncated; full output saved in host events]' if len(output)>limit else '')
        result = {'output': visible, 'exit_code': process.returncode}
        if process.returncode is None:
            result['session_id'] = sid
        return result

    async def exec_command(self, cmd, workdir=None, yield_time_ms=10000, max_output_tokens=10000):
        cwd = self.path(workdir or '.')
        process = await asyncio.create_subprocess_exec(
            *self.sandbox.command(['/bin/bash', '-c', cmd], cwd=cwd), cwd=cwd, env=self.sandbox.env,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            start_new_session=True)
        sid, buffer = uuid.uuid4().hex[:12], bytearray()
        self.sessions[sid] = {'process': process, 'buffer': buffer, 'cursor': 0,
            'reader': asyncio.create_task(self._read(process, buffer)), 'wait': asyncio.create_task(process.wait())}
        self.log('process.started', {'session_id': sid, 'pid': process.pid, 'cmd': cmd, 'cwd': str(cwd)})
        return await self._poll(sid, min(max(1, yield_time_ms), 30000), max_output_tokens)

    async def write_stdin(self, session_id, chars='', yield_time_ms=1000, max_output_tokens=10000):
        if session_id not in self.sessions:
            raise ValueError('Unknown process session')
        process = self.sessions[session_id]['process']
        if chars:
            if process.returncode is not None:
                raise ValueError('Process already exited')
            process.stdin.write(chars.encode())
            await process.stdin.drain()
        return await self._poll(session_id, min(max(1, yield_time_ms), 60000), max_output_tokens)

    async def view_image(self, path):
        file = self.path(path)
        mime = mimetypes.guess_type(file.name)[0]
        if mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'):
            raise ValueError('Render this file as PNG before viewing')
        return {'image_url': f'data:{mime};base64,'+base64.b64encode(file.read_bytes()).decode()}

    async def close(self):
        for session in self.sessions.values():
            process = session['process']
            if process.returncode is None:
                with suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
            await session['wait']
            await session['reader']
