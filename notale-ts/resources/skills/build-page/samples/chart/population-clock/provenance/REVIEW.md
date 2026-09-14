# 此刻，一座城 · Population Clock

状态：**pending-user-review / promoted: false**。只在备选库，等待用户最终统一 review。

原作：[Data Clocks / Populations](https://pudding.cool/projects/clocks/populations)，Russell Samora，2023。源码：[the-pudding/clocks](https://github.com/the-pudding/clocks)，已完整浅克隆，固定 `eb7e3d5fa4fd25fc48b0577427cdb6951b0ae1fb`。未修改上游工作树。

## 实际视觉判断

亲自查看在线目录、新闻时钟及人口时钟。人口时钟的黑底、大号 Rubik 900 洋红数字、淡色 AM/PM、完整地名，构成清晰的文字视觉实验；没有照片素材被省略。实际点击 Refresh place 并切浅色，看到 631 人、Columbus, Wisconsin 的状态。见 [深色原作](../../evidence/clocks/populations.png)、[浅色原作](../../evidence/clocks/populations-light.png)。脚本曾尝试 `time=12-59` URL，但在线页面实际仍是 6:31 PM；文件名中的 1259 不能作为成功覆盖时间的证据。

亲自查看本地 1600×900 深色和 390×844 浅色截图：保留原字体、数字字号规则、文字层次和完整地名；手机状态仍可完整阅读并操作。适合作为“时间输入 → 真实记录 → 排版结果”的完整 mini。

## 保留及改动

- 全部 **8,664 条原人口记录**，原 CSV 字节不变；JSON 只是逐字段、逐行无损转换。数据为原仓库快照，不冒充当前人口估计。
- 保留 `+(h + mm)` 的十二小时制数值匹配，以及原三级筛选：先去 type `s`（township），再去 type `u`（unincorporated）；若某级为空则回退。720 个时间组合都有结果。AM/PM 不影响匹配人口。
- 原 `Clock.Populations.svelte` 的布局机制与 Rubik regular / 700 / 900 字体继续使用，字号采用原 `clamp(24px, 4vmin, 64px)` 与数字 2em，深色主色 `#f20099`、浅色 `#d00084`。原核心就是 DOM 字体排版，没有用 SVG 代替图像。
- 原 Google Maps 地名＋县＋州链接保持。
- 原实时时钟按 250ms 检查；mini 仅在分钟改变时换记录，默认跟随设备本地时间。
- 初次匹配继续随机选一个；手动“换一座城”改为遍历候选而非可能重复抽中同一个，增加反向切换。完整同人口列表可定位任意记录，保留县信息区分同名城镇。
- 新增时间输入、回到实时、深浅色切换、原 CSV 下载；没有删减人口时钟的数据范围。歌曲、YouTube、实时新闻属于原作其他实验，未宣称已经迁移。

## 验证

运行 `node experiments/pudding-samples/tools/check-population-clock.cjs`。三种视口：1600×900、900×900、390×844。

- 每种视口逐一核对 720 个时刻的完整候选集合与原筛选规则；无空集合。
- 浏览器受控时间跨分钟真实驱动定时器；手动选时后不再跟随，返回实时后恢复推进。午夜显示 12xx AM。
- 前后切换、列表选择、Escape 关闭、深浅色、页面无横向溢出及无 JS 异常。
- 原 CSV 与 JSON 8,664 行全部逐字段相等；源文件及字体 SHA-256 核对。见 [结果](../../evidence/population-clock-candidate-checks.json) 与 [素材清单](assets.json)。

原页面截图中 6:29 对应 13 个筛选后候选，本地同样 13 个。人口数不是距离最近的近似匹配：必须严格等于时间整数；“Approximately”沿用原作人口表述。

## 来源

保留上游 `LICENSE.source`。字体使用原 `src/styles/font.css` 指向的 Pudding Rubik WOFF2，本地保存并记录来源哈希。原作数据归因：[US Cities List](https://www.uscitieslist.org/) 与 [Wikipedia](https://en.wikipedia.org/wiki/Category:Unincorporated_communities_in_the_United_States_by_county)。来源归因沿用原作，不表示此次重新采集了人口数据。
