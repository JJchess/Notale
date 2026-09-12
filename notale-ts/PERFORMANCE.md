# Representative cold start

Measured 2026-09-12 with headless Chromium on the same machine and a local Python static server. Each implementation used a new browser instance.

| Runtime | Ready to run | NumPy requested | Result |
|---|---:|---:|---|
| Python `notale-v2` code workbench (`page-10`) | 2.760 s | yes, unconditionally | ready |
| TypeScript workbench, standard library lesson | 2.205 s | no | `10` |
| TypeScript workbench, declared `numpy` lesson | 2.482 s | yes | `6` |

The standard-library case was about 20% faster in this representative run and transferred no NumPy wheel. This is a single local comparison, not a cross-device benchmark. Its purpose is to verify the loading decision and request behavior.
