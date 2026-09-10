"""Content-addressed file evidence at tool boundaries, outside the model jail."""
import hashlib
import json
import os
from pathlib import Path
import uuid


class Artifacts:
    def __init__(self, workspace, state_dir):
        self.workspace = Path(workspace)
        self.root = Path(state_dir)/'artifacts'
        (self.root/'blobs').mkdir(parents=True, exist_ok=True)
        (self.root/'snapshots').mkdir(exist_ok=True)

    def capture(self, boundary):
        files = {}
        for folder in ('input', 'output'):
            for path in sorted((self.workspace/folder).rglob('*')):
                relative = str(path.relative_to(self.workspace))
                if path.is_symlink():
                    files[relative] = {'symlink': os.readlink(path)}
                elif path.is_file():
                    try:
                        data = path.read_bytes()
                    except FileNotFoundError:
                        files[relative] = {'state': 'disappeared_during_snapshot'}
                        continue
                    digest = hashlib.sha256(data).hexdigest()
                    blob = self.root/'blobs'/digest
                    if not blob.exists():
                        blob.write_bytes(data)
                        blob.chmod(0o600)
                    files[relative] = {'sha256': digest, 'bytes': len(data)}
        ident = uuid.uuid4().hex
        record = {'id': ident, 'boundary': boundary, 'files': files,
                  'consistency': 'observed-nonatomic; running processes may still be writing',
                  'scope': 'input/output files only; not process memory or a resumable VM'}
        (self.root/'snapshots'/f'{ident}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2))
        return ident
