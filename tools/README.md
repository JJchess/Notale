# 仍有消费者的共享工具

- `build-browser-contracts.mjs`：生成 `viewer/schema/*.browser.js`，供 `viewer/app.html` 使用。
- `render-check.mjs`：旧 viewer 的独立渲染检查，仍被 `viewer/tests/artboard-runtime.test.mjs` 引用。
- `lib/browser.mjs`：上述渲染检查使用的共享浏览器驱动。

这些不是当前 notale-v2 模型主链的一部分，但不能在保留 viewer 的同时直接删除。
旧原生模板工具已归入 [legacy/native-template-tools](../legacy/native-template-tools/README.md)。
