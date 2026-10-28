# Film workflow smoke tools

These are development checks, not a backend or an application entrypoint.
The editor backend owns media/export services. Start the normal editor stack
with an independent database/workspace before running browser smoke checks.
Historical checks may require their documented sample assets; do not run them
against a user's working document.

Use `npm run test:film` in `notale-editor` for the self-contained backend checks.
See the editor's `docs/FILM-BACKEND.md` for configuration and migration.
