做一份 《集成学习——机器学习教程第八讲》 的 HTML 原生 slides。读者是修这门课的本科生,课堂授课、教师带着讲,时长 90 分钟,页数由你定。

要求:
1. 具备 slides 应有的基本动画效果。
2. 加入必要的动画演示和交互,帮助听众理解。
3. 有必要的代码实操页:听众在页面里编辑并运行代码。做法参照 build-code 这个 workflow:`~/ws2/Notale/exp/ref/build-code/`(SKILL.md、references/、samples/),页面模板在 `~/ws2/Notale/exp/ref/code-workbench/`。其中的 `CodeScaffold` 工具这里没有。
4. 每一页的设计质量都要达到 `GALLERY.md` 索引的质量画廊的水准。每页动手之前,从画廊里选一条作为这一页的强参考,看它的原貌或源码,并在该页 HTML 开头的注释里写明选了哪一条、取了它什么;只当标尺,不抄题材、文案、图片和配色。

环境:
- 输出到 `pages/page-01.html`、`page-02.html`…,每页一个独立 HTML,资源用 `pages/` 下的相对路径,不用 CDN。
- 每页是一个不可滚动的整屏,画面填满视口。`pages/assets/lib/` 已放好一批常用库,见 `lib/LIBS.md`;可用的库不限于这些。
- 只交付 `pages/` 下的文件。
