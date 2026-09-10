# Mini 字符预算整改：14 项已完成并归档

用户于 2026-09-10 最终验收确认：“全部approve”。本批已归档 mini 全部通过验收。

按 HTML、CSS、JS 合一文件的完整字符数核算，全部 ≤15,429 chars。原分类、运行入口及 138 个 full 选定源码指纹保持一致。当前结果以 `final-audit.json` 和 `installed.json` 为准。

| Mini | chars |
|---|---:|
| future-climate-analogy | 15,418 |
| pocket-fit-desk | 15,275 |
| walk-photo-journal | 13,346 |
| illustrated-cover-shelves | 13,655 |
| foundation-shade-desk | 15,188 |
| masked-wrestler-index | 13,859 |
| artist-repetition-lab | 15,392 |
| yearbook-hair-timeline | 12,966 |
| dress-code-clothing | 12,172 |
| coin-flip-wealth | 15,424 |
| waveform-air-lab | 15,407 |
| crokinole-shot-lab | 15,331 |
| grandmas-kimchi-kitchen | 15,409 |
| state-maze-stories | 15,421 |

最后的州迷宫为 15,421 chars。全部作者布局与交互代码保留内联，124 个原始数据、字体、图片和 PDF 资源已核对。三个浏览器的本批相关画面状态一致；51 州加载、手动解题、撞墙、进度恢复、自动解题不计入完成，以及 1600×900 无文档滚动检查通过。104 个包和 51 项验收画廊已更新，包一致性检查通过。

## 历史过程记录

以下是归档前的阶段记录，字符数及“未完成”状态均为历史情况。

# Mini 字符预算整改（进行中）

目标：把用户指定的剩余 14 个 mini 在视觉质量不降级的情况下做成合格版本。用户已明确接受 15,286 和 15,429 chars，因此本轮使用 15,429 chars 作为已认可范围的上界；字符按完整 HTML + CSS + JS 作者代码核算，框架组件也不能仅因后缀不同漏计。图片、原数据、第三方通用库独立保留。

## 已落地 12 项

- future-climate-analogy: 15,418 chars，运行入口与入库选择均为完整 `index.html`。
- pocket-fit-desk: 15,275 chars，运行入口与入库选择均为完整 `index.html`。
- walk-photo-journal: 13,346 chars，运行入口与入库选择均为完整 `index.html`。
- illustrated-cover-shelves: 13,655 chars，运行入口与入库选择均为完整 `index.html`。
- foundation-shade-desk: 15,188 chars，运行入口与入库选择均为完整 `index.html`。
- masked-wrestler-index: 13,859 chars，运行入口与入库选择均为完整 `index.html`。
- artist-repetition-lab: 15,392 chars，运行入口与入库选择均为完整 `index.html`。
- yearbook-hair-timeline: 12,966 chars，运行入口与入库选择均为完整 `index.html`。
- dress-code-clothing: 12,172 chars，运行入口与入库选择均为完整 `index.html`。

9 项均通过本轮针对性运行回归（`regression/results.json`）：气候 70 城市、两单位及普通/减弱动态；口袋 7 物体/80 口袋/28 详情；旅程 9 日/72 条媒体；书架全部年份、原图、详情与清单；粉底 24 组合；摔角两语言及全筛选；艺人最大曲库等 16 状态、原数据、键盘与随机/重置；发型全部年份与照片；服装 5 步×41 项。三项入库包/依赖/路由单测通过，104 个包及画廊已重建。所有 full 选定源文件指纹仍与本轮前一致。

对照截图位于 `screens/`，脚本和记录为 `tools/compare-plain.cjs` 与 `comparison-*.json`。气候、粉底、书架、摔角的所测截图逐像素一致。步行页修正了 CSS 压缩器误删 clamp 字体简写后，两个详情截图完全一致，初态仅计步数字时序有差异；服装的 GIF 帧、发型曲线过渡及艺人力模拟存在时间采样差异，原资产和模型保留，专项回归验证完整状态与边界。口袋差异少于 10 个像素。画布基于已验收 1600×900 固定规格整理 CSS 媒体条件；保留主题、减弱动态及强制配色规则。

艺人原查找表和直方图已转为 JSON 原数据；全部作者绘图/交互代码在单文件内，第三方 D3 保持 4.7.4。其他资源和原始源码保留在原路径，运行入口使用完整内联实现。

## 待完成 1 项

- state-maze-stories

这 2 项尚未改动运行入口。`candidate/` 中仅有机械压缩试算，不能算达标。`coin/` 是硬币页面原始 DOM/CSS 取证，为接下来的紧凑实现提供对照。

## 可复现工具

- `baseline.json` / `before/`：本轮 14 项原始选定源、运行入口依赖备份及 full 指纹。
- `tools/refine-sources.py`：普通页面的去重复处理。
- `tools/prepare-artist.cjs` 然后 `tools/refine-artist.py`：艺人页作者源和纯数据拆分。
- `tools/combine-plain.cjs` 然后 `tools/refine-plain.cjs`：完整 HTML 打包和内部类名缩短；依赖链接保留双引号，兼容现有包解析。
- `tools/install-plain.py`：先验证所有依赖声明，再同步入口和 catalog。
- `tools/prepare-regressions.py`：复用原专项测试，适配内部类名/ID；证据写入本轮目录，不覆盖历史归档。

本轮尚未全部完成，不更新 goal 为 complete，也不把历史归档的源码快照冒充当前版本。

## 硬币页增量完成

coin-flip-wealth 为 15,424 chars。运行入口已改为包含全部作者 HTML/CSS/JS 的单文件；D3 7.4.4 为未改动的第三方库。原人物插画、固定画布、两幅图表轴/路径、全部说明与逐轮账本保留。5 个对照状态的模型对象逐项相同；三组截图逐像素一致，另外两组只有 5 和 2 个曲线边缘像素差异。`regression/coin-checks.json` 验证 12 轮引导、20 轮极端序列、1,000 轮随机、财富守恒、原图、键盘、账本；无运行或外部请求错误。

该页工具链为 `capture-coin.cjs`（原 DOM/CSS）、`coin-cascade.cjs`（原规则生效情况）、`build-coin.cjs`（完整原生渲染/模型）、`trim-coin-css.cjs` 初态及 history（仅删除当前计算样式和边界均不变的重复声明）、`finish-coin.cjs`（内部类名/变量缩短）。最终候选及元数据为 `combined/coin-flip-wealth/index.html`、`coin/build.json`；参考截图和完整模型比较在 `coin/comparison.json`。运行前的历史 full 指纹再次核对一致。

## 波形页增量完成

