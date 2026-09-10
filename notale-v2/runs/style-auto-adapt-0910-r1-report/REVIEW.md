# AUTO 风格自适应实验：2026-09-10

本轮仅执行实验，不修改 harness、模型配置、提示词或风格资料。三个 query 均不指定主题、颜色、字体或参考图；每题恰好 3 页、8 分钟、无代码页。完整原始输入见 experiment.json，实际命令见各题 commands.json。全程 Gemini 3.8 Flash low。Planner 与 Director 内部并行，三题也并行；没有人工补催、修页、换模型或追加实验。summary.json 记录 inputs_unchanged=true。

| 题目 | 自动选择 | Planner/Director 阶段 | Builder 阶段 | 单题总时长 | 模型响应数：Planner / Director / Builder |
| --- | --- | --- | --- | --- | --- |
| 种子怎样旅行 | 33-eco-nature | 66.38s | 87.55s | 153.94s | 2 / 3 / 24 |
| 最少换乘一定最快吗 | 02-swiss | 43.97s | 115.50s | 159.48s | 3 / 3 / 24 |
| 黑胶唱片怎样发出声音 | 30-monoline-illustration | 41.32s | 105.54s | 146.85s | 2 / 3 / 24 |

并行生成总耗时 159.55s，不含后续组装与观察；共记录 88 次模型响应。Director 每题均为选样 1 次、写主题 2 次：首次分别因覆盖 #stage overflow、全局 * 选择器、覆盖 #stage position 触发现有契约修正。不是新增审美门禁，也不是每题仅 2 次。详见各 run 的 style.rejected.json 与 trace.jsonl。

## 产物与观察

9/9 页交付，Builder 最终 audit 的 fatal_errors 和 visual_warnings 均为空。三套各组装一次并查看全部 9 张预览缩略图，没有修饰或替换原始 HTML。

- 种子：照片、文楷标题和浅绿背景使自然观察方向可辨；但第 1、2 页仍反复使用白底圆角软阴影卡片，第 3 页右侧控制容器仍有较多空白。Paper 问题未通过视觉验收。
- 地铁：粗无衬线标题、直角规则线、时间条和线路图相对一致。第 3 页分框仍较多，但用途与路线比较、参数操作相关，不能只因有边框判错。
- 黑胶：三页均有轮廓插画、橙青信号标识和硬边阴影，风格较一致。第 3 页仍有三列面板，但承载三个联动演示，不能等同于无内容 Paper；密度与文字可读性仍需人工审阅。
- 字体并未充分分化：种子中文标题采用文楷；地铁与黑胶中文仍共用 Noto Sans SC，三套正文也都配置该中文字体。不能用不同英文字体名宣称中文多样性已解决。

单浏览器抽查各题第 3 页实际交互：种子切椰子后选择水流/风力，分别出现正确/错误反馈；地铁换乘步行由 8 调至 25 分，总耗时由 34 变为 51 分，切场景和路线选择生效；黑胶振幅、波形、暂停及复位生效。三页操作期间未捕获 pageerror。未验证音频听感或全部科学数值，不将这些冒烟检查称为完整内容验收。

## 结论

三题给出了与内容相关的不同选样理由，并在产物中体现出可辨的方向差异。这支持当前 auto 链路具有一定自适应表现，但三个样本不足以证明稳定性；尤其不能据此宣称 Paper 问题已解决。本轮不据此扩大 ban list，不增加门禁或调用。

预览：

- http://localhost:4177/lab/preview-style-auto-adapt-0910-r1-seeds/
- http://localhost:4177/lab/preview-style-auto-adapt-0910-r1-metro/
- http://localhost:4177/lab/preview-style-auto-adapt-0910-r1-vinyl/
