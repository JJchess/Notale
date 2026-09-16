# PPTX → HTML 确定性转换器

运行期零模型调用。使用 LibreOffice 的 OOXML 导入和原生演示文稿 SVG 导出，
按页面/母版关联解析为独立 HTML。原文字保留为 SVG text/tspan，图形保留为矢量节点，
图片独立提取并去重；没有整页截图、编辑器、课程内容或互动示例。

## 运行

依赖：Python 3.11+、LibreOffice、系统 Python 的 `python3-uno`、fontconfig 和 `fonttools[woff]`。
本机已具备这些依赖。Ubuntu/Debian 可安装 `libreoffice-impress python3-uno fontconfig`，
Python 依赖见 requirements.txt。

在 notale-v2 下运行：

```bash
python3 pptx2html-converter/convert.py \
  '../秀钟书院特色课程PPT模板-课程名称在母版视图修改.pptx' \
  --output pptx2html-converter/build/my-template
```

`--output` 必须是新路径，防止覆盖既有模板；不传时默认使用本目录 `build/<输入文件名>/`。
`--uno-python` 可指定有 UNO 模块的 Python，默认 `/usr/bin/python3`。
不读取 API key，不访问模型接口；通过独立 LibreOffice profile 和本地 pipe 执行，原件只读加载。

交付目录仅包含：

```text
my-template/
  index.html           原页按顺序排列，无额外界面
  slide-01.html …       每页独立入口
  template.css
  assets/              实际引用的图片与字体子集
my-template.zip         可直接下载的纯模板包
my-template.report.json 转换信息和字体替代记录，不进入下载包
```

解压后直接打开 index.html 或单页文件。文字可修改 SVG text/tspan，图片通过 image 的引用独立替换；
空占位区域保留为带 data-placeholder 的空 DOM 容器。这里的“可替换”是代码/DOM 可操作，不提供所见即所得编辑器。
字体子集固定本次出现的字符；添加新文字时需要提供覆盖新字符的字体或重建子集。

## 已处理的兼容问题与边界

- 使用演示文稿 SVG 导出保留对象层级，避免 GraphicExportFilter 将色带移到徽标前方。
- 从 PPTX XML 读取可唯一匹配的线性 RGB 渐变透明度，修正 LibreOffice 原生 SVG 透明度 mask 的偏差。
- 使用原 PPTX 画布尺寸；为每页 SVG 定义加唯一前缀，避免合并浏览时的裁切/渐变 ID 冲突。
- 字体按本机解析结果生成 WOFF2 子集，替代情况写在报告中；禁止嵌入/禁止子集的字体不会被打包。
- 这是静态模板转换，动画、视频播放及图表交互没有移植。仅转换展示页，不额外交付未使用的母版版式。
- 保真以 LibreOffice 的导入结果为基础，不能保证所有 PPTX 与 Microsoft PowerPoint 像素一致。
  字体缺失、复杂 Office 特效仍可能产生差异；渐变颜色签名存在不同透明度的歧义时不猜测覆盖。
- 相同输入、LibreOffice 版本和字体环境下输出应一致；ZIP 固定排序和时间戳，方便哈希比较。

## 当前样本

[7 页纯模板预览](build/xiuzhong-final/index.html) · [下载 ZIP](build/xiuzhong-final.zip) · [转换报告](build/xiuzhong-final.report.json)

本机转换约 4.4 秒，零模型调用。抽查封面、章节页、内容页；保留原件留白和原有文字。
已知字体替代：黑体 → 文泉驿正黑。原 Gemini 实验仍保留在相邻的 pptx2html-harness 中。
独立进程重复转换的 17 个交付文件及 ZIP 均逐字节一致；原输入未修改，已有输出拒绝覆盖。
下载包约 9.9 MB，含 7 个单页 HTML、纯模板总览、CSS、图片及字体，不含检查资料或运行脚本。

```bash
cd pptx2html-converter
python3 -m unittest -q test_convert
```
