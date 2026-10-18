# Run Notale with Docker

[简体中文](DOCKER.zh-CN.md) · [Back to README](../README.md)

Run the complete personal workspace: describe a topic, upload reference material, watch a lecture take shape, then open it in the visual editor. Docker provides the application, PostgreSQL and the sandbox used by AI editing.

## Configure once, start with one command

Install Docker Engine with Compose v2, or Docker Desktop configured for Linux containers. The commands below use a Bash-compatible shell. You do not need Node.js, PostgreSQL, Chromium or LibreOffice installed on the host.

Clone the repository and create your local configuration:

```bash
git clone https://github.com/THU-AICosmos/Notale.git
cd Notale
cp .env.example .env.local
```

Edit `.env.local` and fill in both keys for the default configuration:

```dotenv
GEMINI_API_KEY=your-google-gemini-key
PARATERA_API_KEY=your-paratera-key
```

Create a Gemini key in [Google AI Studio](https://aistudio.google.com/apikey) and a Paratera key in the [Paratera MaaS console](https://ai.paratera.com/#/lms/model). See the [Google key guide](https://ai.google.dev/gemini-api/docs/api-key) and [Paratera API setup instructions](https://www.paratera.com/news_des/122.html).

| Key | What the default configuration uses it for |
| --- | --- |
| `GEMINI_API_KEY` | Understanding requests and files, planning, visual direction, ordinary pages and conversation-based revisions. |
| `PARATERA_API_KEY` | Code-page generation and generated illustrations. |

The providers must enable the models named in [`notale-ts/resources/config.yaml`](../notale-ts/resources/config.yaml). Supplying a key does not guarantee that its account has model access or quota. Model usage is billed by your provider. `.env.local` is ignored by Git; keep it private.

From the repository root, start everything:

```bash
docker compose --env-file .env.local up -d --build --wait
```

The first start downloads and builds the application and sandbox images, including browser and document-conversion dependencies. Allow time and disk space for these downloads; subsequent starts reuse the images and persistent data. Initialization must complete and service health checks must pass before the command reports success. [How Compose waits for dependencies](https://docs.docker.com/compose/how-tos/startup-order/).

Open **[localhost:3000](http://localhost:3000)** to create a lecture. The **[visual editor](http://localhost:4312)** is also available directly; the Viewer’s editor button opens the selected lecture version there.

Successful startup confirms that the services are ready. The first real generation also checks your provider’s model access, quota and availability.

## What runs

| Service | Role |
| --- | --- |
| `viewer` | Creation workspace, conversation, live generation preview and editor entry. |
| `generator` | Generation, revisions, file processing and conversation history. |
| `editor-web` | Visual editor; serves the editor and proxies isolated lecture content. |
| `editor` | Editor API, saved documents, assets and content server. |
| `postgres` | PostgreSQL 16 for editor documents and assets. |
| `sandbox-engine` | Dedicated Docker engine for disposable AI execution sandboxes. |
| `init` | Creates data directories and prepares sandbox images, networking and the outbound proxy; exits when finished. |

The four application services share a built image and run as a non-root user. The image includes Node.js 22, Chromium, LibreOffice, FFmpeg, Poppler and fonts. Internal APIs and PostgreSQL have no published host ports.

Only `127.0.0.1:3000` and `127.0.0.1:4312` are published. Lecture content uses the separate browser origin `http://notale-content.localhost:4312`. Keep this separation: interactive lecture HTML does not belong on the editor’s own origin.

This is a **personal, single-user installation without public account authentication**. The sandbox engine uses Docker-in-Docker with `privileged: true`; it shares its own Unix socket with the applications and does not mount the host Docker socket. Privileged mode still requires a trusted host and administrator. Multi-user hosting needs host authentication and authorization; see the [editor integration contract](../notale-editor/docs/INTEGRATION.md).

### Ports and remote access

If a default port is occupied, add unused ports to `.env.local`:

```dotenv
NOTALE_VIEWER_PORT=3001
NOTALE_EDITOR_PORT=4313
```

Run the start command again and open the new ports. Editor links and the content origin use `NOTALE_EDITOR_PORT` automatically. The internal API addresses stay unchanged.

For a private server, keep the loopback bindings and use SSH forwarding from your computer:

```bash
ssh -N -L 3000:127.0.0.1:3000 -L 4312:127.0.0.1:4312 user@server
```

Open the same local URLs in your computer’s browser. Forward the configured ports if you changed them. `notale-content.localhost` must resolve to loopback on the computer running the browser; if local DNS software prevents this, add a local hosts entry for that name.

## Day-to-day commands

Run these from the repository root, with the same `.env.local`:

```bash
# Check service health and initialization status.
docker compose --env-file .env.local ps -a

# Follow application and initialization logs. Ctrl+C stops following logs.
docker compose --env-file .env.local logs -f --tail=100 generator editor viewer editor-web init

# Stop services and remove their containers and network; retain stored data.
docker compose --env-file .env.local down

# Start again using existing images and data.
docker compose --env-file .env.local up -d --wait
```

After changing keys or ports, use `up -d --wait` again so Compose can recreate affected containers. `restart` alone does not apply changed environment values.

### Update

Wait for active generation and editing to finish, then [make a backup](#back-up-and-restore). On a clean checkout:

```bash
docker compose --env-file .env.local down
git pull --ff-only
docker compose --env-file .env.local up -d --build --wait
```

The last command rebuilds the application and prepares the sandbox for the checked-out source. Named volumes retain the database, lectures and editing state. Keep the same Compose project name: the default is `notale`, while `-p` or `COMPOSE_PROJECT_NAME` selects a different set of project volumes. [Compose project naming](https://docs.docker.com/compose/how-tos/environment-variables/envvars/#compose_project_name).

### Where data lives

| Compose volume | Contents | Backup needed? |
| --- | --- | --- |
| `postgres` | Editor database: documents, saved revisions and assets. | Yes. |
| `data` | Generator runs, conversations and input files; editor local state, preview signing secret and AI workspaces; Viewer run-to-editor associations. | Yes, together with the database. |
| `sandbox-engine` | Sandbox image and build cache. | No; initialization recreates it. |
| `sandbox-socket` | Internal Docker socket. | No. |

Ordinary `down` preserves named volumes. **`docker compose --env-file .env.local down --volumes` deletes this installation’s stored data**, including lectures and the database; use it only when you intentionally want a fresh installation. [Docker’s volume-removal behavior](https://docs.docker.com/reference/cli/docker/compose/down/).

## Back up and restore

### Back up a consistent pair

Finish active work first. The following commands pause application writes while PostgreSQL remains available, then save both required volumes outside the repository. Run them in one shell and check that each command succeeds before continuing.

```bash
NOTALE_BACKUP="$(pwd)/../notale-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$NOTALE_BACKUP"
docker compose --env-file .env.local stop viewer editor-web generator editor
docker compose --env-file .env.local exec -T postgres pg_dump -U notale_editor -d notale_editor -Fc > "$NOTALE_BACKUP/editor.dump"
docker compose --env-file .env.local run --rm --no-deps -T --entrypoint tar init -C /data -czf - . > "$NOTALE_BACKUP/notale-data.tgz"
git rev-parse HEAD > "$NOTALE_BACKUP/source-commit.txt"
docker compose --env-file .env.local up -d --wait
```

Store the backup securely: it contains private lecture content and the editor’s signing secret. Keep your `.env.local` separately in secure storage. Both the database dump and data archive are required; restoring only one can lose document links or signing state.

### Restore into a new project

Use the source commit recorded in `source-commit.txt` for the initial restore, with its matching configuration. Choose a new Compose project so the original volumes remain available. The commands below assume the default project is currently running; stop it first to free the browser ports.

```bash
docker compose --env-file .env.local down
NOTALE_BACKUP=/absolute/path/to/notale-backup
NOTALE_RESTORE_PROJECT="notale-restored-$(date +%Y%m%d-%H%M%S)"
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local up -d --wait postgres
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local exec -T postgres pg_restore -U notale_editor -d notale_editor --no-owner --exit-on-error < "$NOTALE_BACKUP/editor.dump"
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local run --rm --no-deps -T --entrypoint tar init -C /data -xzf - < "$NOTALE_BACKUP/notale-data.tgz"
docker compose -p "$NOTALE_RESTORE_PROJECT" --env-file .env.local up -d --build --wait
```

Check a saved conversation, open its lecture in the editor and confirm the saved content is present. After verifying the restore, set `COMPOSE_PROJECT_NAME` in `.env.local` to the exact value of `NOTALE_RESTORE_PROJECT`; subsequent commands without `-p` will then address the restored installation. Retain the original volumes until you are satisfied with the restore.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Missing-key error before startup | Fill both required keys in `.env.local` and keep `--env-file .env.local` in the command. Shell variables take precedence; unset stale overrides. |
| `address already in use` | Choose unused ports with `NOTALE_VIEWER_PORT` and `NOTALE_EDITOR_PORT`; leave the existing service running. |
| `all predefined address pools have been fully subnetted` | The Docker host has exhausted its default network address pools. Check existing Docker networks and host/VPN routes, then assign this project a confirmed unused subnet through `networks.default.ipam.config` in a local `compose.override.yaml`. Keep that override for later commands; do not delete networks belonging to other services. |
| First build fails while downloading packages or images | Check the host’s access to container registries and package repositories, available disk space, and the failing build step. Retry after fixing that cause. |
| `init` fails, or dependent applications never start | Run `docker compose --env-file .env.local logs --tail=200 init sandbox-engine`. Check Docker privileged-container support and the actual initialization error. |
| Editor opens but lecture content is blank | Check that `notale-content.localhost` resolves to loopback, that its configured port is forwarded, and inspect `editor` / `editor-web` logs. |
| Services are healthy but generation fails | Inspect `generator` logs and the provider’s model access, quota and response. Health checks do not call models or validate generation quality. |
| AI editing cannot start | Inspect `init`, `sandbox-engine` and the responsible backend’s logs. Both the backend and the isolated engine must see the shared `/data` workspace. |
| Data seems missing after a restart | Check whether `-p` or `COMPOSE_PROJECT_NAME` changed. A different project creates different volumes; switch back to the original project before attempting recovery. |

The deployment targets Linux/amd64. Docker Desktop and WSL2 require Linux containers and support for the privileged sandbox engine; they have not been validated for this delivery. ARM support is not guaranteed. See the release notes for the checks actually completed on a given release.
