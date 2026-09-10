# Style Director 收窄：只留 auto 一条路，主题失败不拖死整轮（历史草案，2026-09-09）

> 2026-09-10：已由 [PLAN-style-control.md「当前方案」](../../../notale-v2/PLAN-style-control.md) 综合评议并取代，不再待批或作为实施依据。保留本文用于追溯；auto-only、默认降级主题、style.json 与线程重构未获本轮采纳，代码未据此实施。

一句话：删掉 `--template / --style` 带来的 reuse / modify / reference 三条路线和它们的导入沙箱、白名单、样张交接；Director 只剩 pick → theme → 闸；Director 失败时发一份最简主题继续建页，失败原因落盘并写进 INTERFACE。不动线程结构、不动两阶段选样、不动技术闸。

以下为原草案正文；原先“本文件是唯一依据”的安排已撤销，以 `PLAN-style-control.md` 顶部当前方案为准。

## 1. 为什么现在收

对着当前工作树（`core/director.py`、`core/theme.py`、`core/planner.py`、`core/builder.py`）和 0909 三路实验记录看，问题不在某一段代码，在于核心一条路还没站稳，旁边已经长出三条：

- 四条路线没有一等公民的表示。同一个"这次走哪条"从 `(source, request, original)` 三个变量里被推了四次：`import_input(allow_repair=bool(request))`、`if original and not request`、`picks = [] if source else …`、返回时再拼名字。名字只用来塞进一个被 planner 丢弃的 dict。
- `--style` 兼作文件白名单（`theme.py:293-296`）：模板目录里的图片和字体，只有相对路径字面出现在 `--style` 那句话里才拷。写"用 logo.png"拷，写"用那个 logo"不拷，且不报错。
- 导入沙箱 60 多行（边界检查、字体许可随拷、`url()` 重写）、Builder 侧 `user_ref_images` + `REF_SHOTS_NOTE` + "有参考图但 profile 没 vision 就报错"的守卫，全部只在用户给了 `--template` 时有用。
- Director 抛异常 → planner 主线程 re-raise → `briefs.json` 不写 → Builder 不启动。页表已规划好、图已搜好，一页不建。0909 auto 路线 0/3 就是这条链。
- `run._style_calls` 挂在 Run 上的私有计数器、四处 `getattr(run, 'template', None)`、`check_options` 被调三次，都是"不确定调用方是谁"的痕迹。

0909 里 reference 与 modify 各交付 2/3、auto 0/3，不构成保留它们的理由：三路都撞了同一道技术闸（`::-moz-range-*` 被拒），那道检查已经在当前树里删掉，三路的数字都不代表今天的行为。

## 2. 决定

删：

- CLI：`core.planner` 与 `core.director` 的 `--template`、`--style`。
- `planner.Run`：`template`、`style` 两个字段；`__post_init__` 里的 `check_options` 调用。
- `core/theme.py`：`check_options`、`import_input` 整个函数。`inspect / validate / browser_check / publish / local_url` 不动。
- `core/director.py`：`direct()` 里的路线推导、`import_input` 调用、reuse 分支；`theme()` 的 `original`、`shots` 两个参数，以及"待修改完整原主题"和"已导入的本地素材"两段上下文；`_images(picks + refs)` 里的 `refs`；`run._style_calls`；`main()` 里的 `check_options` 和两个参数；所有 `getattr(run, …)` 改成直接读字段。
- `core/builder.py`：`user_ref_images`、`REF_SHOTS_NOTE` 里针对用户参考的措辞、`refs 存在且 vision_input=False 则报错` 的守卫（`:585-586`）。`ref_images`（`--ref-shots`，画廊前两张给 Builder）保留，它是 auto 路线自己的实验开关。
- `scripts/style_e2e.py`：`reference / modify` 两个 case、`--route` 参数、源主题哈希预检。脚本保留为 auto 单路线的付费端到端 + 浏览器审计。

加：

