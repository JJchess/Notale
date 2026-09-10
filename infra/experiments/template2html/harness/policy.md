你负责把输入 PPTX 模板做成可替换、可接入互动的 HTML 模板集合，持续实施到交付。
以下是教师首轮成功动作与修正中提炼的工作约束，不是固定阶段配额。

先读 `_harness/input.json` 和 `_harness/environment.json`。它们是宿主从本轮输入计算的事实；
`output/reference/` 如果存在，里面是本轮 LibreOffice/Poppler 参照。检查状态与字体差异，不假定参照完美。
输入 `input/template.pptx` 只读。先看参照与媒体图，再决定内容/装饰如何分离；
不要只看最终截图猜结构，也不要只看 XML 宣称视觉相同。

解析时从 presentation 顺序及 relationships 找到真实 slide→layout→master→theme，
保留 OOXML part 与 shape ID。几何须按输入尺寸换算；分别处理组坐标、图片裁剪、
渐变/透明度、占位符继承、段落层级。只实现本轮需要的特性可以，但所有忽略/不支持的特性须披露，不能静默丢弃。
空标题、留白和可选页脚保持原来的含义；模板提示词不应自动变成讲义内容。
除了展示页，给未使用布局建立对应及支持说明，并用填充内容检查图片槽、多级文字和竖排。

素材决策：保留可提取的独立原素材；简单原生图形用 HTML/CSS/SVG；可确定性恢复的矢量保留路径。
位图生成/编辑仅在实际需要且工具可用时调用，先查看参考素材，之后查看结果并在页面中验证。
保留提取路径或生成指令、参考图、结果、采用位置。不可把整页截图当作可替换模板。

交付接口沿用教师产物的字段名，使宿主可做独立检查：
- `output/reference/structure.json`：`size: [width,height]`, `slides`, `layouts`, `palette`。
- 每个模板含 `id`, `name`, `items`；item 保留 `source`, `id`, `box`, `kind`，以及适用的
  `slot`, `asset`, `crop`, `text`, `style`, `paragraphs`, `placeholder`, `fill`, `shape`。
- 展示页在 `output/slides/<id>.html`，布局页在 `output/layouts/<id>.html`。
- 浏览器提供 `PPTTemplate.render(container,id,values)`，返回 `slots`, `update(key,value)`, `destroy()`。
  文本替换使用字面字符串；Node 内容可承载交互；图片支持 `{src,alt,fit}`，明确保留原裁剪还是重置裁剪。
  每页主画布为一个 `.slide`；数据、DOM 和资源独立，不在接口中写死本次模板的页数或校名。

实现后在真实 Chromium 中渲染、查看原稿/HTML 同尺寸对照，测试替换、原生交互与恢复。
错误驱动局部修正：发现字体布局异常时量字符/段落边界并检查字体度量，不只是反复调 CSS；
字体修复只对确定有问题的字体进行，保留原件与脚本。未使用布局、图片替换后的 crop 和竖排需要实际检查。
保留检查程序、原稿参照、浏览器截图、素材来源和字体替代说明，提供至少两个复用状态和一个最小互动。

宿主会在你给出最终交付后执行独立检查，失败报告会作为新消息返回。
看到失败时检查具体对象并修正，不通过更改报告或隐藏内容来消除失败。
完成的报告需要区分已经验证、已知限制与尚未检查；工具错误不等于最终任务失败，可检查原因后继续。
