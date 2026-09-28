#!/usr/bin/env python3
"""Inspect the exact staged tree or commit, including the bundled editor archive."""
import io
import pathlib
import re
import subprocess
import sys
import tarfile

ROOTS = {'notale-format', 'notale-editor', 'notale-editor-frontend', 'notale-ts', 'notale-viewer', 'scripts', 'docs', '.github'}
FILES = {'README.md', 'README.zh-CN.md', 'LICENSE', 'CHANGELOG.md', '.gitignore', '.env.example'}
# Permit the exact core repository coordinate (and its URL paths), never similarly named private repositories.
PRIVATE = re.compile(rb'notale[-_]v2|THU-AICosmos(?!/Notale(?:\.git)?(?=$|[/\s\"\'<>()\[\],:;?!#`]))|Notale-(?:online|integration-archive)|Notale-internal-archive|interactive_lecture_platform_integration|/(?:data1/home|home|Users)/[\w.-]+/')
SECRETS = re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b')
errors = []

def inspect(name, data, policy=False):
    if SECRETS.search(data): errors.append(name + ': credential-like content')
    if not policy and len(data) <= 2_000_000 and b'\0' not in data and PRIVATE.search(data):
        errors.append(name + ': private workspace reference')

def archive(name, data):
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
        members = tar.getmembers()
        if sum(m.size for m in members) > 100_000_000: raise ValueError('archive exceeds review size limit')
        for m in members:
            p = pathlib.PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or not (m.isfile() or m.isdir()):
                errors.append(name + ': unsafe archive entry ' + m.name)
            elif m.isfile(): inspect(name + ':' + m.name, tar.extractfile(m).read())

def main():
    revision = sys.argv[1] if len(sys.argv) > 1 else '--staged'
    if revision == '--staged':
        tree = subprocess.check_output(['git', 'write-tree'], text=True).strip()
    else:
        tree = subprocess.check_output(['git', 'rev-parse', '--verify', revision + '^{tree}'], text=True).strip()
    entries = subprocess.check_output(['git', 'ls-tree', '-rz', tree]).split(b'\0')
    count = 0
    # One persistent cat-file process keeps the scan linear without thousands of subprocesses.
    cat = subprocess.Popen(['git', 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    try:
        for entry in entries:
            if not entry: continue
            meta, raw_name = entry.split(b'\t', 1)
            mode, kind, oid = meta.split()
            name = raw_name.decode()
            parts = pathlib.PurePosixPath(name).parts
            if mode not in (b'100644', b'100755'):
                errors.append(name + ': non-regular source entry'); continue
            if parts[0] not in ROOTS and name not in FILES: errors.append(name + ': outside public scope')
            if any(p in {'node_modules', '.local', 'runs', '.git', 'integration', 'deploy'} for p in parts): errors.append(name + ': local or private directory')
            if any(p.startswith('.env') and p != '.env.example' for p in parts): errors.append(name + ': environment file')
            cat.stdin.write(oid + b'\n'); cat.stdin.flush()
            header = cat.stdout.readline().split(); size = int(header[2])
            data = cat.stdout.read(size); cat.stdout.read(1)
            inspect(name, data, name == 'scripts/check-public-source.py')
            if name.endswith('.tgz'): archive(name, data)
            count += 1
    finally:
        cat.stdin.close(); cat.stdout.close(); cat.wait()
    if errors: sys.exit('\n'.join(errors))
    print(f'Public source check passed: {count} files, tree {tree[:12]}')


if __name__ == '__main__':
    main()
