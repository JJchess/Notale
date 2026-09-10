# 剪枝收敛验收 · 2026-09-10

剪枝前全仓 baseline：`03a78e32`；不含 Git 忽略文件，Brave Search 研究克隆为 gitlink。验收后的剪枝版本提交以 Git 日志为准，未 push。旧 run 与稳定预览未改。

## 离线与改动边界

58 项直接相关测试通过（0.601s，无模型调用）；40 项详情、原图和字体声明均可解析。详情共删除 8,229 个重复字符，每项字体资源引用集合不变。

对 baseline 做 AST 比较：Builder build_one/audit_delivery/first_guidance_only/theme_ref_images/user_ref_images，Director pick/_call/_one_write/direct，Planner deck_call 均未改。CSS 校验、底盘 CSS/JS、自检运行时和风格 INDEX 内容未改。

删除两个旧实验开关、接口漏列类名告警与无生产调用的旧 ref_images；提示规则按职责去重，历史主计划归档。默认 Planner/Director/视觉 Builder 对齐 Gemini 3.8 Flash low，代码页保留 DeepSeek V4 Flash low。

## 唯一一次完整 auto

原始输入与 profile 从上一轮 experiment.json 读取；三题各 8 分钟、恰好 3 页、无代码页，不指定风格或参考。三题并行，各题 Planner∥Director；无人工补催、修页、换模型或新建 run 重试。实际命令与输入见各题 commands.json 和本目录 experiment.json。summary.json 记录 inputs_unchanged=true。

| 题目 | 自动选择 | Planner/Director 阶段 | Builder 阶段 | 单题总时长 | 主链路响应数：Planner / Director / Builder |
| --- | --- | --- | --- | --- | --- |
| 种子 | 18-collage | 31.23s | 92.46s | 123.69s | 2 / 3 / 21 |
| 地铁 | 02-swiss | 45.25s | 123.48s | 168.73s | 2 / 3 / 22 |
| 黑胶 | 07-skeuomorphism | 46.51s | 86.06s | 132.58s | 2 / 3 / 20 |

并行生成墙钟 168.79s，不含组装与人工观察；共记录 78 次 Planner/Director/Builder 响应，不等于包含媒体内部请求的全服务调用数。上一轮 159.55s、88 次响应；单次采样不足以证明剪枝降低成本或提高速度。

三路 Director 都是选样一次、主题两次。首次主题分别因 stage position，公共 panel token/未实现公开接口，stage overflow/未实现公开类触发现有技术修订；没有新增门禁。9/9 页交付，最终 audit 无 fatal_errors 或 visual_warnings。

## 页面与交互观察

三套各组装一次，查看全部 9 张缩略图。种子的照片/便签/胶带体现拼贴方向；地铁保留导视式排印和时间条；黑胶有唱机拟物主体及仪器式视窗。不是全风格验收，也不把“选择不同 ID”本身当作通过证据。

种子第 3 页的狗图并非无关素材：brief 的来源明确标注为携带 hooked Geum fruits 的 Labrador，原图能看到毛发上的果实。此前仅凭缩略图称其“误配”已撤回。实际弱项是缩小后难以观察果实细节、未突出倒钩证据，且右侧白色操作区有较大空白。默认套壳和字体集中问题不能宣称已经解决。黑胶的多面板承载联动演示，不能只凭面板数判错。

单浏览器抽查各题第 3 页，详见 interaction-smoke.json：

- 种子：错误选择有矛盾反馈，三种正确匹配达到 3/3，重置当前题回到 2/3。
- 地铁：高峰直达/换乘 27.5/24.0 分；深夜变为 33.0/35.0 分，结论反转，候车条随之变化。
- 黑胶：2 倍转速下频率 600 Hz，振速 13.2 cm/s 与本页公式独立复算一致；振幅及三参数重置生效。

上述操作无 pageerror。没有验证全部科学假设或音频听感，不将运行通过称为完整内容/视觉通过。未修产物、未追加模型实验。

## 预览

- 种子：http://localhost:4177/lab/preview-style-prune-auto-0910-r1-seeds/
- 地铁：http://localhost:4177/lab/preview-style-prune-auto-0910-r1-metro/
- 黑胶：http://localhost:4177/lab/preview-style-prune-auto-0910-r1-vinyl/
