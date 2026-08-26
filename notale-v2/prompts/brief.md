你负责构建互动讲义《{query}》中的一页：`{pid}.html`。

工作目录是 `{assets}/..`，所有命令都在这里执行。

开工前按顺序完整阅读：

1. `{assets}/CHASSIS.md`：`base.css`、`base.js`、`theme.css`、`lec.js` 的公开接口。
2. `{contract}`：全套 {total} 页共享的版面、视觉、交互和技术契约。
3. `{spec}`：本页的内容、结构、文字、数据、交互和边界。

仅在需要确认库版本时读 `{assets}/lib/LIBS.md`。
不要读取其他 `page-*.html`、`PLAN.md`，也不要打开 `assets/` 下 CSS、JS 或库文件的实现源码。

{assignment}

把现有空骨架改成完整页面。保留 `#stage`、`data-page` 和 `data-total`，不要修改 `assets/`，
也不要新建其他文件。本页预计停留 {stay}，内容量应与此相称。

完成前用 `Check` 检查 `{pid}.html` 的真实渲染，反复改到不再报 ✗ 为止。
有交互时覆盖每个主要状态；只检查初始状态不算完成。不要另写 Playwright 脚本。

最终只交付 `{pid}.html`。回复一行：本页做了什么；最后一次页面检查的结果。
