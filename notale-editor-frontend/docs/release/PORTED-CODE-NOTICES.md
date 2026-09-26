# 移植代码的许可声明

`docs/release/THIRD-PARTY-NOTICES.txt` 由 `npm run licenses:collect` 从**已安装的 npm 包**生成，
扫不到手工移植进仓库的代码，而且每次生成都会覆盖。所以凡是照着第三方源码写进本仓库的东西，
声明放在这里，手工维护。

---

## Beautiful UI — `ToolChips`

- 上游：https://www.beautifului.dev/ · https://github.com/slev12397/beautiful-ui
- 落地位置：`src/components/tool-chips.tsx`
- 移植了什么：组件结构——按行排列的工具调用（图标 / 标签 / 参数 chip）、每行可展开看它做了什么、
  末尾一条改动 chip 带悬停浮层。
- 没有移植什么：样式与依赖。上游是 Tailwind v4 叠一层 `foundation.css` 的 token，本仓库两者都没有，
  所有工具类都改写成了 `src/editor.css` 里的规则；悬停浮层的定位用本仓库已装的 `@floating-ui/dom`，
  没有搬它那套自己算视口翻转的代码。

```
MIT License

Copyright (c) 2026 Shane Levine

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
