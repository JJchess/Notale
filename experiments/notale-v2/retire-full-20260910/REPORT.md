# Mini 独立运行 / Full 归档交付

日期：2026-09-10

## 结果

- 正式 workflows 仅注册 51 个视觉 mini 和 1 个代码 one 示例；Main / aux 不再有 full 候选。
- 52 份 full 源码和 bundle 已移至 `legacy/full-samples/`，原件保留、可恢复。正式 bundle 生成器不会重新生成 full。
- `--samples` 仅保留 `mini` / `none`；默认 mini 与辅助样本配置不变，无 mini → full 回退。
- 七个原本共用源码目录的视觉样本保留原入口，但使用独立文件副本；代码示例仅保留 edit-distance 作者层。未改 mini 的运行代码、算法或样式。
- 样本截图工具、正式画廊和 mini 画廊均改读 mini。旧参考图归档，51 份现用参考图由 mini 重新生成；13 组过时截图动作更新为 mini 的实际控件，定时状态也已捕获。
- 历史实验与运行记录不清理；其中的 full 引用不属于当前 harness 的选样和加载路径。没有新增模型调用或运行门禁。

## 验证

- 归档原件 4,857 个文件、保留的 mini 运行文件 5,093 个，均与迁移前 SHA-256 一致；独立副本不与归档共享 inode。
- 正式 full bundle：0；归档 full bundle：52；正式 mini / one bundle：52，全部与生成结果一致。
- `core.test_skills` 与 `core.test_builder` 合并运行：63 项通过；随后新增 mini-only 截图 staging 测试单独通过，并复测 bundle 一致性。
- 只开放 workflows、未挂载 legacy 的浏览器验证：51/51 页面加载和登记截图状态通过，无资源 HTTP 错误或页面运行异常。51 份联系图和对应状态截图数量、尺寸检查通过。
- 正式画廊 29 个入口、mini 画廊 51 个入口均存在；相关文件 diff 空白检查及预览服务器 JS 语法检查通过。

本轮验证运行独立性与登记状态，不声称重新穷举所有交互；运行文件未变，沿用此前功能验收。未运行付费 Builder 实验，未提交 commit。

证据：同目录 `browser.json`；归档目录 `migration.json`；测试日志 `/tmp/notale-retire-full-tests.log`。
