# 口袋，装得下吗？

状态：pending-user-review；promoted: false。

原作：https://pudding.cool/2018/08/pockets/ 。完整源码浅克隆：`../../sources/pockets/`，https://github.com/the-pudding/pockets ，commit `afc0a8d4ae50f2ea22dd5796141d80866821ae63`。

## 原作视觉研究

亲自查看 `../../evidence/pockets/original-4600.png` 的平均口袋、七项原物品和品牌筛选；查看 `original-6200.png` 的不同版型叠层；实际选择 iPhone X 并筛选 Uniqlo，查看 `iphone-uniqlo.png`，确认原作显示女款 40%、男款 100%，Uniqlo 女款直筒可装入、紧身变淡。此次提取品牌口袋的物品容纳对照表，而非整篇叙事和平均口袋动画。

## 源码与素材

研究 `src/js/fit.js`、`load-data.js` 和 `pudding-chart/fit-template.js`：原样本 80 条、男女款各 40 条，品牌/价格/版型过滤，基于开口宽度和预计算矩形判断装入，物品沿矩形原坐标及角度摆放。直接使用完整 `measurementsRectangles.json`、7 张原 PNG 和上游 D3+Jetpack vendor。原口袋本来就是根据测量生成的 SVG 路径；mini 直接运行原 `fit-template.js` 的全部绘图和判定函数。SVG image 节点引用原 PNG，未用重画的矢量图替换物品。

唯一引擎调整：固定内部 chartWidth 为原桌面 225，而非让窗口宽度改变横纵转换比例。手机通过单列排布适配；因此所有屏幕上的判定和物品坐标保持原桌面结果。`prepare-pockets.py` 可重复制源文件并施加这一处调整；`assets.json` 记录所有原件 SHA-256、来源和适配后引擎哈希。上游 LICENSE 与 vendor 许可单独保留。

新增独立中文页面、可键盘操作的物品按钮、前 4 项/全部展开、带原绘图和厘米值的原生详情弹窗。原测量标签仍为原作英寸。总体比例始终按每类全部 40 条样本计算，与原作一致；筛选仅控制列表，页面注明“原样本总体”。重复选择同一物品取消高亮。清除筛选保留物品选择。

价格和设备型号明确属于 2018 年数据，不作为当前购物建议。手的完整原图包含手指，原判定使用其源码中的手部矩形尺寸；没有自行改成“整只手可放入”或宣称真实穿着情况下必然装得下。

## 复核

`node ../../tools/check-pockets.cjs` 从在线原作提取七种物品的全部 80 条实际渲染状态，按性别/品牌/款名匹配，并在 1600×900、1280×720、390×844 三种视口逐条比较：口袋 path d、是否变淡、原 PNG width/height/transform 全部严格一致。原作状态保存在 `../../evidence/pockets/source-fit-states.json`。

另检查 80 条完整性、全部 7 PNG 解码、Uniqlo 筛选、空结果、复位、8/80 条展开收起、键盘 Enter 打开详情和 Escape 关闭、取消物品后清空叠图、无页面错误和水平溢出。结果见 `../../evidence/pockets-candidate-checks.json`。

亲自查看本地桌面完整页面、桌面详情和 390 宽手机详情：原测量曲线和手机 PNG 保持对应，未裁掉图像。截图在 `shots/`。逐文件对照原仓库与哈希通过。测试证明复现上游判定，不独立证明上游矩形算法对真实衣物的物理适用性。
