# Public source boundary

The proposed public source contains the five projects `notale-format/`, `notale-editor/`, `notale-editor-frontend/`, `notale-ts/`, and `notale-viewer/`, plus the root README files, changelog, license, CI workflow, and .gitignore. Private prototypes, old viewers and tools, local state, and historical migration records are outside this boundary.

From the repository root, run `node notale-editor-frontend/scripts/prepare-public-source.mjs` to make a hash-verified private review copy. This is the sole public-source staging command. The command prints the separate review report path; inspect that report, the selected editor contract archive, third-party resource notices, and all findings. The report stays outside the staged source tree. The script does not commit, push, or publish.

The working repository already tracks files outside the public boundary. Publishing its existing Git history would disclose them even if the current tree excludes them. Create a new public repository from the reviewed staged tree with a clean initial history; verify the actual new tree and remote before publication. Keep all `.env.local` files outside the review copy and Git.
