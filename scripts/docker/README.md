# Docker packaging

The root Compose file starts the personal, local Notale stack. The four application
services use one image; only the generator and editor backend receive model keys
and the private sandbox engine's Unix socket. Host Docker sockets are never mounted.

`init.mjs` prepares persistent directories, builds the existing sandbox images in
that private engine, verifies its internal network and proxy, and tests a real
sandbox read/write through `/data`. A nonzero exit prevents application startup.
The engine and both backends mount the same data volume at the same absolute path;
the existing sandbox code can therefore bind each individual workspace directly.
Initialization does not delete session data or touch containers in the host engine.

All application services run as UID/GID 1000. Initialization alone runs as root to
own its new data directories. The editor's existing Chromium sandbox remains
enabled; its Compose service uses the complete Playwright seccomp profile below.
The generator retains its existing browser options. Neither application code nor
generation prompts are changed by this packaging.

## Included seccomp profile

`chromium-seccomp.json` is based on Microsoft Playwright **v1.55.1**, matching
the project's installed Playwright version, with one documented compatibility patch:

- Source: https://github.com/microsoft/playwright/blob/v1.55.1/utils/docker/seccomp_profile.json
- License: Apache-2.0, https://github.com/microsoft/playwright/blob/v1.55.1/LICENSE
- Upstream SHA-256: `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`
- Copyright Microsoft Corporation.

It preserves the default deny policy and permits the namespace operations required
by Chromium. Upgrade it deliberately together with the browser, retaining its
source and license information.

Local compatibility patch: `clone3` returns `ENOSYS` (errno 38), allowing Debian
Bookworm's glibc to fall back to `clone` when creating threads. The upstream file
omits `clone3`, whose default `EPERM` result otherwise prevents that fallback.
The original `clone`, `setns` and `unshare` allowances remain unchanged. This is
the same fallback behavior used by [Moby's default seccomp profile](https://github.com/moby/profiles/blob/main/seccomp/default.json).

The DinD service uses `privileged` to run its own daemon, with an explicit Unix-only
listener. It is not a multi-tenant hosting boundary. See the Docker guide in `docs/`
for startup, persistence, backup and platform support.
