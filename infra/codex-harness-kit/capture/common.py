"""Shared archive IO. Redact copies; never modify a user's live Codex home."""
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

SECRET_KEY = re.compile(r"authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|id_token|password|secret|credential", re.I)
PATTERNS = [
    re.compile(r"sk-(?:ant-)?[A-Za-z0-9_-]{20,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+"),
    re.compile(r"(?i)Bearer\s+[A-Za-z0-9._~+/=-]+"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b"),
]


def now():
    return datetime.now(timezone.utc).isoformat()


def secrets_from_auth(path):
    values = []
    if path and Path(path).is_file():
        def visit(v, key=""):
            if isinstance(v, dict):
                for k, x in v.items():
                    visit(x, k)
            elif isinstance(v, str) and SECRET_KEY.search(key) and len(v) >= 8:
                values.append(v)
        visit(json.loads(Path(path).read_text()))
    return values


def scrub(value, secrets=()):
    if isinstance(value, dict):
        return {k: "<redacted>" if SECRET_KEY.search(k) and isinstance(v, str)
                else scrub(v, secrets) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v, secrets) for v in value]
    if not isinstance(value, str):
        return value
    known = list(secrets) + [v for k, v in os.environ.items()
                            if SECRET_KEY.search(k) and len(v) >= 8]
    for s in sorted(set(known), key=len, reverse=True):
        value = value.replace(s, "<redacted>")
    for pattern in PATTERNS:
        value = pattern.sub("<redacted>", value)
    return value


def write_json(path, value, secrets=()):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(scrub(value, secrets), ensure_ascii=False, indent=2) + "\n")
    tmp.chmod(0o600)
    tmp.replace(path)


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def rows(path):
    """Preserve physical order and report malformed/truncated lines explicitly."""
    with Path(path).open(encoding="utf-8", errors="replace") as f:
        for n, line in enumerate(f, 1):
            try:
                value = json.loads(line)
                if not isinstance(value, dict):
                    raise ValueError("not an object")
                yield n, value, None
            except ValueError as e:
                yield n, None, str(e)
