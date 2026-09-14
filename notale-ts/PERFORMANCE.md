# Current publication and preview measurements

Measured on 2026-09-14 using existing complete lectures; no model calls. These are representative local samples, not cross-device guarantees or a comparison of Python versus TypeScript generation speed.

| Measurement | Result | Conditions |
|---|---:|---|
| First page usable | 815 ms | Chromium, 20 Mbps / 40 ms latency, through Viewer on port 4177 |
| Adjacent page transition | 8 ms | Same setup, after one second of dwell for prewarming |
| Initial assembly and publication | 4.48 s | Seven pages, reusable deployment assets prepared |
| Cached publication | 0.51–1.38 s | Three complete lectures with 7 / 7 / 8 pages |
| First font-library preparation | 133 s | Deployment-time preparation; not repeated per lecture |

The player is built with Vite, fonts use course-specific WOFF2 subsets plus complete fallback coverage, and published resources use HTTP compression and caching. Code visualization readiness is separate from editor and Python runtime readiness: the first-page timing does not measure readiness to execute Python.

Portable delivery was checked by importing a complete seven-page ZIP into the editor (HTTP 201) and running the relocated code page's three embedded assertions. See [README.md](README.md) for the build/cache workflow and [COMPATIBILITY.md](COMPATIBILITY.md) for behavioral boundaries.

The superseded 2026-09-12 simplified-workbench comparison is archived locally at `../legacy/notale-ts-simplified/PERFORMANCE-20260912.md` (legacy is ignored by Git). It remains available in this file's history at commit `9aba1d7b`.
