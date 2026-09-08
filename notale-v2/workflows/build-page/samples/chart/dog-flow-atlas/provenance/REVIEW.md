# 它从哪里来？

状态：pending-user-review；promoted: false。

原作：https://pudding.cool/2019/10/shelters/ 。源码完整浅克隆：`../../sources/shelters/`，https://github.com/the-pudding/shelters ，commit `bbe729319a03d050090eae8defae85272d146725`。

## 原作研究

亲自查看原作 `../../evidence/shelters/original-3600.png` 的纽约来源分组：每只狗一个品种图像，来源地按数量排序。实际切换 Washington / imports 并悬停首只狗，在 `washington-hover.png` 看到 Rebel 的年龄、性别与品种，以及 Texas 125、California 108、South Korea 43 等原分组。

研究 `exported-dogs.js` 与 `pudding-chart/exports-template.js`：根据 final_state 或 original_state 过滤；按另一端地点分组，数量降序；组内按 file 排序；mix 映射 labrador.png；姓名去除括号和 Adopted/Pending 等标记。复用这些规则及原记录，重写为可独立静态运行的原生 DOM 页面。

## 素材与范围

完整复制 exportedDogs.csv 的 2,460 条、10 个原字段，以及 importExport.csv 中 inUS=true 的 51 个州/特区名称。派生 data.json 仅把 CSV 解码成 JSON，全部行及字段逐项一致。复制全部 50 张 profiles 原 PNG，展示时使用原 file 对应图像，包括原 mix→labrador 回退。没有 SVG 重绘、抽样或把狗图替换成点/柱。保留上游 LICENSE，图像与数据来源在 assets.json 中逐项列出。

独立模块覆盖原文 Imported and Exported Dogs 个体流向图，不包括开篇地图、跨州路径动画及后续国家统计。初始完整显示前三个分组，展开可见全部；总数始终表示该州该方向的全部记录。用户切州时保留所选方向，因而无记录的组合也能直接检查；原文会自动偏向有记录的方向。

详情由原悬浮框变为可固定阅读的侧栏，保留姓名、年龄、性别、品种，补上数据原有的体型、ID 和来去方向。点击、键盘聚焦和悬停均可查看；键盘焦点在狗按钮时，鼠标偶然经过其他狗不会覆盖所选详情。手机点击后滚到上方详情，reduced-motion 下立即滚动。名字仍按原清洗规则处理，额外 trim 首尾空白。

图标是按推测主要品种选取的插画，并不是对应个体照片。页面明确为 2019-09-20 历史数据，未提供当前领养入口；原研究有部分“匹配批准后才运输”的记录，因此不宣称全部实际旅程已完成。

## 复核

`node ../../tools/check-dog-flows.cjs` 在 1600×900、1280×720、390×844 下对全部 51×2=102 个州/方向组合分别过滤和展开，实际页面狗 ID 的完整多重集合与原数据严格相同，无漏项。检查空结果、总数、键盘个体详情、无页面异常和水平溢出。Washington imports 为 334 条；前三组为 125、108、43，全部 15 个来源可展开。

50 张原 PNG 全部浏览器解码成功，52 个原图/CSV 文件逐字节和 SHA-256 与克隆件一致，派生 JSON 全部行与源 CSV 一致且有哈希。结果在 `../../evidence/dog-flows-candidate-checks.json`，截图在 `shots/`。

亲自查看桌面整页和手机选中 Rebel 状态：原品种轮廓/颜色与逐个计数保持，侧栏保留真实个体字段；随后修正键盘选中项受到悬停遮淡的情况。检查验证数据重现，不独立核实每条原 PetFinder 描述或历史运输是否发生。