- `vendor/chassis/theme-fallback.css`（下节）。
- `planner.plan_run`：Director 失败 → 发布降级主题、写 `runs/<label>/style.json`、打一行 ⚠、继续。成功时也写 `style.json`（路线、picks、CSS 长度），让 Director 的返回值有地方住。

改：

- Director 线程改用 `concurrent.futures.ThreadPoolExecutor(max_workers=1).submit(...)`，用 `future.result()` 同时拿返回值和异常。删掉现在的 `director_err` 列表和闭包搬运。stdlib 现成的，比自己写线程 + 列表干净。

不动：

- 线程不改进程。删完之后 Director 对 Run 的依赖只剩 `root / prompt() / log / canvas / prompts / direction_menus / query / audience / scenario` 这些只读字段，耦合边界已经看得见；改进程要动 trace Writer、驱动脚本、e2e，换来的只是少一把锁。
- 两阶段 pick 不砍。画廊 204 条，不可能全发图，选样这一步必须存在；要争的是"模型按文本索引选 5 张"还是"确定性抽 5 张"，见第 7 节的测法。
- 技术闸不分级。0909 误拒的那条浏览器兼容检查已经删了；现在剩下的规则里没有一条是"可忽略分支"性质的。
- `font_library.prepare` 仍在校验循环里：浏览器闸的 `FontFace.load()` 要读到真文件，顺序改不了。
- `--no-style-director`（deck 自己写 CSS）不动。

## 3. 降级主题

`vendor/chassis/theme-fallback.css`：

```css
/* ==== INTERFACE ====
 * 降级主题：Style Director 失败时由 harness 发布。只有三个必需 token，
 * 没有 variant、没有 .nt-* class。页面按 CHASSIS.md 自己排，不要等主题。
 * token --bg --text --font-sans
 * ==== /INTERFACE ==== */
:root {
  --bg: #f6f3ec;
  --text: #1f2933;
  --font-sans: "Noto Sans SC", system-ui, sans-serif;
}
```

为什么写在 INTERFACE 里：视觉页 Builder 的 system 前缀只预载 INTERFACE 块，这行字会自动进每个 Builder 的上下文，不用给 Builder 加任何新输入。代码页不读主题，本来也不受影响。

`base.css` 只依赖这三个 token（`base.css:18-31`），所以这份文件足够让页面正常渲染。

## 4. 逐文件改动

### `core/planner.py`

```diff
@@ class Run:
-    template: Path | None = None
-    style: str | None = None
@@ def __post_init__(self):
-        from .theme import check_options
-        check_options(self.template, self.style, self.style_director)
@@ def plan_run(run, chassis, lib, workflow_root=None):
-    director_err = []
-    director_thread = None
-    if run.style_director:
-        from . import director as _director
-
-        def _run_director():
-            try:
-                _director.direct(run, config()["planner"]["reasoning_effort"], workflow_root)
-            except Exception as exc:            # noqa: BLE001 —— 失败要能报出来,不能吞
-                director_err.append(exc)
-
-        import threading
-        director_thread = threading.Thread(target=_run_director, daemon=False)
-        director_thread.start()
+    director = None
+    if run.style_director:
+        from concurrent.futures import ThreadPoolExecutor
+        from . import director as _director
+        director = ThreadPoolExecutor(max_workers=1).submit(
+            _director.direct, run, config()["planner"]["reasoning_effort"], workflow_root)
@@
-    if director_thread:
-        director_thread.join()
-        if director_err:
-            raise RuntimeError(f"style director 失败:{director_err[0]}") from director_err[0]
+    if director:
+        from .theme import publish
+        try:
+            style = director.result()
+        except Exception as exc:                # noqa: BLE001
+            # 主题是可替换资产(run-abl.sh 早就整份拷过来用),不该握有整轮的一票否决权。
+            # 发降级主题继续建页;原因落 style.json,并写在 INTERFACE 里让每个 Builder 都看见。
+            publish((Path(chassis) / "theme-fallback.css").read_text(encoding="utf-8"), run.root / CSS_REL)
+            style = {"route": "fallback", "error": repr(exc)}
+            print(f"  ⚠ style director 失败,已发布降级主题继续建页: {exc}")
+        (run.root / "style.json").write_text(json.dumps(style, ensure_ascii=False, indent=2), encoding="utf-8")
         css = (run.root / CSS_REL).read_text(encoding="utf-8")
@@ def main():
-    a.add_argument("--template", type=Path, help="参考图片或 theme.css / shots 目录")
-    a.add_argument("--style", help="风格要求；修改成品主题必须显式指定")
     n = a.parse_args()
-    from .theme import check_options
-    try:
-        check_options(n.template, n.style, n.style_director)
-    except ValueError as exc:
-        a.error(str(exc))
@@
-                 visual_focus=n.visual_focus, style_director=n.style_director,
-                 template=n.template, style=n.style),
+                 visual_focus=n.visual_focus, style_director=n.style_director),
```