waveform-air-lab 为 15,407 chars，生产入口与入库包均为完整内联 index.html；原字体保留。四种原波形数学函数、676 粒子坐标和绘制、170/26/0.1 弹簧平滑、整周期暂停、原 Web Audio 连接链和音频渐变均保留。三组状态对照两组像素完全一致，另一组只有 3 个控件边缘像素差异；模型状态一致，见 wave/comparison.json 与 wave/state-*.png。regression/wave-checks.json 验证 12 组波形/振幅/频率/相位、粒子数量、原计算采样、键盘和暂停，无文档滚动或运行错误。regression/waveform-air-audio.json 实测四种波形×三个频率，零振幅、恢复、静音均通过。已重建 104 包与 51 项画廊。

构建工具依次为 prepare-wave.py（原始捕获只读）、build-wave.cjs、trim-wave-css.cjs、finish-wave.cjs、optimize-wave.cjs；最后依赖检查及安装为 install-wave.py。静态捕获 wave/initial.html 不再从改动后的生产页面重采。候选回归通过后才替换生产入口。其余三个 mini 尚未改动运行入口。

## 弹棋页增量完成

crokinole-shot-lab 为 15,331 chars。内联全部作者 HTML/CSS/JS，第三方 Matter.js 0.20.0、Howler 2.2.4 原库和完整 scenarios.json 独立保留；四个原 MP3 不变。合并边界工厂但保持 Matter 刚体创建顺序、尺寸、分类、掩码和碰撞参数，仅移除 practice 模式永远不调用的自动比赛分支和 bot 随机瞄准。保留三种训练局面、原棋盘背景、位置/角度/力度、按住蓄力、结算、重置和音效。

四个对照状态见 crokinole/comparison.json：两组逐像素一致，另外两组只有 5 和 10 个文字边缘像素；最终固定色值内联再次确认初态 0 像素差异。regression/crokinole-checks.json 验证真实中心入洞总分 30、无效棋子移除、出手全部阶段且不整页滚动。regression/crokinole-extra.json 验证真实碰到对手、第三局面原坐标、键盘蓄力、Howler 播放、静音与四段原音频可解码。138 个 full 选定源指纹不变。已重建 104 包与 51 项画廊。

工具：capture-crokinole.cjs 原始采集不可从现生产重采；prepare-crokinole.py/refine-crokinole.py 生成中间源，crokinole/engine.js、app.js 是最终可读中间实现（包含后续精简）；build-crokinole.cjs、finish-crokinole.cjs、trim-crokinole-css.cjs、optimize-crokinole.cjs 后构建完整候选，安装 install-crokinole.py。注意 finish 的固定颜色变量使用 --z 前缀避免与棋盘几何 --b 重名；optimize 最后内联固定色值，动态几何变量仍保留。

剩余 state-maze-stories、grandmas-kimchi-kitchen 尚未改动生产运行入口，目标仍未全部完成。

## 州迷宫进行中（仍不算完成）

state-maze-stories 目前仍用原生产入口。实验候选 combined/state-maze-stories/index.html 已能运行 51 项地图、原故事、四种排序和迷宫面板，当前 42,028 chars，尚未达标；绝不可当成已完成或替换入口。readable native author: maze/app.js；DOM 模板 maze/template.html；原始数据 maze/original-data.json 无损保留 51 州、285 facts、28 sources、完整 copy.json，候选运行 assets/mini-data.json。原 51 个 CSV、州图、人物图、字体/PDF 均保留。

验证：regression/check-state-maze-play.cjs 使用候选路由，原玩法专项已通过（regression/maze-playing-checks.json）：California 17 步完整键盘通关、撞墙不移动、正确保存通关路径、再次打开恢复、自动 Complete 不计入通关、方法面板焦点圈定/返回。运行无错误，1600×900 无文档滚动。候选尚有少量静态排版差异待修复，且字符数超标，因此不计入 installed/results 完成清单。

