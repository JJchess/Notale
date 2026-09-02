# Workflow Skills Development Archive

这里保存不应进入 Builder 模型上下文、但仍需保留用于追溯和审计的材料。

- `sample-metadata/` 镜像原正式 sample 的相对路径，保存截图、server log、来源说明、许可副本、selfcheck、工具和上游研究材料。
- `retired-fixtures/` 保存被主题级 Planner fixture 取代的早期详细测例。
- `retired-references/` 保存已完成吸收、但不再作为独立运行时 reference 的文档。

正式 skill 位于 sibling `workflow-skills-next/build-*`。Agent 只通过各 skill 的 `samples/catalog.json` 和 `workflow-context` 读取列出的 author source；本目录不会被安装或注入。旧 sample verifier 会把 runtime tree 与这里的对应 metadata 合并后重建历史审计视图。
