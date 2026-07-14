# BACKLOG — 待外部条件解锁的执行清单（iter80 汇整）

> iter55–79 期间散在 ITERATIONS.md 的"待额度/待拍板/已否决"记档收敛于此。
> 当前健康基线（2026-07-14，iter80 实测）：render 27/27 全绿（26 语料 + examples 夹具）；
> 多元度：非 flow 内容页 9/94（10%）、版式 3/4 种、全 flow deck 20/26、fourier 6 连同版式；
> 校验：3 errors（simple-harmonic ×1 / simple-pendulum ×2，已知二阶坏 sim）+ 5 warnings（widget 缺动效）。

## A · 额度恢复后（真机 LLM 生成，按序执行）

1. **采用率大验证**（FE-59：断言绿≠被用）——多主题多题材各真跑 1 份：
   ```
   npm run generate -- "<题材A·分步机制类>" --pages 10 --no-clarify
   npm run generate -- "<题材B·人文思辨类>" --pages 10 --no-clarify
   npm run generate -- "<题材C·公式推导类>" --pages 10 --no-clarify
   ```
   查采用率：compose/sidenote（iter59 确定性分配）、grid（iter77 契约）、pullquote/section/slate（57/58/61）、内容预算（iter66 稀疏/超载页应减少）。
2. **多元度前后对比**：`npm run diversity`——非 flow 占比应 >10%、版式种类应 4/4、全 flow deck 占比应下降；结果记 ITERATIONS。
3. **坏 sim 自愈闭环**（iter69 闸门）：重生成 simple-harmonic-motion / simple-pendulum 题材 → validate 的 consts err 应触发 docRepair 改用 custom 引擎 → `npm run diversity` 校验健康应 3→0 errors。
4. **widget 动效 warn 清偿**：重生成 bubble-sort/dna/entropy/fourier/matrix 五份（5 warnings 应减少）；顺带 fourier 6 连同版式应被节拍/版式分配打散。
5. **create-video 整链**（iter76 技能）：让 agent 按 SKILL.md 写一份新 composition → `npm run render-video` → 嵌 video 块 → render-check；验证帧锁定纪律被遵守（两次捕获字节一致）。

## B · 待用户拍板

- **视频 2b 旁白**：Piper-WASM 离线 TTS（~75MB 模型 vendor）+ 词级时间戳回填时间轴 + WebVTT 字幕 + AudioEncoder 双轨 mux（方案已研究定稿，见计划文件/ITERATIONS iter74）。**体积代价需拍板**。
- **block 三层定义收敛**（schema shape / validate / renderer 单一注册）：架构级重构，需先 /plan（iter72/73 已记边界；枚举清单层已由 enums.mjs 解决）。
- **技能镜像改构建期生成**（现整份拷贝 + Check ⑥ 守新鲜，自包含的刻意代价）：可选优化，非债务。

## C · 已否决（记档防再议，见对应 ITERATIONS）

- **T14 callout 左竖条+淡底卡片**（iter60）：与去 AI 味红旗（圆角卡片+单边彩条）冲突，现有发丝线 callout 更克制。[[FE-61]]
- **T16 section 描边巨号叠标题**（iter77）：现状已克制得体，改造属审美赌博。
- **T22 timeline 少事件转横排**（iter63）：竖排适配我们的散文事件，不硬套。
- **quote 独立块**（iter80）：pullquote(+cite) 与 statement(+cite) 已覆盖"引文+署名"表达，第三个近重复块属做厚失衡。
- **video 进 fan-out 菜单**（iter76）：LLM 直填 src=编造不存在文件（mock 红线）；须先捕获出文件。
- **examples 并入 diversity 统计**（iter79）：多元度量生成端行为，手写夹具混入污染指标。

## D · 已知取舍（非债务，勿"修复"）

- `--serif/sans/mono/bg2/text2` token 原名 grandfather（被渲染器 getComputedStyle + 内容 JSON var() 引用，改名破坏语料）——NAMING §4。
- `searchCompare` camelCase grandfather——NAMING §5b / check-consistency D1_GRANDFATHER。
- mediabunny MPL-2.0（文件级弱 copyleft，作依赖直接用无碍）。
- 极长代码行(75+字)在极窄栏 fitCode 到 0.6 下限仍可能裁尾——内容规划问题，生成侧规避（iter64）。
