#!/usr/bin/env python3
"""Install the core push guard without changing remotes, credentials or visibility."""
from pathlib import Path
import subprocess

ALLOWED = [
    'git@github.com:THU-AICosmos/Notale.git', 'https://github.com/THU-AICosmos/Notale.git',
    'git@github.com:JJchess/Notale.git', 'https://github.com/JJchess/Notale.git',
]


def hook_source():
    return """#!/usr/bin/env python3
import subprocess, sys
from pathlib import Path
ALLOWED = %r
if len(sys.argv) < 3 or sys.argv[2] not in ALLOWED:
    sys.exit('Push refused: core can only push to the canonical repository or its mirror.')
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], text=True).strip())
commits = set()
for line in sys.stdin:
    local_ref, local_sha, remote_ref, remote_sha = line.split()
    if local_sha == '0' * 40:
        continue
    # Scan ancestry even if another remote already advertises a commit: a clean tip alone
    # does not make a branch with private parent commits suitable for publication.
    tip = subprocess.check_output(['git', 'rev-parse', '--verify', local_sha + '^{commit}'], cwd=root, text=True).strip()
    commits.update(subprocess.check_output(['git', 'rev-list', tip], cwd=root, text=True).splitlines())
for commit in sorted(commits):
    subprocess.run([sys.executable, str(root / 'scripts/check-public-source.py'), commit], cwd=root, check=True)
""" % ALLOWED


def main():
    root = Path(__file__).resolve().parents[1]
    origin = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], cwd=root, text=True).strip()
    if origin not in ALLOWED:
        raise SystemExit('Run this only in a clone of the canonical core repository or its mirror.')
    gitdir = Path(subprocess.check_output(['git', 'rev-parse', '--absolute-git-dir'], cwd=root, text=True).strip())
    hooks = gitdir / 'notale-hooks'
    hooks.mkdir(exist_ok=True)
    hook = hooks / 'pre-push'
    hook.write_text(hook_source())
    hook.chmod(0o755)
    for key, value in [('core.hooksPath', str(hooks)), ('remote.pushDefault', 'origin'), ('push.default', 'simple')]:
        subprocess.run(['git', 'config', key, value], cwd=root, check=True)
    print('Core push guard installed; repository visibility and credentials unchanged')


if __name__ == '__main__':
    main()
