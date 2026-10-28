# Film backend

Film media and export routes belong to `@notale/editor`. `createApps({ film })`
registers them on the existing editor API and closes their owned tasks with that
API. No Motale gateway, extra render listener, repository source tree, or
personal browser installation path is required. Generation/Harness is unchanged.

## Configuration

`FilmServerOptions` accepts `dataDir`, `playerDir`, `ffmpeg`, `ffprobe`,
`chromium`, `python`, and `trustedLocalFilms`. Embedded hosts opt in by supplying
`film`; existing hosts without that option retain their current behavior.

The standalone editor reads `EDITOR_FILM_DATA_DIR` (default
`.local/editor-film`), `EDITOR_FILM_PLAYER_DIR`, `EDITOR_FFMPEG_PATH`,
`EDITOR_FFPROBE_PATH`, `EDITOR_CHROMIUM_PATH`, and `EDITOR_PYTHON_PATH`.
FFmpeg/FFprobe/Python default to PATH; Chromium defaults to the Playwright
installation matching the declared dependency. Install optional Python helpers
from `dist/server/film/requirements-export.txt` in the configured Python environment.

The frontend build creates `.local/film-runtime` with player JavaScript, CSS,
overlay HTML and a hash manifest. Deploy this directory as a unit and pass its
location to the backend. The backend supplies its own bundled bridge/text
runtime. `start:local` checks the runtime and passes its location automatically.
Missing tools appear in `/film-export/capabilities`; the editor itself remains
available. Export selection explains unavailable formats.

## Identity and content

All media/export API requests use the existing host `Integration` identity and
policy. Storage and derived files are partitioned by a SHA-256 workspace key.
Uploads remain streaming (2 GiB per file), independent of the lecture blob
upload limit. Export job records include actor/workspace; document access is
checked for creation, lookup, retry, cancellation and download. Idempotency is
isolated by workspace, actor, document and request ID.

`POST /api/documents/:id/film-preview` accepts `{ document }` and returns a
runtime-only document with signed content URLs, expiry and `sameOriginRequired`.
Grants cover only the resolved resource closure and expire after one hour or a
backend restart. Renew by requesting a new preview. Never persist these URLs.
The existing isolated content hostname serves them without host credentials.

**BRIDGE-v2 declares `crossOrigin:false`.** Direct Motale/OpenFilm editing still
requires trusted same-origin code. Embedded hosts default to rejecting authored
HTML/JS/SVG on the authenticated API origin. The standalone local server allows
an explicit `EDITOR_TRUSTED_LOCAL_FILMS=1` only when bound to loopback. This is
for trusted films in a local workspace, not an online multi-user deployment.
Lecture content isolation is unchanged. Cross-origin Motale object editing
requires a new bridge; signed URLs alone do not supply that capability.

## Data migration

Build the backend, then preview the explicit migration:

```sh
node dist/server/film/migrate.js --from /absolute/legacy/motale-film \
  --data /absolute/editor-film --scope film-smoke --actor film-smoke
```

Add `--apply` to copy and verify before atomically publishing the new workspace.
The tool retains originals, document IDs and database revisions. Existing target
workspaces are not overwritten. Repeating a completed migration verifies its
manifest; changed originals/targets and symlinks are rejected. Derived caches
are regenerated. Export records gain explicit ownership; interrupted jobs can
be retried from their original snapshots. No original directory is automatically
deleted. Legacy fixture directories should be imported as ordinary media bundles.

For the previous local database use its original `film-smoke` actor/scope;
the standalone development adapter exposes `EDITOR_LOCAL_ACTOR` and
`EDITOR_LOCAL_SCOPE` for that purpose. Production hosts must supply their own
identity adapter rather than using the standalone development identity.

## Validation and tests

`npm run test:film` covers authenticated routes, scoped uploads, ranges, signed
content, migration, media derivatives, export snapshots, rational frame grids,
job recovery/cancellation and rhythm analysis. Frontend workflow smoke tools
live under the frontend's `tests/film-smoke` directory. They use an explicitly
started test stack and independent documents.

The isolated export browser serves packaged runtime and immutable inputs through
request fulfillment. It cannot make arbitrary network requests and carries no
user cookies or API credentials. Completed outputs and retry inputs survive
shutdown; owned browser/FFmpeg children are released. Export work is serialized
within one API instance. Deploy one owner process per film data directory.

The migration was checked with 59,082 local files (1.11 GB), retaining the source
directory and the original document at revision 20. Acceptance used the installed
package's normal server entrypoint: lecture preview, film save/undo, native object
editing, three-engine PNG rendering, MP4, interactive ZIP, and a combined
Motale/title/audio frame export and scope sample. The browser fulfillment path
supports byte ranges so native audio can seek to the requested capture time.
