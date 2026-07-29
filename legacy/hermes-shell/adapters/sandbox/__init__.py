"""adapters.sandbox —— Sandbox 的两实现：FakeSandbox（受限 in-process，确定）/ SubprocessSandbox（真进程隔离）。"""

from .fake import FakeSandbox
from .subprocess_rpc import SubprocessSandbox

__all__ = ["FakeSandbox", "SubprocessSandbox"]
