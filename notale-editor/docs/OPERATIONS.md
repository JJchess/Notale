# Backup and restore verification

The editor stores confirmed document heads, immutable revisions, mutation replay records, asset mappings, scoped upload grants, blob bytes and renewable preview leases in PostgreSQL. These seven tables must be backed up together. Browser pending journals and presentation checkpoints live in browser storage; export unconfirmed operations with the workbench recovery controls when moving that storage. Host identity services, deployment secrets and PostgreSQL cluster roles are separate dependencies. Retain the configured preview signing secret when recovering an instance; the standalone server persists its default key in `.local/preview-secret` with mode 0600. That file is separate from the database archive.

PostgreSQL `pg_dump` creates a consistent database backup while other connections continue working. Custom archives are compressed and restored with `pg_restore`. This repository's drill pins an exported transaction snapshot so the audit and dump refer to the exact same recovery point. See the official [PostgreSQL 16 pg_dump documentation](https://www.postgresql.org/docs/16/app-pgdump.html) and [pg_restore documentation](https://www.postgresql.org/docs/16/app-pgrestore.html).

## Run the complete drill

From the source checkout, with the local Compose PostgreSQL running, compiled browser bundles present, and a complete real lecture imported:

```bash
npm run build
CHROMIUM_PATH=/path/to/chromium npm run test:restore
```

Use the Playwright-installed Chromium by omitting `CHROMIUM_PATH` when available. The script uses the local database URL from the example by default. Optional settings are `RESTORE_SOURCE_URL`, `RESTORE_PG_CONTAINER`, `RESTORE_SCOPE` and `RESTORE_DOCUMENT_ID`. The Docker PostgreSQL tools and the application connection must address the same cluster; the script verifies their system identifiers before changing anything. This local administrative drill requires permission to inspect that identifier and create/drop a database. It runs PostgreSQL tools in the configured container, so no host `pg_dump` installation is needed.

The drill:

1. Reads the imported fixture and creates a uniquely scoped temporary clone with two distinct resource versions, an edit and a historical restore. Existing source documents are never edited.
2. Pins a repeatable-read exported snapshot and records deterministic SHA-256 summaries/counts of all seven editor tables. It verifies every blob's stored hash and byte count.
3. Advances the temporary source document from v3 to v4 after the snapshot, then dumps the earlier snapshot. This explicitly checks recovery-point semantics under a concurrent write.
4. Creates a random `editor_restore_<uuid>` database from `template0`. A truncated copy of the archive must fail restoration and leave no public tables. The intact archive is then restored with `--single-transaction --exit-on-error --no-owner --no-acl`.
5. Compares every editor-table summary and all blob hashes/sizes against the pinned snapshot. It verifies exact historical snapshots, old and replacement resource bytes, commit/restore replay without advancing the head, and rejection of an actor mismatch. The source retains v4 while the restored database has v3.
6. Starts API/content services on separate ephemeral loopback ports. It audits all pages of the restored real lecture, then runs the complete browser suite against that database, including edit/save/reopen, native Canvas/SVG/steps, animation, media, portability, concurrency and failure recovery.
7. Closes temporary services and connections, drops only the database created by that invocation, removes its source probe/scope and unreferenced probe bytes, and writes the final report. Cleanup failures produce a failed result; they do not silently claim success.

Each invocation prints its `.local/restore-<uuid>/` evidence directory. It contains the private custom archive, SHA-256/size in `report.json`, the intentional truncated archive, table/blob summaries, revision/replay results, per-page audit, browser JSON/report artifacts and logs. Archives are retained for inspection; permissions are 0700 on the directory and 0600 on archive/report files. Browser outputs are isolated from ordinary test reports. No browser suite is started against the source database.

A passing drill establishes logical restoration of this editor database and runtime in the tested environment. It does not establish cluster-role restoration, point-in-time/WAL recovery, cross-version migration, an off-host backup policy or recovery of external host-system data. Retain the application version and its migration/runtime artifacts alongside production recovery instructions.

## Take and restore a normal local backup

Use a unique path and retain the checksum. Only expose a backup as complete after `pg_dump` succeeds:

```bash
set -e
umask 077
mkdir -p .local/backups
backup_dir="$(mktemp -d .local/backups/backup-XXXXXX)"
docker compose -p notale-editor exec -T postgres \
  pg_dump -U notale_editor --format=custom notale_editor > "$backup_dir/database.dump.partial" &&
  mv "$backup_dir/database.dump.partial" "$backup_dir/database.dump"
(cd "$backup_dir" && sha256sum database.dump > database.dump.sha256)
```

Restore into a new database; the following name must be unused. `createdb` intentionally fails if it exists. The `&&` ensures that a failed creation cannot lead to restoration into an existing database:

```bash
restore_db="notale_restore_$(date -u +%Y%m%dT%H%M%SZ)"
(cd "$backup_dir" && sha256sum -c database.dump.sha256) &&
  docker compose -p notale-editor exec -T postgres \
    createdb -U notale_editor --template=template0 "$restore_db" &&
  docker compose -p notale-editor exec -T postgres \
    pg_restore -U notale_editor --dbname="$restore_db" \
      --single-transaction --exit-on-error --no-owner --no-acl < "$backup_dir/database.dump"
```

Start an isolated application against that database with its own `DATABASE_URL`, API/content ports and preview secret, then validate the target before changing the host system's connection. Use compatible encoding/locale and arrange database ownership/grants for that deployment; the example deliberately assigns restored objects to the restoring role. The database backup includes application scopes/actors, but `--no-acl` does not recreate database privileges.

For a planned cutover requiring every accepted edit, stop or gate source writes before the final backup, or use the host's established replication/WAL procedure. A snapshot backup correctly excludes later edits, as the drill demonstrates. Keep the old database available until target validation succeeds; switching a connection is a separate deployment action.

If a drill is forcibly terminated before cleanup, its unique database name and evidence path are printed at startup. Inspect live processes/connections and the report before removing that specific temporary database/scope. Never use a broad name-pattern deletion to clean up unrelated databases or documents.
