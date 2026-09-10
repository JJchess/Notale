# 风格容器减法：手绘 / Bento 两页实验

实现已完成；功能通过，视觉未完全通过。没有新增模型阶段、生产门禁、实验 CLI 或手工页面修复。

## 预览

- [手绘](http://localhost:4177/notale-v2/runs/style-paper-0910-r1-hand/pages/page-03.html) · [初始截图](hand.png)
- [Bento](http://localhost:4177/notale-v2/runs/style-paper-0910-r1-bento/pages/page-03.html) · [初始截图](bento.png)

## 实际调用

全部为 Gemini 3.8 Flash low。原指数增长 query、受众、5 分钟和蓝青配色要求，复用原 page-03 brief 与页表；显式指定手绘/Bento，无 Planner、无改色路径。两份主题并行生成，之后两页 Builder 并行。

| 方向 | Director 响应 / 秒 | Builder 响应 / 秒 | 交付 |
| --- | --- | --- | --- |
| 手绘 | 2 / 28.80 | 6 / 48.90 | 自然结束，有页面 |
| Bento | 2 / 26.94 | 5 / 43.34 | 自然结束，有页面 |

生成墙钟 77.72 秒，实际共 15 次模型响应。Director 两次额外响应属于既有技术修正：手绘的 --primary-blue、--ink-border、.nt-slider、.nt-chart-curve 接口声明未实现；Bento 覆盖 #stage overflow 与全局 */::before/::after。没有新增审美重试。输入冻结检查 inputs_unchanged=true。

## 验收

- 两页初值 248.83、End 到 50% 后 759.38、重置 248.83、Home 到 0% 后 100.00 均与公式一致。
- 曲线路径/点位随增长率改变，重置恢复初始几何；无页面 JS 错误。只验证本次主要操作，不冒充完整内容或全交互回归。
- 手绘：大图表和控制区使用 .nt-hand-card，不规则轮廓和硬阴影得到保留，没有因白底或面积大而被清除。控制区仍存在过大的纵向空白，布局目标未完全达到。
- Bento：不再是旧图的白卡，操作区更紧凑；但画面依旧重复使用深色圆角底板，不能把深色替代白色当作默认面板倾向已经解决。主题还供应 .nt-bento-cell，页面自己实现了类似外观。本项保守判未通过。
- 两份新主题的明暗与历史蓝色样本不同，不能称为仅容器变化的严格单变量对照。字体库和推荐表未改；audit.json 的 title_font 是计算样式字体栈，不是逐字形字体命中审计。

## 改动与边界

本轮只替换/删减 6 处运行输入来源的文案，维护 GUIDE 和既有输入测试同步。Builder 执行代码仅删 REF_SHOTS_NOTE 一行，Check 仅替换两段说明字符串；已与本轮前快照逐字核对，逻辑未变。上述 6 个来源合计减少 811 个 Unicode 字符，不等于每次请求节省 811 token。

3 项定向离线检查通过（0.076 秒），未跑全量回归。Director、主题校验、配置、实验脚本、40 张详情、INDEX、40 张原裁图、base.css/base.js 的本轮前后哈希一致；字体资源未修改。旧 run 和 nn03 未回写。

原始证据：experiment.json、themes.json、result.json、audit.json，以及各 run 的 trace.jsonl。未继续抽样、未补催、未换模型、未手修产物；不以两页证明所有风格可靠。
