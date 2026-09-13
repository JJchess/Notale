# Source release preparation

Run `npm run release:inventory` from `notale-editor-frontend/`. This read-only command inventories both sibling editor directories into `.local/release-inventory.json`, recording each proposed source file's size and SHA-256, excluded paths with reasons, and findings by file/line/type. It never stages, deletes, commits, pushes or prints matched credential values.

The proposed scope includes editor source, frontend app, scripts, tests, documentation, build configuration, original templates and the exact internal contract archive selected by package.json. Other monorepo projects are outside this editor release proposal. Existing worktrees and user documents remain untouched.

Generated output, dependencies, local state, environment files, credential/database file extensions, reference-derived `templates/refined/`, and unselected contract archives are excluded. Symlinks and unusual file types require review. Historical documents and old preparation scripts may remain in the proposed list and produce findings; they are not automatically approved by inclusion.

This is a preparation report, **not a release clearance**. Pattern checks cover selected credential formats and portability hazards; they cannot prove the absence of all sensitive information. Before publication:

- Resolve or explicitly review every finding and inspect the actual final staged tree.
- Inspect binary/archive contents separately, including the selected internal contract.
- Review third-party licenses and asset provenance independently.
- Inspect the chosen Git history and remote publication scope; excluding a file from this list does not remove it from history.
- Re-run the inventory after source changes and verify the actual published artifact against the final hashes.

Browser tools use Playwright's managed browser unless CHROMIUM_PATH is set. Original templates are regenerated with `npm run templates:prepare`; the diagram alias regenerates the matching full-page and standalone catalogs together. A lecture audit requires an explicit EDITOR_AUDIT_DOCUMENT so it cannot silently target a developer's document.

## Private review copy

`npm run release:stage` first regenerates the inventory, then creates a new `notale-source-review-*` directory in the OS temporary directory. It rejects duplicate/traversal paths and symlinks along each source path, verifies source bytes against the inventory, preserves executable flags, and verifies copied bytes. `.local/source-release-stage.json` records the exact directory and inventory. It does not overwrite a previous review copy or touch Git.

Unresolved findings are retained in the report; the resulting directory is for private review, not automatic publication. An interrupted or failed run may leave a partial temporary copy, which must not be used as a release. The completion report is written only after every file passes. Later source edits require a fresh inventory/copy.

The source proposal now excludes the legacy template README and its six reconstruction tools as well as refined assets; only the original generator is needed by the public template commands. Historical worklogs retain their content with personal machine paths normalized to workspace/home placeholders. A zero-finding pattern report covers these configured checks only and does not imply full credential, asset-rights or Git-history clearance.

The private review copy also receives a root README and MIT LICENSE copied from already hash-verified frontend release documentation and license sources. These two derived root artifacts have separate path/source/hash records in source-release-stage.json. The main monorepo root README and its licensing are not rewritten by this operation.
