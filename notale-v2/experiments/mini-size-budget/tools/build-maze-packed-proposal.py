"""Build a runtime-only experiment, unsuitable for model-readable bundles."""
from pathlib import Path
import base64
import gzip
import hashlib
import json

base = Path("experiments/mini-size-budget")
directory = base / "combined/state-maze-stories"
source = (directory / "index.html").read_bytes()
packed = gzip.compress(source, compresslevel=9, mtime=0)
assert gzip.decompress(packed) == source
payload = base64.b64encode(packed).decode("ascii")
loader = '''<!doctype html><meta charset=utf-8><script>(async()=>{let b=Uint8Array.from(atob("PAYLOAD"),c=>c.charCodeAt(0)),h=await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).text();document.open();document.write(h);document.close()})()</script>'''
output = loader.replace("PAYLOAD", payload)
(directory / "packed-preview.html").write_text(output)
report = {
    "status": "runtime-only experiment; not an archive candidate",
    "reason": "core.sample_bundles preserves model-readable author HTML/CSS/JS; an opaque payload is not such a source example",
    "sourceChars": len(source.decode()),
    "packedFileChars": len(output),
    "sourceSha256": hashlib.sha256(source).hexdigest(),
    "gzipRoundTripByteEqual": True,
    "installed": False,
}
(base / "maze/packed-proposal.json").write_text(json.dumps(report, indent=2))
print(report)
