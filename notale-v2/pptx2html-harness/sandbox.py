"""Standalone Linux bubblewrap boundary; no capture-kit or Codex imports."""
import os
from pathlib import Path
import shutil
import subprocess
import sys


def find_bwrap():
    explicit = os.environ.get('BWRAP')
    if explicit:
        if not Path(explicit).is_file() or not os.access(explicit, os.X_OK):
            raise ValueError('BWRAP must name an executable')
        return explicit
    if shutil.which('bwrap'):
        return shutil.which('bwrap')
    # A standalone executable already installed on this machine; never launch Codex.
    candidates = sorted((Path.home()/'.npm-global/lib/node_modules/@openai/codex/node_modules').glob(
        '@openai/codex-linux-*/vendor/*/codex-resources/bwrap'))
    if len(candidates) == 1:
        return str(candidates[0])
    raise ValueError('Install bubblewrap or set BWRAP to its executable path')


class Sandbox:
    def __init__(self, workspace, state):
        self.work = Path(workspace).resolve()
        self.real_home = Path.home().resolve()
        self.private_home = Path(state).resolve()/'home'
        self.private_home.mkdir(exist_ok=True)
        self.bwrap = find_bwrap()
        self.runtimes = [p for p in [self.real_home/'.local', self.real_home/'.npm-global',
            self.real_home/'miniforge3', self.real_home/'.cache/ms-playwright'] if p.is_dir()]
        prefix = Path(sys.prefix).resolve()
        if prefix != Path('/') and not prefix.is_relative_to('/usr'):
            self.runtimes.append(prefix)
        self.env = {k: os.environ[k] for k in ('PATH', 'LANG', 'LC_ALL', 'TZ', 'TERM') if k in os.environ}
        self.env.update(HOME=str(self.real_home), SHELL='/bin/bash', TMPDIR=str(self.work/'.tmp'),
                        PLAYWRIGHT_BROWSERS_PATH=str(self.real_home/'.cache/ms-playwright'))

    def command(self, command, cwd=None):
        args = [self.bwrap, '--die-with-parent', '--unshare-user', '--unshare-pid',
                '--unshare-uts', '--unshare-ipc']
        for name in ('/usr', '/bin', '/sbin', '/lib', '/lib64', '/etc'):
            path = Path(name)
            if path.is_symlink():
                args += ['--symlink', os.readlink(path), name]
            elif path.exists():
                args += ['--ro-bind', name, name]
        args += ['--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
                 '--bind', str(self.private_home), str(self.real_home)]
        for path in sorted(set(self.runtimes), key=lambda p: len(str(p))):
            args += ['--ro-bind', str(path), str(path)]
        args += ['--bind', str(self.work), str(self.work),
                 '--ro-bind', str(self.work/'input'), str(self.work/'input'),
                 '--chdir', str(cwd or self.work), '--', *command]
        return args

    def preflight(self):
        result = subprocess.run(self.command(['/bin/true']), env=self.env, capture_output=True, timeout=10)
        if result.returncode:
            raise RuntimeError('Input isolation unavailable: '+result.stderr.decode(errors='replace'))
