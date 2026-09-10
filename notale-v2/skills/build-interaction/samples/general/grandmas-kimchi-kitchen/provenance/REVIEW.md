# Grandma’s kitchen / 1996

状态：pending-user-review；未正式入库。2026-09-07。

原作：[The search for my kimchi](https://pudding.cool/2023/05/kimchi/)，Alvin Chang / The Pudding，2023。
完整仓库：https://github.com/the-pudding/kimchi ，commit `d03daab2f4b59e6cffa5ec15a597c0c838671436`。本地完整克隆在 `../../sources/kimchi`（不提交）。MIT 原文见 `upstream/LICENSE`；依赖许可见 `THIRD-PARTY-LICENSES.txt`。字体与插画保留作者来源，不另行宣称独立授权。

## 为什么保留

将家庭记忆放进可探索厨房，物件既是食材也是照片、书和统计图的入口。25 个原场景记录组成分层房间；原 PNG、人物动作、三组放大图的桌面/手机版原 SVG、原字体与 Tone 程序配乐均保留。SVG 是原作文件，未用重绘图替代栅格素材。

边界为完整 1996 章节：可选的 12 段开场、厨房探索与四种食材收集、11 段品尝收尾。默认进入厨房，原作六秒收集收尾等待仍在。章节结束后提供原作后续年代链接，不将本地结尾冒充完整文章。

## 原作与本地视觉复核

已亲自查看实际渲染：`../../evidence/kimchi/original-top.png`、`kitchen.png`、`poster.png`、`original-taste.png`。厨房层次、营养图和品尝文字/动态背景均以实际页面为准。本地桌面和手机厨房、手机品尝画面也已亲自查看，见 `shots/`。手机保持原横向探索方式。

## 提取与适配

保留原 scene / prescene / cutscene / sound 组件及完整 copy.json；未经修改的组件存于 upstream。68 个原文件的 SHA-256 列于 assets.json：64 个仓库文件与 4 个原站字体。放大图只将字体 URL 改为本地路径，修改前 SVG 单独存档并校验。

独立外壳增加开场、重来和章节终点；图片模态框补充名称、关闭按钮、Escape 和焦点返回。原全局 preventDefault 改为仅处理相应按键，删除重复 keyup 推进，避免阻止 Tab 或一次操作跳两段。食材按钮采用 currentTarget，防止点到内层图片时丢失索引。场景计时器销毁清理，文字延迟访问加空值保护。声音需用户启动 AudioContext，静音释放音符，页面隐藏关闭声音；保留原旋律、音色、节拍及章节选择逻辑（包括原组件共享的 randFromArray 行为）。原 P5 动态背景仍在运行。

## 验证

`node experiments/pudding-samples/tools/check-kimchi-kitchen.cjs`：1440、768、390 三种屏宽；25 层图像解码、三个放大入口键盘打开/关闭、照片查看、四食材、品尝/重来/开场全部走通；无页面错误、外部运行请求或页面横向溢出；68 文件哈希通过。记录在 `../../evidence/kimchi/local-checks.json`。

`check-kimchi-audio.cjs`：点击开启后通过真实 Web Audio 输出分析器检测非零信号，关闭后为零，无页面错误。记录 `audio-check.json`。这是信号验证，不宣称人工听音评价。

构建：`npm ci && npm run build`（Svelte 3 / Vite 4，锁定依赖）；静态入口 index.html，资源 build/ 与 assets/。当前已构建，可直接从候选库打开。
