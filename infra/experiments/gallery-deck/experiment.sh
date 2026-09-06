# gallery-deck 实验:给最强模型一份画廊索引 + 一个 query,让它自由做一套课堂 slides,
# 录完整轨迹,反推 notale-v2 的 harness 该长什么样。
# 被 harness-kit/go.sh source,只声明变量。可用:EXP_DIR(本目录)、REPO。
EXP_NAME="gallery-deck"
EXP_PRESET="$EXP_DIR/preset"            # .claude/settings.json + GALLERY.md 与 pages/assets/lib(都软链到 exp/ref,jail 里可见)
EXP_TASK_DEFAULT="$EXP_DIR/tasks/ensemble-slides.md"
EXP_TASK_BUILD="$EXP_DIR/build-task.sh"  # go.sh --query "…" 时用它现做任务书
# jail 白名单:**整个家目录默认不可见**,只放行跑得起来必须的运行时,
# 加上被试该看的两处 —— exp/(工作目录 + ref 参考目录)和画廊的三个截图/源码目录。
# 这样 ws3、projects、services、work 这些别的仓库,以及 notale-v2、infra、
# 我自己的 scratchpad 和会话痕迹,在它眼里都不存在。
# 反过来说,少放行一个运行时它就起不来 —— 改这段之后必须重跑一次 claude -p 验证。
EXP_JAIL="--hide $HOME
          --keep $HOME/.claude --keep $HOME/.claude.json --keep $HOME/.config --keep $HOME/.cache
          --keep $HOME/.npm-global --keep $HOME/.npm --keep $HOME/.npmrc --keep $HOME/.local
          --keep $HOME/miniforge3 --keep $HOME/.condarc --keep $HOME/.bashrc --keep $HOME/.profile
          --keep $HOME/.gitconfig
          --keep $HOME/ws2/Notale/exp
          --keep $HOME/ws2/Notale/refs/quality/shots --keep $HOME/ws2/Notale/refs/quality/pudding
          --keep $HOME/ws2/Notale/refs/quality/codrops
          --hide /tmp/claude-1004
          --hide $HOME/.cache/claude-cli-nodejs --hide $HOME/.local/share/Trash"

EXP_WORK_DEFAULT="$HOME/ws2/Notale/exp/exp1"   # jail 白名单里的隔离目录;/exp/ 已 gitignore
