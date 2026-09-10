# 可随主题交付的字体资源

首批 19 个中英字体家族。字体不安装到系统，不在生成请求中下载。文件来自固定的上游版本，保持原始二进制；许可证随引用资源复制进 run。

这是一份资源库存，不是风格 schema。风格如何选字体在 40 项详情中维护；同一字体可服务多个方向。默认不把全部字体表灌进模型上下文。

| 资源 | 用途与限制 |
| --- | --- |
| [noto-sans-sc](noto-sans-sc/README.md) | 中文基础无衬线；100–900 可变字重。用于正文、清晰标题和缺字回退。此处是上游 Noto Sans SC 分发版，不引用服务器的 Noto Sans CJK SC 名称。 |
| [noto-serif-sc](noto-serif-sc/README.md) | 中文基础衬线；200–900 可变字重。用于编辑式标题与长文；不是所有历史宋体或高对比西文衬线的等价物。 |
| [lxgw-wenkai](lxgw-wenkai/README.md) | 自然书写感中文楷体，首批提供常规 400 与中等 500。可用于人文正文、手绘标题；不是随意草书。原始完整版资源较大，未按页面动态裁字。 |
| [smiley-sans](smiley-sans/README.md) | 得意黑：窄而斜的中文展示黑体。真实 font-style 为 italic、weight 为 400；只推荐标题/短文，不作为普通正文。官方来源：https://github.com/atelier-anchor/smiley-sans 。 |
| [zcool-kuaile](zcool-kuaile/README.md) | 站酷快乐体：用于活泼短标题的展示字。只有 400，不伪造粗体；正文和公式使用更稳定的字。 |
| [zcool-qingke](zcool-qingke/README.md) | 站酷庆科黄油体：几何化、圆角和特殊部件处理，适合短标题/标签。只有 400，不冒称通用窄重黑体。 |
| [zcool-xiaowei](zcool-xiaowei/README.md) | 站酷小薇体：具有辨识度的展示字笔形，可搭配编辑式拉丁标题。真实内部 family 为中文名称；不能称为 Didone 的中文等价物。 |
| [fusion-pixel](fusion-pixel/README.md) | Fusion Pixel 12px 比例版，简体语言字形。真实中文字像素化；只用于短标题/游戏标记，正文可平滑。与英文 8px 字的网格不同，不承诺同字号基线天然吻合。保留上游 LICENSES。 |
| [inter](inter/README.md) | 中性拉丁无衬线，提供可变常规与斜体。正文、标签、数字；不是中文字体。 |
| [barlow-condensed](barlow-condensed/README.md) | 窄拉丁无衬线，提供 400/700/800 直立字重。用于短标题的尺度对比；不能通过它让中文也变窄。 |
| [space-grotesk](space-grotesk/README.md) | 几何与不规则细节结合的拉丁无衬线，300–700。标题与标签；正文按可读性选择。 |
| [source-serif-4](source-serif-4/README.md) | 连续阅读用拉丁衬线，提供常规/斜体和 optical-size 轴，适合编辑与章节阅读。 |
| [bodoni-moda](bodoni-moda/README.md) | 高笔画对比的 Bodoni 拉丁衬线，提供常规与斜体、光学字号轴。用于足够大的展示字，避免极细小正文。 |
| [fraunces](fraunces/README.md) | 有机、有表达力的拉丁衬线，带 SOFT/WONK/opsz 等真实轴。不要任意发明 variation tag。 |
| [jetbrains-mono](jetbrains-mono/README.md) | 拉丁等宽字体，数字对齐、终端标签；不提供中文覆盖，不声称中文混排自动形成严格字符格。 |
| [caveat](caveat/README.md) | 拉丁手写风，400–700；短标题和批注，不用作长篇小字号正文，也不承接中文。 |
| [press-start-2p](press-start-2p/README.md) | 拉丁像素展示字体，400。短词和游戏标记；中文字必须另配真实中文像素字。 |
| [orbitron](orbitron/README.md) | 几何科技感拉丁展示字体，400–900。用于短标题，不用满篇小字号正文。 |
| [nunito-sans](nunito-sans/README.md) | 圆润亲和的拉丁无衬线，可变字重与宽度等轴。柔性风格标题/正文；中文仍需配套资源。 |

## 本地交付

- 原始 WOFF2 优先；其余保持上游 TTF，本轮不按页面文字裁字。
- CSS 使用 `NTF-<资源ID>` 别名和真实字重/字姿，不使用 local()。字体库加载时附带可直接用的 @font-face 声明；最终 CSS 的字体 URL 由宿主白名单复制到 `pages/assets/fonts/library/`。
- 英文资源优先放在混排栈前，汉字由中文资源承接。正文、标题和数字的用途分开；数字字体不取代已有数学引擎。
- 覆盖以实际字体 cmap 与浏览器渲染为准。没有字形则报告回退，不把“字体请求成功”当成“所有字已使用”。
- 资源库的体积不等于每页网络体积：run 只携带 CSS 明确引用的文件，浏览器只请求实际使用的 face。完整 CJK TTF 较大，这一版优先保留上游文件与授权，不增加子集编译链。

复现下载：`python3 -B vendor/fonts/fetch.py`。版本、SHA-256、文件字重、字姿与来源记录在 manifest.json；若已有文件不同则停止，不静默覆盖。

字体作者原始说明以每个资源目录的链接为准；字体搭配为项目设计判断，不冒称原海报字体识别结果。

