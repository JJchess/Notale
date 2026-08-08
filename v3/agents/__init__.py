"""v3 的 agent 层：OpenHarness 底座上的薄封装（spike GO，见 docs/openharness-spike.md）。

- base.py：AgentProfile / AgentBase / AgentResult + skill 块渲染；
- fetch_web.py：FetchWebTool——出处绑定纪律的落点（抓取即落 FetchRecord，模型摸不到）；
- profiles.py：声明式画像（RESEARCH / BUILDER）。

只用 spike 验证过的窄路径：QueryEngine + ToolRegistry + FULL_AUTO PermissionChecker +
OpenAICompatibleClient。不碰 TUI/swarm/SkillTool/会话记忆。测试注入实现
SupportsStreamingMessages 的 fake client（openharness/api/client.py:79），全程离线。
"""
