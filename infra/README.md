# infra —— Claude Code 轨迹采集台

从 `~/work/Motale/infra` 迁来(2026-09-06)。`harness-kit/` 领域无关,`experiments/` 按实验放定义。
方法论见 `harness-kit/METHOD.md`。

## 一行命令

```bash
~/ws2/Notale/infra/harness-kit/go.sh --auto                       # 默认任务书(集成学习),分屏:左监控 右 claude
~/ws2/Notale/infra/harness-kit/go.sh --auto --task experiments/gallery-deck/tasks/shiji.md
~/ws2/Notale/infra/harness-kit/go.sh --auto --query "《傅里叶变换》
读者:……
场合:……
时长:45 分钟。"                                                    # 现做一份任务书
```

做完在 claude 里 `/exit`,脚本接着归档、脱敏、算钱、抽思考、量轨迹。
产物在 `harness-kit/runs/<label>*`(不入库):

| 文件 | 内容 |
|---|---|
| `<label>/NNNN-*.json` | 每次 API 调用的完整请求+响应(proxy 抓的) |
| `<label>.session.jsonl` | Claude Code 自己的 transcript;子 agent 在 `<label>.session/subagents/` |
| `<label>.deliverable/` | 被试工作目录的快照(pages/ 等) |
| `<label>.thinking.md` `<label>.trajectory.txt` | 思考全文 / 七问测量 |

回看:`python3 harness-kit/capture/view.py harness-kit/runs/<label> --transcript`。

## 隔离

被试跑在 `capture/jail.sh` 造的文件系统视图里(Linux 用户命名空间,不需要 root)。
**整个家目录默认不可见**,只放行跑得起来必须的运行时(`.claude`、`.npm-global`、`.local`、
`miniforge3`、`.cache` 等)和两处内容:`~/ws2/Notale/exp/`(工作目录 + `ref/` 参考目录)、
`refs/quality/` 的 shots、pudding、codrops。白名单写在实验定义的 `EXP_JAIL` 里。
go.sh 另外加固家目录:盖掉 `.claude` 下 file-history、sessions、plans、paste-cache、
shell-snapshots、skills、plugins 等会话痕迹,并把 `~/.claude.json`(记着 21 个项目路径)、
`settings.json`、`history.jsonl`、`projects/` 换成本轮的干净副本 —— 副本落在
`runs/<label>.home/` 和 `runs/<label>.projects/`,被试的 transcript 就从后者归档。
每轮结束跑 `measure/leaks.py` 复查轨迹里有没有碰到白名单外的路径 —— 第一道是它看不见,第二道是证明它没看见。

## gallery-deck 实验

被试 = Opus 5 / effort medium(`preset/.claude/settings.json` 钉死),工作目录 `~/ws2/Notale/exp/exp1`(gitignore 的 /exp/,祖先链无 CLAUDE.md)。
铺进去的东西:`GALLERY.md`(→ `refs/quality/INDEX.md`,204 条参照的截图/网址/源码绝对路径)、
`pages/assets/`(→ `notale-v2/vendor/chassis`)。preset 里是软链,reset 原样带过去,被试顺链接读最新版。
画廊或底盘更新后不用改 preset;`INDEX.md` 由 `refs/quality/build_catalog.py` 重生成。

Opus 5 在 `measure/price.py` 的价目表里,成本会照实算。
