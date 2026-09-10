# 草坪路径互动 Demo

一个 Canvas 小游戏：玩家需要绕开石块，走遍 8×8 草坪中的 49 个可用方格，再把自己的路线与最少 48 次移动的路径进行比较。

画幅是 **1600×900 的定尺逻辑画布**，整页等比缩放铺满视口，没有滚动。三段内容是三整幕，
由 GSAP 时间线切换：开场 → 游玩 → 结果。

## 本地运行

```bash
python3 demos/lawn-path/serve.py        # 默认 4175
```

然后访问 <http://127.0.0.1:4175/>。

页面里的资源全用 `./` 相对路径，所以从仓库根目录起服务也能开，地址是
<http://127.0.0.1:4175/demos/lawn-path/>；只是那样没有下面这条 no-store，改完文件要靠
`index.html` 里资源 URL 上的 `?v=N` 顶着（改一次就把它加一）。

用 `serve.py` 而不是 `python3 -m http.server`：后者只发 `Last-Modified`，浏览器会按启发式
规则自己决定缓存多久、连 304 都不问，改完文件刷新看到的还是旧样式，看上去像版式全崩。
`serve.py` 只多做一件事——每个响应带 `Cache-Control: no-store`。

键盘方向键、屏幕方向键和在草坪上滑动都可以控制割草机。

## 合成单文件

```bash
python3 demos/lawn-path/build.py          # 可读版 + 行号地图（默认）
python3 demos/lawn-path/build.py --min    # 压缩版，输出 lawn-path.min.html
```

默认产物 `lawn-path.html`（约 27,900 字符 / 1,006 行）把 `styles.css` 和 `app.js`
**逐字原样**内联进来：注释、缩进、真实类名和变量名全部保留。它是给人和模型读的范例，
压缩会把范例仅有的价值（有意义的名字 + 解释为什么的注释）恰好压掉。

整份读一次约 8,500 token，太贵，所以同时生成一张**行号地图**——写在文件开头的注释里，
另存一份 `MAP.md`（504 字符）供 SKILL.md 内联。想学换幕怎么写就只读 L830-L883
（1,643 字符，约 500 token），不必整份读进上下文。

地图的行号由构建时按源文件里已有的分节注释算出，**从不手写**；标记找不到就构建失败，
因为错的地图比没有地图更糟——模型会照着去读错的行，而页面本身跑得好好的，
截图比对和交互用例都发现不了。`check.py` 里有一条专门核对地图的判据。

`assets/` 下面那三个是拷来的底盘和 GSAP，仍按外部链接引用（环境常备资源，不随这一页改），
所以产物要和 `assets/` 放在一起用。

`--min` 的压缩版（15,257 字符）只在需要小体积部署时用，**不适合当范例**。

## 自检

```bash
python3 demos/lawn-path/check.py                    # 测拆开的 index.html
python3 demos/lawn-path/check.py lawn-path.html     # 测合成的单文件（含地图核对）
```

会用无头 chromium 真跑一遍：三幕切换、键盘/dpad/滑动、走满 49 格自动进结果幕、
重复格的底色与图注、读屏用的实时状态、canvas 采样率（dpr 1 与 2）、reduced-motion、
换幕不叠幕、被打断后不丢幕、各幕在舞台里对称、无 JS 报错、无滚动。

## 结构

| 文件 | 说明 |
|---|---|
| `index.html` | `#stage` + 三幕 |
| `styles.css` | 这一页自己的视觉；尺寸全是 1600×900 里的固定 px，不用 vw/clamp |
| `app.js` | 场景机、割草逻辑、像素美术绘制（美术坐标固定 512，显示尺寸交给 CSS） |
| `assets/base.css`、`assets/base.js` | 从 `notale-v2/vendor/chassis/` 拷来的底盘：定尺缩放、`Deck.fit`、`Deck.pt`。不要就地改，要改回上游改 |
| `assets/lib/gsap.min.js` | 换幕与路线生长的时间线 |