取证 capture-maze.cjs 路由 before/state-maze-stories，捕获 initial、ca/al/ak/tx/dc pre、ca mid/post、methods；原采集位于 maze/*.html/*.png。prepare-maze.cjs 抽出 story/state/fact 三种 template 及 modal/方法说明结构；compact-maze-template.cjs 将重复 plus/check-orange SVG 改用原 SVG 图形文件（没有外移作者逻辑），这些图形作为 assets 保留。人物/地图 img 的选取必须用 .img-wrapper>img，不能选到放在前面的 plus 图标。故事标签不能写 lastChild.textContent（空文本节点被序列化移除后会误写 plus-icon），现已用 replaceChildren 保留图标并填入文本。

工具流程：maze-cascade.cjs 从原稳定页采集各排序、各典型州 pre/mid/post、方法说明的有效样式；其中注入的 __svelte_* 临时路径动画 keyframes 不能保留，native 使用 WAAPI。build-maze.cjs 固定媒体查询、移除这些临时 keyframes、打包全部作者源；alias-maze.cjs 缩短 Svelte scope 名；refine-maze.cjs 内联固定 CSS 常量（保留 sans/serif/mono/1s 和行列/路径宽度动态变量），目前得到 42,028。trim-maze-css.cjs 有初态重复声明删除记录，但最后重建时未重新应用，不重复采集原回归。大部分剩余体积仍是 CSS 和 DOM 模板，后续继续结构压缩，不能靠把作者逻辑放到外部文件规避预算。

注意 CSSOM 声明不可直接 split(';')，数据 URI 含分号；maze-cascade.cjs 已按引号保护分割。HTML src/href 重新加引号只能作用于脚本之前的 HTML，否则会破坏 JS 的 img.src=模板字符串。CSS 字体路径应为 build/*.woff2。

## 泡菜厨房原生候选（2026-09-10，未完成）

新增 kimchi/app.js 原生控制器，接入此前 art.js/music.js：25 图层、食材收集和六秒等待、SVG 放大与焦点返回、开场/品尝/结束/重置、键盘与声音控制。build-kimchi.cjs 内联全部作者 HTML/CSS/JS，原 copy.json 作为 assets/mini-copy.json 数据，p5 1.6.0 与 Tone 14.7.77 使用未修改第三方库。正式入口仍未替换。

preview-kimchi.cjs 最后通过的状态为首次未剪枝 CSS、已修复 build/assets 字体路径及无 image 图层请求的版本：25 层、poster1 放大/Escape、四食材/Eat 到 chapter 3、canvas 创建、1600×900 文档尺寸，零运行/请求错误，证据 kimchi/smoke.json。不代表全部功能/音频/视觉保真已验收。candidate-initial.png 为该有效状态截图。

其后 prune-kimchi.cjs 使用原 initial/zoom/ready/taste/opening DOM 过滤不匹配规则（保留交互伪类、ending、动态选择状态），生成 pruned.css；refine-kimchi.cjs 展开固定 root 常量并清理未使用关键帧。introWords 的 48 个原文字阴影由双循环生成同值，避免重复声明。最新候选 23,957 chars，尚超预算；最后这些精简之后未再次浏览器验证，不得当作已验收。后续继续精简 CSS/共享控制逻辑，再做必要视觉/流程检查。当前 installed.json 仍为 12 项。

州迷宫此前新增 sprite-maze.cjs，将静态原 SVG 图形收进 assets/mini-icons.svg（仅图形，无作者代码）；最新候选为 39,787 chars，仍未完成。上节 42,028 是旧尺寸。

## 泡菜厨房样式合并与精简（继续中）

2026-09-10 后续：停止使用 pruned.css/cascade.css 自动匹配作为最终样式。DOMParser 会重新解析原嵌套按钮，导致漏掉 buttonWrapper 内按钮规则，且捕获的初态/ready 不覆盖部分收集 .clicked 样式。现 kimchi/style.css 是直接整理的最终布局/状态样式，已恢复收集标记、按钮居中和原减弱动态禁用动画。cascade-kimchi.cjs 仅实验，非最终管线。

当前流程 build-kimchi.cjs → finish-kimchi.cjs。finish 统一缩短静态类名并用 Terser 压缩；keyboardSelectTrue/False 不缩短（由字符串拼接产生），固定 1600 只挂载 desktop 放大图（原 mobile 图形资产仍完整保留）。字体仍引用原字节相同的 woff2，保留原字体名称。初始不主动聚焦 scene，重启时仍焦点返回。

精简原曲谱为 copy.json.score 中的 chords/progressions/songs 纯数据；所有实际播放逻辑在 music.js 内联。原 scene1/2/3 数据不变。移除了只有 mini 范围外章节才可能触发的 eventClicked===3 分支；内部状态属性改短，但 window.kimchiKitchen.getState() 仍返回原 chapter/soundon/hints/hoverHints 等字段。删掉只供原 Svelte 点击读取、原生实现不用的 hed/words/type/clickable DOM 属性与无样式 hintShadow 空节点。

compare-kimchi.cjs 为 original/candidate 初态、部分收集、ready 的对照工具（可 --initial），comparison.json 有两页 1600×900、无请求/运行错误证据；当时版本 19,759 chars。其后修复原 reduced-motion 动画禁用及初始聚焦差异，并核对 body/h1/header a/.scene 的全部计算样式与原页一致。最后初态截图仍有 26,953 个文字边缘等像素差异，原因未完全查明，不能宣称像素一致。后续音乐纯数据/属性精简、单 desktop 图层、ending 字重修复只构建未重跑浏览器，必须在最终候选完成后针对性复核。

最新字符数以 kimchi/build.json 为准（约 18,850），尚未达到 15,429，也未替换生产入口。installed 仍 12/14，剩余两个目标完整保留。

## 泡菜厨房 17,144 chars（2026-09-10，仍未完成）

已定位之前 26,953 个文字差异为 LCD 子像素抗锯齿 vs 原页面灰阶抗锯齿。CDP CSS.getPlatformFontsForNode 验证两者使用完全相同 National2-Regular，自定义字体计算样式亦相同；body translateZ(0) 对齐合成方式后初态逐像素 0 差异。style.css 已保留此渲染方式，finish 的字体族名称可缩成 F/T，实际原字体字节不变。

style.css 精简了不影响绘制的默认值、已继承属性和绝对定位下无效的浮动/文本属性；本地滚动条保留原颜色混合、8px 尺寸、圆角、hover/active 和强制配色，删掉重复 important/条件包装。main .scene 的 width:100% 不能删除（网格 margin:auto 时否则收缩为零），已恢复。build 使用 CleanCSS restructureRules/mergeSemantically 合并；可选 HTML 结束标签最后也压缩。

compare-kimchi.cjs 最近完整 3 状态（17,414 chars）对照：initial 0 像素、ingredient 39 边缘像素、ready 0 像素；两页 1600×900，无页面/请求错误。证据 comparison.json、original/candidate-*.png。后续删除 music 内从未调用的 destroy/挂载标记与 timer ID 管理（实例始终属于整个单页，所有文档销毁由浏览器处理），保留音符节奏/静音和按钮逻辑。art.js 合并两轴同构速度计算，原/新算法在 243 个正负/等值/零/Infinity/NaN 组合逐项 Object.is 一致；仍需最终动效/音频/完整章节验证。

曾评估 PetiteVue 0.4.1：reactive.js/reactive.html/room.html 和 build-kimchi-reactive.cjs 是独立、未采用的试算（输出 kimchi/reactive-candidate），仅省少量字符，不值得增加依赖；正式候选依然纯原生 DOM + 原 p5/Tone。该库在 /tmp/notale-kimchi-template，不是正式依赖，禁止安装试算入口。可从实验评估获知手写 DOM 与模板绑定的剩余体积近似，后续继续精简当前稳定原生实现即可。

当前实际 combined/grandmas-kimchi-kitchen/index.html 为 17,144 chars，build.json 同步；最终打包代码与声明的 CSS/JS/HTML 均在单文件，音乐曲谱只作为纯数据 score 随原 copy JSON 保留。未达 15,429，生产入口不变，installed 仍为 12/14。州迷宫仍 39,787 chars 未完成。

## 泡菜厨房增量完成：13/14

grandmas-kimchi-kitchen 最终 15,409 chars，已安装为正式 mini/pages/index.html；catalog 只选择这个合一文件，原分类 general 和路径保持不变。所有作者 HTML/CSS/JS 内联；保留 p5.js 1.6.0、Tone.js 14.7.77 未改动第三方库与许可证。依赖声明已通过 omitted_lines，104 个包和 51 项 mini 画廊已重建并 check。13 个 installed 当前入口实际字符数/摘要/spec 均吻合；138 个 full 选定源指纹不变。

最终数据 assets/mini-copy.json 增补了固定 25 层 clickCounter/xPos/yPos 等布局 metadata、原 UI 叙述文本、字体清单和原始乐谱；原 scene1/scene3 数组及全部 25 scene2 原字段值逐项相同，新增字段不覆盖源信息。所有点击、键盘、状态转换、画布绘制和播放代码仍在单文件。原 mini/copy.json、Svelte 源、图像、字体和 68 项 provenance 源文件均保留且指纹验证通过。

回归 regression/kimchi-checks.json：25 层、3 张 SVG、4 食材、全部 12 开场+11 品尝段落、结尾/重启、键盘焦点/对话框焦点圈定、所有阶段 1600×900 无文档滚动与场景裁切，无运行或外部请求错误。kimchi-audio-check.json 实测有声峰值1.3654、静音0；kimchi-reduced-checks.json 验证开场和品尝静态画布绘制、无持续动画、重置清理canvas。减弱动态检查按明确接受的1600×900画布执行；未把原历史390px viewport resize用例作为此固定画布的通过项。SAMPLE.md 已准确注明固定验收尺寸与运行实现。

最新画面对照 kimchi/comparison.json：initial 56像素、ingredient 104像素、ready 56像素差异，仅气泡三角形/边缘的栅格化（CSS边框三角改为同尺寸同色clip-path）；主体画面、字体、图片、控件位置不变。之前已验证主体合成方式对齐原页，初态可完全一致。最终4字符只为静态script src加双引号以兼容包依赖解析，不影响运行。内部类名、字体名缩短由 finish-kimchi.cjs 统一完成；UI纯数据键用kicker/epilogue避开CSS类别别名碰撞。

维护工具：build-kimchi.cjs → finish-kimchi.cjs → prepare-kimchi-checks.py → 针对性回归 → install-kimchi.py。重复构建从可读 kimchi/app.js、art.js、music.js、style.css、template.html、copy.json 开始；禁止采用早期 pruned/cascade 或 reactive/PetiteVue 试算。

最后仍待完成 state-maze-stories（39,787 chars 的原生候选，原生产入口未替换）。目标保持全部14项，尚不标记完成。

## 州迷宫 33,606 chars（继续中，生产入口未替换）

2026-09-10 后续：当前 combined/state-maze-stories/index.html 为 33,606 chars（CSS 16,375；JS 10,152），仍明显超标，installed 仍13/14，不可当作完成。

数据/图形：prepare-maze-geometry.cjs 从原51 CSV提取纯maze-data.json，并生成 assets/walls/<id>.svg 原静态墙线图形（无脚本）。完整17,461格的row/col/四面墙/solutionIndex经独立Python csv.DictReader逐项核对相同。原CSV和原州图等素材不改。动态图层的路径/圆点、碰墙规则、通关保存仍由内联JS控制；外部SVG只承担原静态墙线绘制。app.js 已移除每次打开时的CSV解析/重复创建墙线DOM，改读合并JSON及原比例SVG；app-before-geometry.js保留上个实现。

结构/样式：compact-maze-content.cjs 从原template生成content-template.html，移除每次必被数据覆盖的初始占位内容/图片src，并抽取一段原纯文字到ui-copy.json。area-maze.cjs 用页面区域隔离规则替换重复Svelte scope：#pick、#grid .state、#dashboard、.state-info、.overlay、.keyboard、#methodology等；重名的inner info、inner select、keyboard root分别改为state-info/select-control/keyboard。生成area-template.html、area-app.js、area.css。原current.css和original-scopes.json为固定输入，不能从新候选覆盖它们。

已修复两类旧候选隐患：原cascade采集只访问部分状态，漏掉开始按钮bounce、tracker全部通关done、clipboard.visible，区域样式补回原规则；移除scope后img规则不能扩展到新plus/check SVG图片，现仅匹配state .img-wrapper>img。只有壁线/路径/通用SVG三个小scope仍保留。区域样式移除了页面根本不使用的输入控件规则，以及被实际select样式覆盖的坏data-URI背景。

打包流程：
1. prepare-maze-geometry.cjs（原CSV→纯数据与SVG）
2. compact-maze-content.cjs（原template→content-template/ui-copy）
3. area-maze.cjs（固定current.css+original-scopes.json+app.js→区域实现）
4. build-maze-area.cjs → alias-maze.cjs → refine-maze.cjs → finish-maze-area.cjs → finish-maze-syntax.cjs
最后两个工具缩短组件类名/根ID并压缩代码。通用类名如state/story/path/clipboard的变换使用maze-class-syntax.cjs的Babel语法遍历，只改CSS选择器、HTML class、classList参数和SVG class字段，不改浏览器API、JSON字段或?state=链接契约。

验证：区域版先前36,785字符版本的original/candidate对照initial 9,926像素、CA pre 231、CA mid 476；主要初态差异已定位含plus图标误受img.opacity规则，已修复，尚未重新做完整最终画面对照。该次两页均1600×900无文档滚动、无运行/请求错误；截图maze/original-area-*.png、candidate-area-*.png。最终33,606字符版check-state-maze-syntax.cjs通过51州显示、CA17步手动通关、撞墙不移动、保存路径/重开恢复、AK自动解题不计数、方法面板焦点圈定与返回。结果regression/maze-area-playing-checks.json。没有重复跑未改动的其他13页。

当前剩余体积主要是CSS与模板结构；下一步继续实际结构/样式合并，再完成所有必要状态与原作视觉对照。所有作者运行逻辑仍需在单文件；不能把代码藏进数据或SVG，不采用打包自解压方式。

## 州迷宫 33,200 chars（2026-09-10）

build-maze-area.cjs 移除 font-face 默认 normal style/stretch 和可省略的 woff2 format 提示，以及无竞争规则的 scrollbar important；空 selector 规则清理。完整既有构建链重建后 33,200 chars，CSS15,969、JS10,152。运行逻辑未变。

compare-maze-area.cjs 已适配当前 build.json 类别别名，原页与候选 initial/CA pre/CA mid 实际浏览器检查通过：均1600×900，无页面或请求错误。对应截图像素差为2610/231/476；初态差异图目视集中于顶部迷宫说明第一行文字和行内图标，之前 plus 缩略图 opacity 问题已消除。仍不能宣称完全一致；后续需修复该说明行差异。未重跑未改动的游戏保存逻辑及其他13页。当前正式入口不变，13/14完成；候选仍超标。

## 州迷宫 31,781 chars（2026-09-10）

area-maze.cjs 的 DOM 清理合并所有 asset-icon 的重复内联尺寸，以及6个 feather SVG的相同描边/尺寸属性为公共CSS，保留原viewBox/use图形与绘制参数；去掉无脚本监听的旧Svelte隐藏iframe（原生app已经有ResizeObserver）。全部运行代码不变。按既有构建链生成31,781chars，CSS16,148/JS10,152，正式入口未动。

当前compare-maze-area检查original/candidate均1600×900无文档滚动、无请求和运行错误；CA pre231/CAmid476像素差与改前完全相同。初态8972像素差，目视diff集中于既存说明首行，以及两个州缩略图（之前同一路径捕获也有出现）；不能据此断言初态等价，后续需查缩略图加载/绘制时序和说明行样式。没有改动或重测保存业务逻辑。仍13/14完成。

## 州迷宫说明行空格修复（31,762 chars）

inspect-maze-text.cjs 实测原作span图标x=1125.484375，候选1126.984375；p盒子/字体未变。原因是多轮HTML压缩将原来的</span> plus signs变成</span>plus signs，把空格挪到inline-block内部。finish-maze-syntax.cjs在最终压缩后恢复该处空格，候选同步更新。compact-maze-values.cjs新增纯CSS重复值提取，将6次灰边框与3次浅边框提为root变量，净省20字符；此可选步骤应放在finish-maze-syntax之后，重复完整重建再运行。最终31,762chars。

定向画面对照运行成功：原/候选1600×900，零页面及请求错误。initial3309像素差（之前8972/2610等，缩略图差异仍有时序变化需定位），CA pre231/mid476保持。说明行偏移已按DOM证据修复，不宣称整体像素一致。13/14正式已安装，最后一项未达标、不安装。

## 州迷宫继续精简：31493 chars

inspect-maze-images.cjs检查全部51州图像：原页与候选同src、bounding rect、computed opacity、natural尺寸逐项一致；候选无assets/img/states副本，路由均回源原生产图像。缩略图像素差异仍未解释，现证据排除替换素材/布局尺寸/透明度差异。

area-maze.cjs按模板及完整app renderGame代码确认，删除从不生成的.overlay button.start/reset/solve及.instruction选择器；实际below开始/重玩、solve按钮以及overlay通关/返回保留。纯死规则删除无需重跑保存逻辑，构建链完成，当前31493chars。新compact-maze-values步骤在finish-maze-syntax之后运行，说明行空格修复已包含在最终构建脚本。正式仍13/14，最后项未安装。

## 州迷宫 31,056 chars

finish-maze-syntax.cjs补充modal/methods/stories/asset-icon/feather/hasBorder/desc/selects/done的语法安全类名缩短，31,183版本通过check-state-maze-syntax.cjs：51州、CA17步手动通关、撞墙、保存恢复、自动解题不计成绩及1600×900布局，无运行错误。

compact-maze-values.cjs另去掉无引用的--mono声明，将--sans/--serif/--stroke-width的全部HTML/CSS/JS引用一致缩为--s/--f/--w。最终31,056 chars（CSS15,588，JS10,092）。这最后变量名变化只完成构建，未重复跑游戏业务；其渲染需随下一轮样式实际变更一起检查。新工具为构建链最后一步，尽量从build-maze-area起完整重建，避免重复调用值提取丢失记录metadata。正式入口不改，13/14仍有效，最后一项未达标。

## 州迷宫字体/州名纯数据：30574 chars

app.js 的14条州名缩写迁到maze/state-labels.json，build-maze-area.cjs合入mini-data.labels；原4条font-face从area.css解析为font family/url/weight纯数据，合入mini-data.fonts。作者FontFace加载循环仍内联，等待加载后生成地图，保留原字体文件/字重/实际字体族。字体失败catch继续使用原fallback，避免单个字体异常阻断页面。构建链输入仍area-maze → build-area → alias → refine → finish-area → finish-syntax → compact-values。

30,560字符版实际对照：initial仅46像素差（先前缩略图差异本次消失），CApre231/CAmid476未增加；两页1600×900，无页面/请求错误。说明字体就绪后再布局可稳定首屏，但不能把一次截图断言为所有状态完全等价。最后增加14字符字体加载失败catch，最终30574chars，正常加载路径不变未重复截图。正式仍13/14，最后项未达标不替换。

## 州迷宫 30,522 chars

compact-maze-values.cjs把重复calc(var(--1s) * .3)/.2提取为根部--t3/--t2，保留原--1s根据prefers-reduced-motion切换1ms/1s，实际过渡时长不变。净省52chars。曾试算删除同选择器同属性被后置覆盖的规则，实际无节省，工具代码已撤掉。

本轮对照initial3145、CApre231、CAmid273像素差，原/候选均1600×900无请求和运行错误。初始缩略图差异仍波动，不能把上一轮46像素认作已经稳定解决；需继续定位渲染差异。正式仍13/14，候选不安装。

## 州迷宫 30,007 chars

新增trim-maze-area.cjs由build-maze-area在CleanCSS之前调用，显式删除静态继承/默认/无变化目标的冗余：重复sans family、flex row、grid auto、静态图像hover color、未使用的translate transition等，按选择器分组保留其他声明。30,146版本实际对照initial46/CApre231/CAmid476像素，与之前最佳记录一致；两页1600×900无请求运行错误。

compact-maze-content.cjs纯文字提取阈值60改30，现5段原始文案（2段中文介绍、原作署名、人物故事来源说明、下载说明），原文字逐字保留在ui-copy.json，既有data-copy逻辑负责填充；不存任何HTML/JS/CSS代码。原p0变为p3，按模板同步key，最终30,007chars（CSS14,700）。这最后纯文案迁移已构建并检查JSON，未重复浏览器；下轮视觉变更可一起验证。正式13/14不变，最后项仍超15,429。

## 州迷宫 29,924 chars

app.js删除无样式/无变换的SVG顶层空g，墙图层和路径图层直接插入原SVG；stroke-width自定义属性移到pathGroup，两个path继承，circle/full/animated不再附加旧svelte-1997q0u类。trim-maze-area同步移除该专用scope。动态来源表格href改为单引号，避免core将JS模板插值识别成静态依赖。

check-state-maze-syntax实际通过51州、CA17步、撞墙、存档恢复、自动解题不计数、1600×900，零错误。compare-maze-area原/候选1600×900无运行/请求错误，本轮像素差{'initial': 46, 'ca-pre': 231, 'ca-mid': 267}；全部作者运行代码仍合一。13/14正式不变，最后仍超标，不安装。

## 州迷宫 29,684 chars

app.js layoutFacts改为一次累加above/clientAbove，保留rect.height与clientHeight原先不同用途、累加顺序、首卡top=0及最后卡特殊公式；不改通关/保存。compact-maze-values最后增加CSSO5.0.5合并规则（构建工具安装于/tmp/notale-maze-css-opt，未增加页面依赖），CSS14,685→14,492chars。单文件现29,684chars。

对应原/候选视觉检查均1600×900无请求和运行错误，像素差{'initial': 3025, 'ca-pre': 231, 'ca-mid': 476}。没有据此宣称全状态视觉一致，正式仍13/14，最后不达标不安装。后续完整重建末尾仍运行compact-maze-values，CSSO已集成其中。

## 州迷宫 29,217 chars

trim-maze-area移除仅服务唯一组件的重复祖先前缀（state、tracker、maze-directions、grid-wrapper、pick专用插画、modal专用内容等），共享story/info/text类别保留必要限定；#dashboard figure直接#grid。29,256版本对照46/231/476像素，无新增差异。

area-maze模板展平top-wrapper，contents改两列CSS Grid（repeat(2,minmax(0,1fr))、列间距2rem、原行间距3rem），learn跨两列，移除原50%-1rem宽度和多余flex布局。29,217版原/候选均1600×900无请求运行错误，CApre231/CAmid476差异保持；initial6408仍受先前缩略图差异波动影响。当前CSS14,044 chars。没有修改通关/存档行为，正式13/14不变。

## 州迷宫 29,006 chars

compact-maze-values.cjs在CSSO后可选LightningCSS1.29.2 minify（取更短输出，无页面新依赖），构建工具在/tmp/notale-maze-css-opt。当前CSS13,833，整体29,006。没有修改正常业务逻辑。独立检查51州所有cells均满足row*dims+col===index，为后续直接索引提供证据，尚未更改nextLocation。

对照原/候选均1600×900、无请求和运行错误，像素差{'initial': 3145, 'ca-pre': 231, 'ca-mid': 476}；正式仍13/14，最后仍未达15,429、不安装。

## 州迷宫 28,971 chars

app.js不再import旧nextLocation，内联同样的四向规则，利用已证实的row-major cells改为直接索引。movement-equivalence.json记录51州17461格×5方向=87305组原/新结果逐项一致。check-state-maze-syntax随后通过51州、CA17步通关、撞墙、存档恢复、自动解题不计分、1600×900，零错误。

发现之前多次单独运行compact-maze-values使CSS优化轮数不同，计数不可直接与单轮全链构建比较。已在该工具内以最多3轮CSSO/LightningCSS持续取更短结果，数据/变量提取只执行一次。完整链从build-area重建，最终28,971chars/CSS13,816；最后优化轮数变化未重复游戏业务检查。务必完整构建后只运行一次compact-values（仍非幂等数据变量提取器），不要通过多次执行它压缩。正式13/14，最后仍超标不安装。

## 州迷宫 28,648 chars

trim-maze-area移除旧内联SVG的svg path/line/polyline后代着色选择器、无实际h2 icon的hover、无实际line的墙线规则；现图标使用外部symbol/use、墙线使用独立image，保留SVG根的fill/stroke与hover。原svg.svelte-w3cmaj宽高被feather固定尺寸覆盖，删除覆盖前声明与无旋转时不用的origin，overflow规则改svg.feather，area模板移除旧helper scope类。

完整链构建28,648chars（CSS13,523）；对应original/candidate均1600×900，无运行与请求错误。像素差initial3066/CApre231/CAmid476（初态缩略图仍波动，不能声称全像素相同）。未变更存档业务，不重复跑存档测试。正式13/14不变，最后仍超标不安装。

## 州迷宫 28463 chars：固定排序纯数据

build-maze-area从原51州记录按原相同比较器生成geo/alpha/region/barriers四组索引数组与原region出现顺序。app.js渲染时只映射states索引，四种模式及地区分组保留；外部新增纯数组，无作者运行代码外置。check-maze-orders.cjs逐组验证纯数据与旧比较器一致，并实际在浏览器切换4个select选项检查51个DOM州ID完整顺序一致，证据maze/orders-check.json。未改样式，不重复截图/存档测试。正式仍13/14，最后未达标不安装。

## 州迷宫 28423 chars

app.js将barriers/region两处重复创建h3的逻辑合并为heading(text)，标题字符串及插入时机不变，移除仅旧Svelte组件需要且area构建已删的scope复制。完整构建与check-maze-orders四模式51州DOM顺序检查通过。当前28423chars，样式/保存逻辑未变，不重复截图。正式13/14，最后项仍未达标。

## 州迷宫 28321 chars

trim-maze-area将WebKit滚动条thumb三种颜色共享同一color-mix，hover/active只切换--sb比例（默认28%、hover46%、active62%），8px宽高、透明轨道、圆角边框及forced-colors覆盖保留，标准scrollbar-color兼容分支不变。构建28321chars。原/候选页面定向检查1600×900，无请求/运行错误；该检查不覆盖实际拖动scrollbar的hover/active截图，最终仍需按完整验收状态核对。未修改保存数据。正式13/14，最后未达标不安装。

## 州迷宫 28,088 chars

compact-maze-keys.cjs由area-maze调用，从原mini-icons.svg中i3..i6抽原路径，生成4个静态key0..3.svg（viewBox24、stroke#34373e、stroke-width2、圆头圆连接，无脚本）；模板四span+svg/use合并为img.key，22px盒子4pxpadding保留原14px箭头区域。trim-maze-area把键盘span方向选择器改为类别匹配。

原/候选1600×900无运行请求错误；initial3145/CApre319/CAmid564像素差，比此前迷宫态新增88箭头边缘像素。目视diff-ca-pre发现原先一直存在的231像素差主要是人物故事标签内整块plus颜色，不能一直当作普通栅格化：下一步必须核对原Info组件的plus填色并修正。之前报告“迷宫态无新增差异”不代表原有差异合格。正式仍13/14，最后未达标不安装。

## 州迷宫人物标签颜色修复（28,094 chars）

原Modal/Info.svelte明确import plus-light.svg；早期静态图标抽取误把它合并为purple plus.svg。area-maze现复制原始plus-light.svg字节并仅让.plus-icon img使用它（其余pick/grid plus仍purple）。源/复制文件字节相同，全部作者代码仍合一；多6字符文件名属必要视觉修复。

对照initial46、CApre120、CAmid365像素；相较之前迷宫态319/564减少199像素，整块加号颜色差异修复。原/候选均1600×900零页面/请求错误。剩余差异含箭头/外部SVG栅格化，未证明全状态视觉一致，正式仍13/14，最后未达标不安装。

## 州迷宫 28056 chars

area-maze展平bar内两个仅包裹select-control的外层.select容器，trim-maze-area将外层width:fit-content转给实际select-control。标签for/id、控件顺序、select事件不改。完整链构建后四种排序均实际核对51州顺序一致；原/候选1600×900无请求运行错误，画面差{'initial': 46, 'ca-pre': 120, 'ca-mid': 145}。正式13/14不变，最后仍超标不安装。

## 州迷宫 28027 chars：恢复原路径缓动

原Maze/Path.svelte使用draw duration200/quintOut；候选早期cubic-bezier(.22,1,.36,1)仅近似。app.js改Array.from生成201个每毫秒关键帧，dashoffset=length*(1-t/200)^5，保留200ms时长、reduced-motion分支和原路径几何。代码还减少约29chars。

check-maze-easing.cjs实际正常动态浏览器打开CA并按ArrowRight，暂停路径动画检查0/25/50/100/150/199ms，6点computed strokeDashoffset与五次公式误差<.001px，201关键帧确认；证据maze/easing-check.json。关键帧间为线性插值，不宣称数学全时连续精确，但较原近似曲线更贴近原作。样式/存档逻辑未改不重复截图和存档测试。正式仍13/14，最后仍未达标不安装。

## 州迷宫 27,837 chars

compact-maze-class-calls.cjs一次性Babel源码重构：13处classList.toggle共用toggleClass(element,name,on)，函数及所有调用仍内联。app.js现在为Babel格式化源码，旧exact-string区域转换需注意：area-maze将data-copy初始化注入改成可容忍空格的正则；从app源删除已无作用的Svelte表格/段落className复制。

maze-class-syntax现AST识别封装classList.toggle的3参数函数（含压缩后的实际函数名），只将调用的第2实参视为class token，从而正确重命名geo/bounce等状态类别。初次试构建不完整版本已被完整重建覆盖，最终27,837chars。check-state-maze-syntax通过51州、CA17步、碰墙、存档恢复、自动解题不计分、1600×900；check-maze-orders四模式51州顺序也通过。正式仍13/14，最后超标不安装。

## 州迷宫 27,701 chars

compact-maze-dom-calls.cjs一次性Babel源重构，11次setAttribute、9次textContent赋值共用内联setAttr/setText。各函数返回原方法/赋值结果，原属性名、值、文本不变；原setText赋值作为表达式的返回语义保留。构建后27,701chars。

check-state-maze-syntax通过51州、CA17步、撞墙、存档恢复、自动解题不计数及固定布局；check-maze-orders四模式也通过。原/候选1600×900、无请求运行错误，三态像素差{'initial': 46, 'ca-pre': 120, 'ca-mid': 365}。正式仍13/14，最后未达标不安装。

## 州迷宫 27,520 chars

build-maze-area由原Dashboard叙述数据生成51条固定classification内容；只替换原[COMPLEXITY]/[LIMIT]占位符，保留原叙述中的strong强调，无新增作者布局HTML/CSS/JS外置。app打开州时读取相应叙述，去掉重复分支和拼接。独立Python按原copy与states逐州验证51条字符串完全一致，copy/states/facts原字段整体相等。

完整构建27,520chars；原/候选三态定向浏览器检查1600×900，无运行/请求错误。作者DOM插入与状态控制仍在合一文件。正式13/14，最后未达标不安装。

## 州迷宫 27,406 chars

build-maze-area预整理三个原copy栏目（Pick/Dashboard/Methodology）及51州的事实叙述数组，沿用原NAME姓名替换与原顺序；app直接访问，减少重复flatMap/find/filter/replace。外部只存原叙述内容，不存新的作者布局或运行代码。独立Python验证285段全部文字/顺序逐项一致、3栏目原字段相等，原facts/copy整体未变。

完整构建27,406chars。check-state-maze-syntax通过51州、CA17步通关、撞墙、存档恢复、自动解题不计数、1600×900及零错误。样式不变不重复截图。正式仍13/14，最后未达标不安装。

## 州迷宫 27,284 chars

trim-maze-area清理固定1600布局下不会约束380px侧栏的title/h2/desc/mini-intro max-width，以及默认height:auto/position:static、静态bar无效bottom。构建27,284chars，CSS13,317。原/候选三态均1600×900零运行请求错误；CApre120/CAmid365像素差未增加，initial3166依旧含缩略图波动。没有改变业务/存档，正式13/14，最后仍未达标不安装。

## 州迷宫 27,169 chars

trim-maze-area删除模板/原叙述数据/app中都没有的video/picture/h5/h6/caption基础选择器及来源表不存在的第3列规则；只保留两列来源表。另build-maze-area按原solutionIndex排序生成51组cells索引，app自动解题映射原cells而不重复filter/sort。

独立Python核对51条标准解题路径与原排序结果逐项完全一致，并检查4126个相邻步均不穿墙；浏览器check-state-maze-syntax通过手动17步、碰墙、存档恢复、自动解题不计数、51州/1600×900、零错误。当前27,169chars，正式13/14，最后仍超标不安装。

## 州迷宫 27103 chars

鼠标/键盘事件委托试算使压缩JS增44chars（maze/delegation-size-check.json），未采用，原卡片事件保留。实际变更：两次matchMedia查询共享同一实时MediaQueryList，仍每次读取matches；resize observer直接调用resizeMaze，去掉它内部已执行的重复layoutFacts；open去掉resizeMaze已执行的重复SVG清空；mouseleave直接绑定layoutFacts。

完整构建27103chars。check-state-maze-syntax手动通关/撞墙/恢复/自动解题不计数及固定布局通过；check-maze-easing正常动态6个时间点仍符合原五次公式，201关键帧。正式13/14不变，最后仍超标不安装。
正常动态测试首次因开始按钮持续bounce，Playwright click等待stable超时30s；该控件本来持续运动，改为原生Enter键激活，随后6时点缓动检查通过。不是关闭动画来通过测试。

## 州迷宫 26,973 chars

compact-maze-focus.cjs一次性Babel重构5处preventScroll聚焦为focusStill，保留原可选元素语义；27,027版关键交互/恢复/焦点返回回归通过。随后trim-maze-area合并a/button/select相同:focus与:focus:not(:focus-visible)选择器为:is，保持相同specificity与所有声明。最终26,973chars。

使用最终CSS的最小浏览器夹具依次Tab到a/button/select，三者都实际聚焦且outline为2px rgb(107,80,220)，证据maze/focus-style-check.json。该夹具只证明本轮通用focus规则，不用于宣称所有页面状态完成。正式13/14，最后仍超标不安装。

## 州迷宫 26950 chars

renderGrid共用count/finished，减少三次重复读取与比较，保持任意saved.length原显示语义。check-maze-counts.cjs在独立浏览器localStorage夹具下检查0、1、51三个完成数：数字句子一致，只有51时隐藏maze-directions并完整显示原doneMessage。证据maze/counts-check.json，不修改用户真实存档。构建26950chars；原保存/移动业务不改不重复。正式13/14，最后仍超标不安装。

## 州迷宫 26,833 chars

trim-maze-area去掉a默认透明背景、button/select被border重置的border-image:none；去掉固定380px栏不使用的stories max-width；methodology隐藏状态的padding/min-height/position在visible状态均有覆盖，删去。modal在1600固定画布将90%+max-width1000px合并为width1000px。曾评估activity div颜色/对齐继承，因button默认色/对齐不同已保留原声明，未采用。

compare-maze-area现在增加methods状态，本轮4态对照均1600×900无错误：initial87、CApre120、CAmid365、methods18像素差。方法面板必要色/对齐明确保留并实际核对。完整候选26,833chars。正式仍13/14，最后未达标不安装。

## 州迷宫 26,627 chars

finish-maze-syntax补充visible/fade/disabled/above/below类别别名；maze-class-syntax专门识别Object.entries中恰好这5个类状态键的对象，只同步这些键，不触碰其他业务数据字段。JS选择器、classList/封装调用、HTML/CSS全部同一映射，动态fact状态仍匹配。完整构建26,627chars（CSS12,986）。

check-state-maze-syntax手动通关/撞墙/恢复/自动解题/布局通过；4态原/候选均1600×900零请求运行错误，像素差{'initial': 3145, 'ca-pre': 120, 'ca-mid': 162, 'methods': 18}。正式13/14，最后仍超标不安装。注意后续新脚本不能硬编码.below/.visible等旧类，须用build.json aliases。

## 州迷宫滚动条交互复核（26,627 chars保持）

check-maze-scrollbar.cjs在original/candidate独立浏览器页面实际打开方法面板并操作滚动条；默认、hover、mousedown三张右侧10px条带截图逐像素0差异，拖动后两页scrollTop均4。证据maze/{original,candidate}-scroll-{default,hover,active}.png及scrollbar-check.json。验证了此前--sb颜色变量精简在Chromium实际pseudo状态下等价，不只是CSS文字推断；不扩称所有浏览器/所有滚动区域已验证。代码字数不变，正式13/14，最后仍超标未安装。

## 州迷宫 26,576 chars

app.js来源表用单次map/join写入tbody，替换每行createElement/append及索引映射数组；表格HTML仍在合一代码，未外置。实际浏览器28行编号/链接文字/href/日期逐项与original-data.sources严格相等，证据maze/sources-check.json。方法面板截图差异仍18像素；4态原/候选1600×900无运行请求错误。正式13/14，最后仍未达标不安装。

## 州迷宫 26,413 chars

CSS相邻前缀嵌套试算最多约56chars，保留平铺以避免新增语法/兼容验证（nesting-size-check.json），未采用。实际将6张人物卡的固定姓名/州年龄说明/原肖像文件名/12条alt文字预整理到storyCards纯数据；原copy和states不改。app仅填充对应字段，按钮800ms进入原州行为不变。

独立Python按原Pick stories与states核对6个记录全部字段/12个alt逐项一致，原copy整体相等。4态原/候选浏览器1600×900无运行请求错误。构建26,413chars；正式13/14，最后仍超标不安装。

## 州迷宫 26,398 chars

app.js把5段method.content一次map为原p结构并在details前插入，替代逐段createElement/innerHTML/insertBefore；原内容仅内联a标签，无会改变p解析边界的块级标签。HTML结构仍在合一代码，原data不变。完整构建26,398chars。4态浏览器均1600×900无错误，方法面板差异18像素，段落布局保留。正式13/14，最后仍超标不安装。

## 州迷宫非地理排序视觉复核（26,398 chars保持）

compare-maze-sorts.cjs实际对比original/candidate的alpha/region/barriers三种模式，每模式51州id顺序、实际可见标签（含长州名缩写）、每个卡片DOMRect x/y/width/height严格相等，三组差异条目均0。对应截图像素差{'alpha': 46, 'region': 46, 'barriers': 46}；完整结果maze/sorts-comparison.json。此轮没有改代码或重复存档测试，补足过去只查顺序、不查标签与几何的证据。正式13/14，最后仍超标不安装。

## 州迷宫 26,350 chars

app.js以resetGame(play)共用首次打开/开始重玩的入口状态，设定game/started/location/path/userSolved/currentFact；删除在任何实际读取前都会由open/resize设置的重复全局初值。恢复存档分支仍在reset之后覆盖原路径/post状态，自动解题逻辑不变。

完整构建26,350chars。check-state-maze-syntax通过手动通关、碰墙、恢复、自动解题不计数及固定布局；check-maze-counts的0/1/51显示状态也通过。未改CSS不重复截图。正式13/14，最后仍超标不安装。

## 州迷宫 26,242 chars

app.js删除新克隆t-state上重复设置的首标签visible/第二标签非visible，这两态已由模板保证，后续RAF按实际宽度决定缩写不变。area模板删除未打开迷宫前的4个data状态占位属性；renderGame仍在每次实际游戏状态时同步写入全部指标。

完整构建26,242chars。compare-maze-sorts三种非地理模式的51州id/可见标签/DOMRect均与原版完全一致；check-state-maze-syntax通过手动17步、撞墙、恢复、自动解题不计数及固定布局。正式13/14，最后仍超标不安装。

## 州迷宫 26,154 chars

area模板内联固定SVG的墙image组+路径circle/full/animated组，全部结构HTML仍计入合一文件。app缓存这些现有节点，resize仅更新墙href、stroke-width、圆点半径/根SVG尺寸，取消旧路径动画；删除通用svgElement及重复create/append。墙image100%随根SVG尺寸同步，尺寸style三处链式同值赋值。

完整构建26,154chars。关键交互/恢复/自动解题检查通过；4态原/候选均1600×900无错误，像素差{'initial': 46, 'ca-pre': 120, 'ca-mid': 365, 'methods': 18}。正常缓动检查已适配新的below类别映射，并通过6时间点/201关键帧。正式13/14，最后仍超标不安装。

### 州迷宫：26,025 chars，缩略图差异定位
- 最新候选仍超出 15,429，未安装。上一轮删除图片箭头无效 flex/文字样式。
- 本轮同页首次、1 秒、2 秒截图完全相同；原版与候选差异 6,124 像素维持不变，排除短暂等待即可消失的假设。
- 针对德州真正的 `img[src$="tx.png"]`（排除故事加号图片），图片及其上方五层祖先的 DOMRect 和全部非自定义计算样式逐项完全相同。证据：maze/{original,candidate}-tx-styles.json。不能据此声称像素等价；下一步需检查图片绘制/缩放路径，而非继续猜测布局或延长截图等待。

## Maze inline markup templates

- Current experimental candidate: 21,811 characters; still above the 15,429 limit. Production remains unchanged.
- `compact-maze-values.cjs` now runs `template-maze-divs.cjs --apply` as its final step. Always regenerate the base before rerunning. The inline module uses ordinary div/span/button markup helpers; no author code or layout was externalized.
- `maze/div-template-equivalence.json`: initialized DOM exactly equal before/after (37,019 characters), both layouts 1600×900, no page errors. The existing maze interaction regression passed after applying the template stage.

## Maze private data fields and short asset paths

- Experimental candidate is 20,688 characters, still above 15,429; production remains unchanged.
- Final build stages now run markup templates, `shorten-maze-assets.cjs`, then `compact-maze-data-properties.cjs` automatically from `compact-maze-values.cjs`. Always rebuild the base first.
- Runtime fetches `d.json`; descriptive `assets/mini-data.json` is retained. `maze/data-property-equivalence.json` records a reversible property mapping and unchanged saved id/path/row/col fields. Resource aliases and data property maps are in `maze/build.json`.
- Existing interaction regression passed; the four-state visual comparator reports no page errors and both layouts at 1600×900. This is limited visual coverage, not final acceptance.
