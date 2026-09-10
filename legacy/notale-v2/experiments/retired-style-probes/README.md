# 固定历史实验脚本

2026-09-10 从 `notale-v2/scripts/` 移入；归档前 baseline：`7c3fcea4`。

- `style_smoke.py` / `style_audit.py`：固定三页和风格组合的生成、操作与截图检查。
- `style_detail_smoke.py` / `style_detail_audit.py`：固定字体、风格详情实验及审计。
- `style_visual_probe.py`：绑定旧 commit 和参考 run 的视觉消融。
- `setup_nn11_ablation.py` / `strip_skills.py`：历史 nn11 和 skill 指派消融。

脚本内容保持原样；其中相对路径、import 和原始输入属于当时环境，不承诺在归档位置直接运行。需要复现时恢复 baseline。历史报告和产物不改写。

后续整理：`style_e2e.py` 及其模型配置测试也已归档至 `../../auxiliary/`，不再作为当前入口。