### `core/director.py`

```diff
@@ def _call(...):
-    run._style_calls = getattr(run, '_style_calls', 0) + 1
@@
-def theme(run, picks, effort, workflow_root, history=None, original='', shots=()):
+def theme(run, picks, effort, workflow_root, history=None):
     from . import style_catalog
     history = history if history is not None else []
     out = run.root / 'pages/assets/theme.css'
-    catalog_text, catalog_images = style_catalog.inputs(getattr(run, 'style', None))
+    catalog_text, catalog_images = style_catalog.inputs(None)
@@
-    body += '\n\n明确风格要求：' + (getattr(run, 'style', None) or '按内容选择')
+    body += '\n\n明确风格要求：按内容选择'
     body += '\n\n风格表（创作参考，不是页面资产）：\n' + catalog_text
-    if original:
-        body += '\n\n待修改完整原主题（按明确要求生成完整新版本）：\n' + original
-    imported = out.parent / 'style'
-    assets = [p.relative_to(out.parent).as_posix() for p in sorted(imported.rglob('*'))
-              if p.is_file() and 'shots' not in p.relative_to(imported).parts]
-    if assets:
-        body += '\n\n已导入的本地素材，CSS 必须用重定位后的路径（不是来源目录路径）：\n' + '\n'.join(assets)
-    refs = [{'id': '用户参考，优先于自动偏好', 'shot': str(p)} for p in shots]
-    body += '\n\n用户图默认只是参考，不得擅自用作背景。工具媒体路径相对 pages/；CSS URL 相对 assets/。'
-    content = [{'type': 'input_text', 'text': body}] + _images(picks + refs) + catalog_images
+    body += '\n\n工具媒体路径相对 pages/；CSS URL 相对 assets/。'
+    content = [{'type': 'input_text', 'text': body}] + _images(picks) + catalog_images
@@
-def direct(run, effort, workflow_root=None):
-    workflow_root = workflow_root or skills.WORKFLOWS
-    source, request = getattr(run, 'template', None), getattr(run, 'style', None)
-    theme_io.check_options(source, request, getattr(run, 'style_director', True))
-    assets = run.root / 'pages/assets'
-    original, shots = theme_io.import_input(Path(source) if source else None, assets,
-                                          allow_repair=bool(request), request=request or '')
-    run._style_calls = 0
-    if original and not request:
-        ...reuse 分支整段...
-    if not llm.default_runtime().profile.vision_input:
-        raise ValueError('Style Director 需要启用 vision_input 的模型，不能盲写参考主题')
-    history = []
-    picks = [] if source else pick(run, gallery.measure(), effort, history)
-    css = theme(run, picks, effort, workflow_root, history, original, shots)
-    return {'route': 'modify' if original else 'reference' if source else 'auto',
-            'picks': [p['id'] for p in picks], 'css_chars': len(css), 'model_calls': run._style_calls}
+def direct(run, effort, workflow_root=None):
+    """pick → theme → 闸。只有这一条路;主题失败由 planner 兜底,这里只管抛。"""
+    workflow_root = workflow_root or skills.WORKFLOWS
+    if not llm.default_runtime().profile.vision_input:
+        raise ValueError('Style Director 需要启用 vision_input 的模型，不能盲写参考主题')
+    history = []
+    picks = pick(run, gallery.measure(), effort, history)
+    css = theme(run, picks, effort, workflow_root, history)
+    return {'route': 'auto', 'picks': [p['id'] for p in picks], 'css_chars': len(css)}
@@ def main():
-    a.add_argument('--template', type=Path, help='参考图片或包含 theme.css / shots 的目录')
-    a.add_argument('--style', help='风格要求；修改成品主题必须显式指定')
@@
-    try:
-        theme_io.check_options(n.template, n.style)
-    except ValueError as exc:
-        a.error(str(exc))
@@
-    run = planner.Run(n.query, n.minutes, n.audience, n.label, n.scenario, template=n.template, style=n.style)
+    run = planner.Run(n.query, n.minutes, n.audience, n.label, n.scenario)
```

