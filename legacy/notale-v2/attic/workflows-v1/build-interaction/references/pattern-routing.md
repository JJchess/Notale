<!-- 这一份是 build-interaction 的 路由表。总是读,用它选出一份 pattern-*.md。 -->
<!-- 切自单份 interactive-widget.md(93,524 B,曾占建页输入 35.7%);正文原样搬运,未改写。 -->

## 3. Choose an interaction direction

Before coding, choose one **interaction direction**. This is not an aesthetic theme. It is the dominant relationship between action and evidence. Commit to its spatial grammar, state transitions, and concept signature.

### Direction selection test

Choose the direction whose verb matches the claim:

| Claim depends on… | Prefer |
|---|---|
| tuning a quantity | Instrument |
| moving meaningful geometry | Manipulator |
| satisfying constraints | Constructor |
| preserving identity across representations | Transformation |
| following dependency or propagation | Tracer |
| isolating one variable across runs | Synchronized comparison |
| exposing a local operation | Inspector |
| discovering a limitation | Counterexample |
| observing an evolving mechanism | Live system |
| committing before evidence | Prediction and reveal |

Hybridize only when one direction remains dominant. An inspector may include an instrument for probe size; a live system may include synchronized comparison; a counterexample may transform into a new representation. Do not give both directions equal chrome or separate start points.

## 6. Interaction pattern library

Choose the smallest pattern that proves the claim. The following are reusable component blueprints, not topical templates.


## 模式在哪一份文件

- `pattern-tune.md` — Tune and transform — set a value, watch it propagate
    - Direction A — Instrument（6.1）
    - Direction D — Transformation（6.4）
- `pattern-build.md` — Manipulate and build — move or assemble things in space
    - Direction B — Manipulator（6.2）
    - Direction C — Constructor（6.3）
- `pattern-observe.md` — Observe and trace — follow what a system is doing
    - Direction E — Tracer（6.5）
    - Direction G — Inspector（6.7）
    - Direction I — Live system（6.9）
- `pattern-judge.md` — Compare and commit — weigh alternatives or predict, then see
    - Direction F — Synchronized comparison（6.6）
    - Direction H — Counterexample（6.8）
    - Direction J — Prediction and reveal（6.10）

只读选中的那一份。不要读未选的 pattern 文件。
