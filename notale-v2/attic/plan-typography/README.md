# 从 harness 拿掉的 plan-typography

`SKILL.md` / `references/projected-type-system.md` / `references/cjk-numeric-math.md` / `agents/openai.yaml`

实测 wf2 那轮 21 页的真实路由：`字号地板 16/14/12 只有 plan-typography 写了 —— 0/21`，
那一轮 planner 一次都没路由到它（`core/skills.py` 里那条注释记录的原始数据）。

字号地板本身不受影响：那三个数字已经在 `CONTRACT.md` 里对每页强制生效，21/21 页实测
都读到，不依赖这里的路由。真正打不到的是这份文档里更深的那部分——中英文数字公式
混排断行、role-based 字号 token、标签依附规则——这些只有被路由到才会用上。

问题不在内容质量，在决策时机放错了层：planner 工作时页面正文还没写出来，没有实际的
中英文数字混排文本、没有实际标题长度，要它预判"这页的难点会是排版"等于要求它预测
一个此刻还观察不到的失败模式。真正能看到"这页排版是不是难点"的时机是 build-page
渲染过一次之后，那是 builder 的工作范围，不是 planner 的。

留着是为了对照，不要引用。如果要恢复，正确的做法不是把它塞回 planner 的九选一列表，
而是参照 build-page 合并 build-motion 时用过的模式——在 build-page 内部加一个触发
步骤（"这页的正文实际出现中英文数字公式混排/标题过长/字号贴地板时，现场加载这两份
reference"），把判断挪到 build 阶段、挪到正文已经写出来之后。
