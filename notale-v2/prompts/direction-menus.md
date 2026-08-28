# 两张选项菜单表（下线中，用 `--direction-menus` 接回）

这两张表 2026-08-28 从 `direction.md` 拿出来，**内容一个字没改**。它们不是被否决的，
是「未判定」：上一轮试过删掉它们（`direction_block` 可到 7,728），但那一臂因为两个
planner 进程并发写同一个 run 目录而作废，白得的那组同条件重复采样反而证明
`check_palette` 的判据在 n=1 下读不出效应（家族在「暗底科技」和「其他」之间跳，
语义色明度极差在 5pp 和 57pp 之间跳）。见 `runs/direction-trim-experiment.json`。

所以现在的安排是：默认不注入，`--direction-menus` 接回，让「留还是删」变成一次
flag 对照而不是 git revert。实验出结论之后，这个文件和那个开关一起消失 ——
留就并回 `direction.md`，删就按 `attic/plan-typography/README.md` 的先例挪进 `attic/`。

它们是**菜单**：一轮讲义只会用上其中一行（神经网络那轮命中的是
`Physics and engineering` 和 `Technical frame`），其余行是为了让模型有得选而付的钱。

## Direction families

| Lesson world | Material and geometry | Useful signature | Keep quiet | Common failure |
|---|---|---|---|---|
| Biology and ecology | specimen paper, membrane layers, branching paths, field labels | one organism/system whose parts reveal or react | surrounding controls and metadata | decorating everything with leaves or green gradients |
| Chemistry and materials | bench glass, calibrated vessels, molecular bonds, phase boundaries | one transformation chamber with observable before/after states | containers not involved in the reaction | neon “lab” styling with no measured relationship |
| Physics and engineering | instrument panels, ruled axes, cutaway parts, force paths | one manipulable apparatus or annotated mechanism | panels that do not report a value | adding sci-fi grids and gauges unrelated to the model |
| Earth and climate | strata, contour lines, transects, time bands, sampled maps | one spatial cross-section tied to measured change | legends and source notes | using a cinematic planet as background when scale is the lesson |
| Astronomy | observation field, orbital geometry, spectral bands, calibrated darkness | one scale or motion contrast the learner can manipulate | chrome, glass, and glow | filling empty space with stars until labels disappear |
| History and humanities | archival paper, marginalia, timelines, maps, material artifacts | one primary source placed against a visible claim/evidence structure | transcription and citations | sepia decoration without evidentiary structure |
| Society and statistics | civic documents, ledgers, connected cases, measured distributions | one population pattern that changes with assumptions | explanatory prose | dashboard chrome that makes mock values look authoritative |

## Selection table

| Treatment | Use when | Preserve from the old recipe | Reject when |
|---|---|---|---|
| Flat field and rules | hierarchy and diagrams already provide enough form | exact line weights, semantic contrast, quiet negative space | extra depth would not encode anything |
| Instrument glass | a panel overlays moving media or behaves like a lens/readout | translucent fill, inner highlight, solid fallback, readable text | every content group becomes a frosted card |
| Tactile surface | the learner presses, turns, or seats a physical control | one light direction, raised/pressed state reversal, short feedback | static text panels imitate plastic hardware |
| Technical frame | measurement, teardown, or system structure is central | thin routed lines, real annotations, sparse metrics, consistent corner logic | sci-fi framing is unrelated to the content |
| Container guides | alignment or measured space is part of the visual language | guides on true content edges, tiny marks at real intersections | lines are sprinkled inside every component |
| Chamfered edge | an engineered artifact justifies machined geometry | one cut scale, matching border/background/hit area, visible focus | rounded and cut shapes mix without a rule |
| Directional border | one selected surface needs a light-catching edge | one-pixel gradient, inherited geometry, low opacity | rainbow rims or every panel receives emphasis |
| Dithered field | sampling, quantization, pixels, or coarse measurement supports the topic | visible cells, broad deterministic masses, dark receding edges | it is generic grain or animated television noise |
| Perspective grid | depth, coordinates, or scale is being discussed | thin fading lines, calm camera, sparse haze | retro-futurist scenery competes with labels |
| Atmospheric folds | light, fluids, fields, or a literal medium benefits from slow spatial depth | one off-axis glow, layered folds, restrained drift | a flat colored glow is being used as filler |
| Ambient particles | the region represents a medium, population, flow, or settling process | bounded layer, deterministic state, quiet text zone, lifecycle cleanup | it becomes a page-wide screensaver |