`style_catalog.inputs(request)`：`request` 命中风格 ID 时直接返回该条详情（`style_catalog.py:65-68`），这是 `--style` 专用分支；`None` 走全表轻索引。删参数和 `match` 分支，`inputs()` 只剩索引一条；`match()` 若无其他调用者一并删。`_images()` 保持接受任意带 `shot` 的 dict 列表——将来要接用户参考图，只是往这个列表里多放几项，不用把路线加回来。

### `core/theme.py`

删 `check_options`（`:256-262`）与 `import_input`（`:265-326`）。其余不动。

### `core/builder.py`

```diff
-REF_SHOTS_NOTE = """<references>
-...针对"用户参考 / 方向参考"的措辞，改成只说画廊参照...
-def user_ref_images(root: Path) -> list[dict]:
-    ...
@@ main():
-    refs = user_ref_images(root)
-    if not refs and args.ref_shots:
-        refs = ref_images(root)
+    refs = ref_images(root) if args.ref_shots else []
@@ build_one():
-    if refs and not runtime.profile.vision_input and workflow != "build-code":
-        raise ValueError(...)
```

第三段那个守卫：`--ref-shots` 是实验者手动传的，配了没 vision 的 profile 是实验者自己的错，保留报错也行。我倾向删，因为它存在的理由（"不允许声称看过用户给的参考"）随用户参考一起消失了。二选一，不影响别的。

### `scripts/style_e2e.py`

`cases` 只留 `('auto', None, None)`；删 `--route`、源主题预检、`source_hash`；`experiment.json` 的 `routes` 字段留着（值恒为 `['auto']`），省得改报告页。

## 5. 测试

- `core/test_style_upgrade.py`：删 `test_local_urls_preserve_nested_names_fragments_and_original`、`test_resource_boundaries`、`test_reuse_is_zero_calls_and_invalid_reuse_is_not_repaired`、`test_input_conflicts_and_empty_directory`、`test_user_reference_is_copied_and_visible_to_builder`、`test_import_does_not_silently_repair_unclosed_css`、`test_explicit_modify_uses_original_without_gallery`（7 条，都是导入/路线的）。`setUp` 里的 `template=None, style=None` 删掉。其余 8 条（闸、Write 合同、历史保留候选、pick、media 回同一 history、publish 原子性）是 auto 路线自己的，必须继续过。
- `core/test_style_fonts.py:95,114`、`core/test_style_fonts_browser.py:19`：三处调 `import_input` 是为了拿一份"经过重定位的 CSS"喂 `font_library.prepare` / 浏览器闸。改成直接读 fixture 的 CSS 文本，测试意图不变。
- `core/test_director.py`：8 条全是 `inspect` 的边界，不受影响。
- `core/test_prompts.py:51`、`core/test_skills.py:440`、`core/test_code_runtime.py:101` 里的 "template" 是别的意思，不动。
- 新增一条（放 `test_director.py`）：`theme.validate(theme-fallback.css, assets, browser=True)` 返回空，防以后闸收紧把兜底文件卡掉。
- 新增一条（放 `test_style_upgrade.py`，mock `direct` 抛异常）：`plan_run` 之后 `pages/assets/theme.css` 等于 fallback 内容、`style.json` 里 `route == "fallback"`、`briefs.json` 存在。这是本次唯一的行为变化，必须有它的检查。

