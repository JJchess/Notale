# 历史本地库缓存

2026-09-10 从 Notale 根目录 `vendor/` 完整迁入；40 个文件迁移前后 SHA-256 一致，随后仅补充本说明。当前 harness 使用 `notale-v2/vendor/`，没有改动该目录；viewer 和编辑器各自的 vendor 也保留原位。

以下为历史用法，不代表当前依赖入口。

本地库缓存。全部是 UMD/IIFE 构建,已实测可通过 `file://` 直接加载,无需静态服务器。

用法:把需要的文件复制到 `pages/assets/`,然后 `<script src="assets/xxx.js"></script>`。
先加载依赖再加载被依赖者(vanta 需要先加载 three)。

| 文件 | 全局对象 | 用途 |
|---|---|---|
| matter.min.js | `Matter` | 2D 物理引擎:碰撞、约束、关节、拖拽 |
| three.min.js | `THREE` | 3D 渲染 |
| globe.gl.min.js | `Globe` | 3D 地球(需先加载 three) |
| vanta.net.min.js | `VANTA` | 动画背景(需先加载 three) |
| d3.min.js | `d3` | 数据可视化 / SVG 精确控制 |
| pixi.min.js | `PIXI` | 2D WebGL 批量渲染 |
| anime.min.js | `anime` | 时间线动画 / SVG 描线 / morph |
| gsap.min.js | `gsap` | 时间线动画 |
| ScrollTrigger.min.js | `ScrollTrigger` | 滚动驱动(需先加载 gsap) |
| lottie.min.js | `lottie` | JSON 矢量动画播放 |
| zdog.min.js | `Zdog` | 伪 3D 插画 |
| vanilla-tilt.min.js | `VanillaTilt` | 指针倾斜视差 |
| aos.js | `AOS` | 进入视口渐显 |
