"""Local tool host. Shell sessions and JS cells have distinct lifetimes/IDs."""
import asyncio
import base64
from contextlib import suppress
import json
import mimetypes
import os
from pathlib import Path
import signal
import time
import uuid


def text(value):
    return {'type': 'input_text', 'text': value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)}


class Host:
    def __init__(self, workspace, log, image_provider=None, cell_timeout=600, sandbox=None):
        self.workspace = Path(workspace).resolve()
        self.log = log
        self.image_provider = image_provider
        self.cell_timeout = cell_timeout
        self.sandbox = sandbox
        self.sessions, self.cells, self.memory, self.seen_images = {}, {}, {}, []
        self.image_paths = {}
        self.names = ['exec_command', 'write_stdin', 'view_image']
        if image_provider:
            self.names.append('image_gen__imagegen')
        self.env = {k: v for k, v in os.environ.items() if not any(
            x in k.lower() for x in ('token', 'secret', 'password', 'api_key', 'credential'))}
        self.env['TMPDIR'] = str(self.workspace/'.tmp')
        (self.workspace/'.tmp').mkdir(exist_ok=True)
        if sandbox:
            self.env = sandbox.env

    def command(self, args, cwd=None):
        return self.sandbox.command(args, cwd=cwd) if self.sandbox else args

    async def call(self, name, args, parent_call_id):
        ident = 'nested_'+uuid.uuid4().hex
        self.log('tool.started', {'id': ident, 'parent_call_id': parent_call_id, 'name': name, 'arguments': args})
        try:
            if name not in self.names:
                raise ValueError(f'Tool unavailable: {name}')
            value = await getattr(self, name)(**args)
            self.log('tool.completed', {'id': ident, 'result': value})
            return value
        except Exception as e:
            self.log('tool.failed', {'id': ident, 'error': str(e)})
            raise

    async def _read(self, process, target):
        while True:
            chunk = await process.stdout.read(65536)
            if not chunk:
                break
            target.extend(chunk)

    async def _poll(self, sid, milliseconds, max_output_tokens):
        session = self.sessions[sid]
        process = session['process']
        start = time.monotonic()
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(asyncio.shield(session['wait']), max(0.001, milliseconds/1000))
        if process.returncode is not None:
            await session['reader']
        raw = bytes(session['buffer'][session['cursor']:])
        session['cursor'] = len(session['buffer'])
        # Character budget is explicitly approximate; full bytes remain on disk.
        content = raw.decode('utf-8', errors='replace')
        limit = max(0, int(max_output_tokens))*4
        output = content if len(content) <= limit else content[:limit]+'\n[truncated; full output in tool log]'
        result = {'output': output, 'wall_time_seconds': time.monotonic()-start,
                  'original_token_count': (len(content)+3)//4, 'exit_code': process.returncode}
        if process.returncode is None:
            result['session_id'] = sid
        self.log('process.output', {'session_id': sid, 'output': content, 'exit_code': process.returncode})
        return result

    async def exec_command(self, cmd, workdir=None, yield_time_ms=10000,
                           max_output_tokens=10000, shell='/bin/bash', login=False, tty=False, **options):
        if tty:
            raise ValueError('PTY was unused in teacher trace; this host supports pipe sessions only')
        if options.get('sandbox_permissions') == 'require_escalated':
            raise ValueError('This host has no escalation flow; use configured host permissions')
        cwd = Path(workdir or self.workspace).resolve()
        if not cwd.is_relative_to(self.workspace):
            raise ValueError('workdir must be within this run workspace')
        process = await asyncio.create_subprocess_exec(*self.command([shell, '-lc' if login else '-c', cmd], cwd=cwd),
            cwd=cwd, env=self.env, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT, start_new_session=True)
        sid = uuid.uuid4().hex[:12]
        buffer = bytearray()
        self.sessions[sid] = {'process': process, 'buffer': buffer, 'cursor': 0,
            'reader': asyncio.create_task(self._read(process, buffer)), 'wait': asyncio.create_task(process.wait())}
        self.log('process.started', {'session_id': sid, 'pid': process.pid, 'cmd': cmd, 'cwd': str(cwd)})
        return await self._poll(sid, min(max(yield_time_ms, 1), 30000), max_output_tokens)

    async def write_stdin(self, session_id, chars='', yield_time_ms=1000, max_output_tokens=10000):
        if session_id not in self.sessions:
            raise ValueError('Unknown or lost process session; inspect workspace before restarting')
        process = self.sessions[session_id]['process']
        if chars:
            if process.returncode is not None:
                raise ValueError('Process already exited')
            process.stdin.write(chars.encode())
            await process.stdin.drain()
        return await self._poll(session_id, min(max(yield_time_ms, 1), 60000), max_output_tokens)

    def image_path(self, path):
        result = Path(path)
        result = (self.workspace/result).resolve() if not result.is_absolute() else result.resolve()
        if not result.is_relative_to(self.workspace):
            raise ValueError('Image must be inside this run; use TMPDIR for temporary renders')
        return result

    async def view_image(self, path, detail='original'):
        file = self.image_path(path)
        mime = mimetypes.guess_type(file.name)[0]
        if mime not in ('image/png', 'image/jpeg', 'image/webp', 'image/gif'):
            raise ValueError('Render non-raster images to PNG before viewing')
        data = file.read_bytes()
        url = f'data:{mime};base64,'+base64.b64encode(data).decode()
        self.image_paths[url] = str(file)
        return {'image_url': url, 'detail': detail}

    async def image_gen__imagegen(self, prompt, referenced_image_paths=None, num_last_images_to_include=None):
        if referenced_image_paths is not None and num_last_images_to_include is not None:
            raise ValueError('Use one reference mechanism, not both')
        references = referenced_image_paths or []
        if num_last_images_to_include is not None:
            n = num_last_images_to_include
            if not isinstance(n, int) or not 1 <= n <= 5 or n > len(self.seen_images):
                raise ValueError('Requested recent images unavailable')
            references = self.seen_images[-n:]
        paths = [self.image_path(p) for p in references]
        result = await self.image_provider(prompt, paths)
        self.image_paths[result['image_url']] = result['path']
        return result

    async def _cell(self, cell, code, parent_call_id):
        proc = await asyncio.create_subprocess_exec(*self.command(['node', str(Path(__file__).with_name('code_worker.mjs'))]),
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            env=self.env, start_new_session=True, limit=32*1024*1024)
        cell['process'] = proc
        requests = set()

        async def send(value):
            if proc.returncode is None:
                proc.stdin.write((json.dumps(value)+'\n').encode())
                await proc.stdin.drain()

        async def dispatch(message):
            try:
                value = await self.call(message['name'], message.get('args', {}), parent_call_id)
                await send({'type': 'result', 'id': message['id'], 'value': value})
            except Exception as e:
                with suppress(BrokenPipeError, ConnectionResetError):
                    await send({'type': 'result', 'id': message['id'], 'error': str(e)})

        try:
            await send({'type': 'start', 'code': code, 'tools': self.names, 'memory': self.memory})
            async with asyncio.timeout(self.cell_timeout):
                while raw := await proc.stdout.readline():
                    message = json.loads(raw)
                    if message['type'] == 'tool':
                        task = asyncio.create_task(dispatch(message))
                        requests.add(task)
                        task.add_done_callback(requests.discard)
                    elif message['type'] == 'content':
                        cell['output'].append(message['content'])
                        content = message['content']
                        if content['type'] == 'input_image':
                            url = content['image_url']
                            path = self.image_paths.get(url)
                            if path is None:
                                header, data = url.split(',', 1)
                                extension = mimetypes.guess_extension(header[5:].split(';')[0]) or '.png'
                                file = self.workspace/'.tmp'/('viewed-'+uuid.uuid4().hex+extension)
                                file.write_bytes(base64.b64decode(data, validate=True))
                                path = str(file)
                                self.image_paths[url] = path
                            self.seen_images.append(path)
                    elif message['type'] == 'store':
                        self.memory[message['key']] = message['value']
                    elif message['type'] == 'yield':
                        cell['yielded'].set()
                    elif message['type'] == 'error':
                        cell['output'].append(text({'error': message['error']}))
                    elif message['type'] == 'done':
                        cell['completed'] = True
                await proc.wait()
                if proc.returncode:
                    cell['output'].append(text({'error': (await proc.stderr.read()).decode()}))
        except TimeoutError:
            cell['output'].append(text({'error': 'Cell time limit reached; task is not complete'}))
        finally:
            for task in list(requests):
                task.cancel()
            await asyncio.gather(*requests, return_exceptions=True)
            if proc.returncode is None:
                proc.kill()
                await proc.wait()

    async def exec(self, code, call_id, yield_time_ms=30000):
        first = code.splitlines()[0] if code.splitlines() else ''
        budget = 10000
        if first.strip().startswith('// @exec:'):
            options = json.loads(first.split('// @exec:', 1)[1])
            yield_time_ms = options.get('yield_time_ms', yield_time_ms)
            budget = options.get('max_output_tokens', budget)
        cid = uuid.uuid4().hex[:12]
        cell = {'output': [], 'cursor': 0, 'yielded': asyncio.Event(), 'completed': False}
        self.cells[cid] = cell
        cell['task'] = asyncio.create_task(self._cell(cell, code, call_id))
        return await self.wait(cid, yield_time_ms, max_tokens=budget)

    async def wait(self, cell_id, yield_time_ms=10000, max_tokens=10000, terminate=False):
        if cell_id not in self.cells:
            raise ValueError('Unknown or completed JS cell; shell session IDs are separate')
        cell = self.cells[cell_id]
        if terminate:
            cell['task'].cancel()
            with suppress(asyncio.CancelledError):
                await cell['task']
        else:
            wake = asyncio.create_task(cell['yielded'].wait())
            try:
                await asyncio.wait([cell['task'], wake], timeout=min(max(yield_time_ms, 1), 60000)/1000,
                                   return_when=asyncio.FIRST_COMPLETED)
            finally:
                wake.cancel()
                cell['yielded'].clear()
        output = cell['output'][cell['cursor']:]
        cell['cursor'] = len(cell['output'])
        remaining = max(0, int(max_tokens))*4
        visible = []
        for item in output:
            if item['type'] == 'input_text':
                value = item['text']
                if len(value) > remaining:
                    item = text(value[:remaining]+'\n[truncated; complete content is in cell.output event]')
                remaining = max(0, remaining-len(value))
            visible.append(item)
        self.log('cell.output', {'cell_id': cell_id, 'output': output})
        done = cell['task'].done()
        if done:
            if not cell['task'].cancelled() and cell['task'].exception():
                visible.append(text({'error': str(cell['task'].exception())}))
            del self.cells[cell_id]
        visible.insert(0, text('Script terminated' if terminate else 'Script completed' if done else f'Script running with cell ID {cell_id}'))
        return visible

    async def close(self):
        for c in list(self.cells.values()):
            c['task'].cancel()
        await asyncio.gather(*(c['task'] for c in self.cells.values()), return_exceptions=True)
        for session in self.sessions.values():
            p = session['process']
            if p.returncode is None:
                with suppress(ProcessLookupError):
                    os.killpg(p.pid, signal.SIGKILL)
            await session['wait']
            await session['reader']
