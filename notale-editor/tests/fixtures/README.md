# Browser fixtures

`clip.webm` is a synthetic 3-second 96×64 VP9 test pattern generated locally:

```sh
ffmpeg -f lavfi -i testsrc=size=96x64:rate=15 -t 3 -c:v libvpx-vp9 -pix_fmt yuv420p -an clip.webm
```

Browser tests generate their red/blue PNGs and PCM WAV tone in memory. No external media or generated lecture pipeline is needed. The real 32-page lecture fixture still supplies the editing/playback context.

`package-consumer.ts.txt` is copied into a separate temporary TypeScript project by `npm run test:package`. Keeping it as a fixture prevents the source build from resolving the package against its own stale build output.

The following HTML files are byte-identical source copies from the final lecture under `notale-v2/runs/ens-trim-full-0907/pages`. Domain tests read these local copies, so they do not depend on the sibling generation workspace. They contain source references to assets, not a complete standalone runtime bundle; browser acceptance uses the imported 32-page lecture and its immutable assets. Package-consumer fixtures strip unrelated links and use source-only runtime stubs where documented.

| Fixture | Original page | HTML SHA-256 |
| --- | --- | --- |
| `scene-correlation.html` | 07 | `40963775f7ddbb1c215896ab5cb024db94f6c03a14a0dbddb453f281f93cff9d` |
| `scene-bootstrap.html` | 12 | `5503b6acebf9db1b2620a83af12a651017404f0b93256dac0ee05cdb3538680e` |
| `scene-methods.html` | 31 | `5f44a0c4a0e46c6d575dbf4f7c14ad6ec591762f1ccff1294e3ce7e401f8ff82` |
| `chart-variance.html` | 11 | `c2cb50d258040bda3ecbf56575fc0eb7bf8ad95ab7d153c19cdf7fed33869d64` |
| `chart-callbacks.html` | 17 | `9f57ce94a9a21043be558da1a51421782d75913292d9a1f24d3ff28a6dfd0e96` |
| `chart-learning-rate.html` | 24 | `08780cab752b261ff10d7744d5049e001400af0aa7eb0f8dd371ca416c91c701` |

These whole-file hashes differ from the reviewed inline-script fingerprints used by chart factories and Canvas checkpoint adapters. Changes to source scripts require review of their data, callbacks and DOM ownership before extending those adapters.
