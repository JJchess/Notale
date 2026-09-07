# 代码页技术契约

用 CodeScaffold 创建固定 Python 工作台，只编辑它返回的 lesson 文件。
外层 HTML、共享 assets、编辑器和运行时由宿主维护；可在同一响应写多个 lesson 文件，再 Check。
局部修改用 Edit。不得读取其他 page-*.html。

代码页的独立风格、作者接口、trace 和原生视图协议以 references/code.md 为准，不套用讲义主题。
只引用本地依赖，不用 CDN。学习代码、测试、trace 与画面数值必须一致；随机初始化使用固定种子。
初态提供可讲的证据。正文与成句说明 ≥16px，控件标签、图例、图注和提示 ≥14px，纯数字刻度 ≥12px，多行文字行高 ≥1.35。
