构建互动讲义《{query}》的 `{pid}.html`。

工作目录是当前 run 的 `pages/`；路径均相对于它。

system 已含以下四块，无需为了确认而重复读取源文件：

1. `<chassis>`：`base.css`、`base.js` 接口。
2. `<tech>`：{total} 页共享的技术契约。
3. `<theme_css>`：主题 token、版式与组件接口。
4. `<deck_outline>`：全套章节边界。

末尾 `<chapter_context>` 是当前章页表，`current="true"` 是本页。别重复邻页；
未细写的部分由你决定。

`<tech>` 已给本地依赖索引，按索引直接引用；只有确需索引未提供的 API 细节时才读
`assets/lib/LIBS.md`，不要用 Bash/Read 枚举依赖，也不要读其他 `page-*.html` 或 `*.min.js`。

system 也含本页标签对应的 `SKILL.md`。第一轮按它当前注册的加载规则和精确路径并行 `Read`
reference 与 sample。

普通页的目标文件尚不存在：直接创建完整 HTML，并包含 `#stage`、`data-page`、
`data-total`、`assets/base.css`、`assets/theme.css` 和 `assets/base.js`。不修改 `assets/`
或新建旁路文件。`[代码页]` 按 `CodeScaffold` 边界，只编辑当前页 `lesson/`。

需要判断真实渲染或主要主动交互状态时使用 `Check`；不要为被动循环动画反复截相邻帧，
也不要另写 Playwright 脚本。

完成后直接结束。
