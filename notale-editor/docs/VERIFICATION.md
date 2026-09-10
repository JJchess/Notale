# Verification cadence

Develop a complete feature module before starting its browser/portable-package acceptance. Small implementation fixes belong in that module; do not treat every command, inspector control or edge case as a separate release. The user explicitly requests larger increments and less time spent repeatedly testing unchanged behavior.

## During development

Run `npm run verify:quick` at useful implementation checkpoints. It executes strict TypeScript checking and the backend/domain suite concurrently. The current measured run took about 4.6 seconds, including 124 backend/domain tests in about 2 seconds. Prefer semantic domain/API tests for command invariants, atomic failure, reference validation and data-model behavior. Do not duplicate the same invariant in many expensive browser workflows.

## At a module boundary

Build once with `npm run build:ensure`, then start/restart the editor against that build. The build command does not restart a running server. Do not rebuild or change the candidate while browser acceptance is running.

Run the relevant existing browser workflows with `npm run test:browser -- --grep 'pattern'`. Combine related acceptance into coherent real-user flows: edit, save/recover, reopen and play. Use the complete real lecture bundle when source dependencies, native scripts or portability are the subject; a small purpose-built page is enough for an isolated layout/input interaction.

`npm run test:smoke` is a small integration check for native Canvas editing, native steps/SVG, lost-response recovery and presentation/speaker navigation. The measured four-case run took 9.1 seconds with two actual workers. It is not a substitute for the feature's acceptance tests or full regression. The browser configuration now defaults to two actual workers and fully parallel independent test documents; `BROWSER_WORKERS` overrides this.

Run `npm run test:package` when exported APIs, dependencies, declaration output or host integration change. It still installs an independent packed consumer and checks real HTTP behavior. It reuses compiled output only when hashes of source/configuration/lockfile, Node version and every compiled output file match the successful build manifest. A missing/stale manifest rebuilds. Test-fixture-only changes can exercise the unchanged installed package without repacking it, as long as the consumer fixture is recopied and recompiled and this reuse is recorded.

The three browser bundles build concurrently. These caches reuse compilation, never test results: a cache hit does not claim that current tests have passed.

## Before delivery or broad shared-code changes

Run the full browser suite once against an immutable candidate. Use it after a substantial batch affecting multiple editor subsystems or before final delivery, not after every small fix. If it finds failures, fix them and rerun the affected workflows and shared behavior. Do not repeat unrelated passing cases without a new reason. Run the full independent export/import/native playback and host-package checks at this gate.

Concurrent save, rollback, exact mutation replay, original-source protection and native interactive playback remain required evidence. Retain failure screenshots/traces and report failures honestly. Distinguish a single full passing run from combined full-baseline plus targeted-fix evidence.

Refresh the original fixture snapshot/health audit at the end of a substantial module. Keep the overall product goal active until its requirement-to-evidence completion audit is satisfied; faster testing does not narrow the goal.

## Focused failure diagnosis

Give element waits in new workflows a bounded timeout (the Canvas-region scenario uses 10 seconds per action and 60 seconds overall). After readiness, a missing target should fail promptly instead of consuming the entire workflow timeout. Keep portable ZIP and reference bitmap artifacts when investigating export differences. Use a small standalone rendering probe on that immutable ZIP to isolate encoding/font/geometry issues, then rerun the full affected workflow after the fix. Compare bitmap hashes for concise failure output while retaining exact-pixel checks and artifacts. Defer final package acceptance until browser behavior is stable when iterative renderer fixes would otherwise cause repeated packaging.