## 6. 验证顺序

1. 纯删 + 单测：`python3 -m unittest core.test_style_upgrade core.test_director core.test_style_fonts core.test_style_fonts_browser core.test_builder core.test_prompts`。不跑全量，只跑碰到的。
2. `grep -rn "template\|import_input\|check_options\|user_ref_images" core scripts` 应只剩 `test_prompts / test_skills / test_code_runtime` 那三处别的意思的命中。
3. 一次真实付费 auto 端到端：`python3 -B scripts/style_e2e.py --prefix style-auto-<日期>`，同 0909 的 query 与模型。这次的意义是建立"闸修掉之后 auto 到底行不行"的基线——0909 的 0/3 是旧闸的数字，删完路线之后没有可信的 auto 基线，后面任何 pick / theme 的改动都没法对照。
4. 基线出来后再更新 `ARCHITECTURE-v4.html` Director 列：删"入口 --template/--style"、"四路线"、"导入沙箱"三个节点，"两路不交换任何产物"那块补一句"Director 失败 → 降级主题 + style.json"。
5. 把本文件的结论压成一段并回 `PLAN-style-control.md` 顶部，标日期。

## 7. 反对意见与我的回答

**"删掉的两条是 0909 唯一交付过页的。"** 三路撞的是同一道已删除的闸，交付数字都是旧行为。auto 今天能不能过，要靠第 6 节第 3 步量，不能拿旧数字替。

**"降级主题会让 Director 失败在交付率里隐形。"** 三处都记着：stdout 一行 ⚠、`style.json` 的 `route == "fallback"`、`theme.css` 的 INTERFACE 首行。读实验时"有页面"不再等于"Director 成功"，要看 `style.json`。如果你更想要"失败就整轮失败"的口径，`--no-theme-fallback` 一行就能加；我默认不加，因为"页表和图都好了却一页不建"这个结果对谁都没用。

**"09-07 刚拍板模板进 Director，两天就撤。"** 撤的是路线，不是能力。用户参考图将来的接法是往 `theme()` 发的图列表里多放几张、多一段说明；`_images()` 已经是这个形状。"新页表 + 旧主题"的需求（不是 run-abl 那种整份冻结）等真出现时，加一个 `--theme <theme.css>`：拷进来、跑一遍 `validate`、跳过 Director，六行。现在没有这个需求。

**"pick 这次模型调用到底值不值。"** 204 条画廊，不发全图是对的，但"模型读标题 + 五色占比选 5 张"和"按明度分层随机抽 5 张"哪个更好，没量过。测法：同 query 各跑 N 轮，两臂只差 `pick` 的实现，用 `refs/quality` 那套 judge 的 G 指标比；占用比噪声底 12pp 的教训在前（见 memory），N 不能是 1。这不在本次范围，但收窄之后两臂只差一个函数，才可能干净地做。

**"INTERFACE 里写'降级'会不会让 Builder 保守。"** 可能，而且应该：它就是要知道现在没有风格可依。会不会因此更差，第 6 节第 3 步之后专门跑一次 mock 失败的整轮看页面。

**"线程还是线程，耦合还在。"** `future.result()` 把异常和返回值都收干净了，剩下的耦合是 Director 只读 Run 的几个字段。这是能接受的形状；再往下拆是改进程，收益不够。

## 8. 要你拍板的

1. 降级主题默认开、不加开关 —— 接受，还是要 `--no-theme-fallback`？
2. `--ref-shots` 配非 vision profile 时的报错守卫 —— 删还是留？
3. `scripts/style_e2e.py` 留作 auto 单路线的 e2e，还是整个删掉、e2e 回到 `run12.sh`？
