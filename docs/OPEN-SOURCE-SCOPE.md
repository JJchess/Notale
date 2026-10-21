# Public source and contribution boundary

This repository contains the five standalone projects `notale-format/`, `notale-editor/`, `notale-editor-frontend/`, `notale-ts/`, and `notale-viewer/`, with their documentation, resources, dependency notices and CI. Copy `.env.example` to `.env.local` for local model configuration; real credentials and generated user content stay outside Git.

## Repositories and review

The canonical open-source repository is [THU-AICosmos/Notale](https://github.com/THU-AICosmos/Notale). [JJchess/Notale](https://github.com/JJchess/Notale) is its synchronized mirror. Send contributions to the canonical repository; synchronize approved commits and immutable tags to the mirror without divergent edits. Repository visibility changes require explicit maintainer authorization; commits, synchronization and successful CI do not authorize them.

Develop common changes in a core clone, or extract reviewed file deltas from a private development snapshot into this independent core history. Review new files and target-side differences; never copy the entire private workspace or merge its history. Review the staged diff, then run `python3 scripts/check-public-source.py` before committing. CI checks the committed tree in both repositories, including paths and bundled editor archive contents. The scanner is an additional check; review new files and credentials that pattern matching cannot identify.

Private downstream deployments consume reviewed core commits. A reusable fix discovered downstream must be implemented as a focused common change, reviewed here, then incorporated downstream. Never merge a private deployment branch or copy its whole source tree into this repository. The former mixed-workspace public export command has been retired.

## Local safeguards and credentials

Run `python3 scripts/setup-repository.py` after cloning to install the local push guard. It permits only the canonical repository and mirror, and scans every commit reachable from each pushed ref, including merge ancestry. It does not configure remotes, choose credentials, push, or change GitHub visibility. Keep the canonical repository as `origin`; a mirror remote can receive the same reviewed commits.

For automation, use each repository's read-only `GITHUB_TOKEN` for CI and credentials scoped only to the required repositories for writes. Public HTTPS clones and fetches do not require authentication; writes still require authorization. Local downstream clones can also fetch an already verified commit from an independent core clone. Local push hooks are convenience safeguards and can be bypassed; they do not replace credential scope or review. Keep version tags immutable.
