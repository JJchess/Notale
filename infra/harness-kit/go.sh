#!/usr/bin/env bash
# 跑一轮实验。**你只需要这一个脚本。**
#
#   ./go.sh                      # 就这样。label 自动取下一个序号,分屏自动开
#   ./go.sh fourier-03           # 想自己起名
#   ./go.sh --exp compiler       # 有多个实验时指定
#   ./go.sh --auto               # 任务书自动发进去,不用粘
#   ./go.sh --query "《史记》…"   # 用实验的 build-task.sh 现做一份任务书(可多行)
#   ./go.sh --task tasks/x.md    # 指定现成任务书
#   ./go.sh --no-split           # 不要分屏,单窗口
#
# 只有一个实验时 --exp 可省;有 tmux 就默认分屏(左监控 右 claude)。
#
# 一条命令走完:
#
#   重置工作目录 → 起监听和静态服务器 → 起 claude(同一个终端,完整界面)
#   → 你在里面正常对话 → 退出后自动归档、脱敏、判据闸、测量
#
# 两种模式都是**同一个交互界面**,你全程看得见它在干什么。
# --auto 只是替你把第一条消息打好发出去,不是无界面的 -p 模式。
#
# proxy 地址烧在工作目录的 .claude/settings.json 里,不用设环境变量 ——
# 反过来说**监听没起的时候那个目录里的 claude 连不上**,
# 所以不存在"忘了开采集就跑了一轮"这种事。
#
# 全程不动 ~/.claude,你自己的会话不受影响。
set -uo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }
die() { printf "\n\033[31m✗ %s\033[0m\n" "$*"; exit 1; }
AUTOSEND=""; EXP=""; SPLIT="auto"; QUERY=""; TASK_OPT=""
_args=()
_take=""
for a in "$@"; do
  if [[ -n "$_take" ]]; then printf -v "$_take" '%s' "$a"; _take=""; continue; fi
  case "$a" in
    --auto) AUTOSEND=1 ;;
    --split)    SPLIT=1 ;;
    --no-split) SPLIT="" ;;
    --exp)  _take=EXP ;;
    --exp=*) EXP="${a#--exp=}" ;;
    --query) _take=QUERY ;;
    --query=*) QUERY="${a#--query=}" ;;
    --task) _take=TASK_OPT ;;
    --task=*) TASK_OPT="${a#--task=}" ;;
    *) _args+=("$a") ;;
  esac
done
set -- "${_args[@]}"

LABEL="${1:-}"
RUNS="${RUNS:-$KIT/runs}"

# ── 载入实验定义 ──────────────────────────────────────────────────────────
# harness 是领域无关的;preset、任务书、判据闸这些都是**实验**的属性。
# experiments/ 永远是 harness-kit 的兄弟目录。
EXPS="$(cd "$KIT/.." && pwd)/experiments"
# REPO 是给 experiment.sh 用的「仓库根」(materials、PRODUCT-FORM 在那儿)。
# 正式布局下就是 harness-kit 的上一级;暂存/测试时可用 REPO=… 覆盖。
REPO="${REPO:-$(cd "$KIT/.." && pwd)}"
if [[ -z "$EXP" ]]; then
  # _ 开头的是模板,不算候选
  found=()
  for e in "$EXPS"/*/experiment.sh; do
    [[ -f "$e" ]] || continue
    [[ "$(basename "$(dirname "$e")")" == _* ]] && continue
    found+=("$e")
  done
  if (( ${#found[@]} == 1 )); then
    EXP="$(basename "$(dirname "${found[0]}")")"
  else
    die "有 ${#found[@]} 个实验,用 --exp 指定:
$(ls "$EXPS" 2>/dev/null | grep -v '^_' | sed 's/^/    /')"
  fi
fi
EXP_DIR="$EXPS/$EXP"
[[ -f "$EXP_DIR/experiment.sh" ]] || die "找不到实验定义 $EXP_DIR/experiment.sh"
EXP_PRESET=""; EXP_MATERIALS=""; EXP_TASK_DEFAULT=""; EXP_TASK_BUILD=""
EXP_FORM=""; EXP_VERIFY=""; EXP_METER=""; EXP_JAIL=""; EXP_WORK_DEFAULT="$HOME/exp/zero"
# shellcheck disable=SC1090
source "$EXP_DIR/experiment.sh"
EXP_JAIL="$(echo $EXP_JAIL)"   # 折行写的白名单压成一行,不然拼进 tmux 命令串会断

# label 不给就取下一个序号:<实验名>-01、-02 …
if [[ -z "$LABEL" ]]; then
  n=1
  while [[ -e "$RUNS/$EXP-$(printf %02d $n)" ]]; do n=$((n+1)); done
  LABEL="$EXP-$(printf %02d $n)"
fi

mkdir -p "${2:-$EXP_WORK_DEFAULT}"
WORK="$(cd "${2:-$EXP_WORK_DEFAULT}" && pwd -P)"
TASK="${TASK_OPT:-${3:-$EXP_TASK_DEFAULT}}"
if [[ -n "$QUERY" ]]; then
  [[ -n "$EXP_TASK_BUILD" && -x "$EXP_TASK_BUILD" ]] || die "这个实验没有 build-task.sh,--query 用不了;用 --task <文件>"
  mkdir -p "$RUNS"; TASK="$RUNS/$LABEL.task.md"
  "$EXP_TASK_BUILD" "$QUERY" > "$TASK" || die "任务书生成失败"
  echo "  任务书按 --query 现做 → $TASK"
fi
PORT="${PORT:-8788}"
# 被试启动时必须带这两个 flag。实测 A/B:
#   claude --setting-sources project,local  → 看不到 user 级 skill
#   claude （裸跑）                          → 看得到
# 所以隔离靠 flag,**不靠挪 ~/.claude/skills** —— 挪它会波及你所有会话,
# 让你在实验跑的 70 分钟里什么都干不了。
# --thinking-display summarized:**不加这个,抓到的 thinking 明文全是空串。**
# fourier-01 实测:1378 个 thinking_delta 事件,明文非空 0 个,只有加密 signature。
# 加上之后同样的抓包链路能拿到真实推理文本 —— 而「哪一步在权衡、哪一步在执行」
# 是 harness 分层(固化成流水线 vs 写成循环)的直接依据。
LAUNCH="claude --setting-sources project,local --permission-mode bypassPermissions --thinking-display summarized"


[[ -d "$RUNS/$LABEL" ]] && die "$LABEL 已经跑过了。换个 label,或先删掉 $RUNS/$LABEL"
[[ -f "$TASK" ]] || die "找不到任务书 $TASK"

# 形态段必须逐字等于 PRODUCT-FORM.md。只校验「第 3 行 → 第一个 ## 交付」这一段,
# 尾部(环境说明)允许各版本自己加 —— v2 就是在尾部追加环境事实。
# 产品形态曾经同时存在于三份文件里并双向漂移过,这道闸就是防那个。
if [[ -n "$EXP_FORM" && -n "$EXP_TASK_BUILD" && -x "$EXP_TASK_BUILD" ]]; then
  topic=$(sed -n '1s/^做一部关于 \*\*\(.*\)\*\* 的互动视频。$/\1/p' "$TASK")
  if [[ -n "$topic" ]]; then
    form_of(){ sed -n '3,/^## 交付/p' "$1" | sed '$d'; }
    if ! diff -q <(form_of <("$EXP_TASK_BUILD" "$topic")) <(form_of "$TASK") >/dev/null 2>&1; then
      die "任务书的形态段和 $(basename "$EXP_FORM") 对不上。
    形态的唯一源头是那个文件。看差在哪:
      diff <($EXP_TASK_BUILD \"$topic\") $TASK"
    fi
    echo "  形态段与 $(basename "$EXP_FORM") 一致(主题:$topic)"
  fi
fi

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  die "端口 $PORT 被占用(上一轮的 proxy 没退?)。先停掉:
    pkill -f 'proxy.py --port $PORT'"
fi

# ── 1. 重置工作目录(闸 + 清空 + 铺预置件) ────────────────────────────────
# --yes:不再单独问一次。go.sh 已经用 label 挡住了重复跑,reset.sh 自己也有
# 路径深度和祖先链两道保险,这里再确认一遍只是噪音。
PRESET="$EXP_PRESET" MATERIALS="$EXP_MATERIALS" \
  "$KIT/capture/reset.sh" "$WORK" --yes || die "重置失败"

# preset 里的 ANTHROPIC_BASE_URL 是写死的端口。PORT 改了它不会跟着改 ——
# 单路跑时表现为「监听起在 8789,被试却往 8788 发」连不上;
# **并行跑两路时更坏**:第二路的流量全灌进第一路的 proxy,两份轨迹混在一起,
# 而且两边看起来都正常。所以这里按实际 PORT 重写一遍。
python3 - "$WORK/.claude/settings.json" "$PORT" <<'PATCH' || die "改不了 settings.json"
import json, sys
p, port = sys.argv[1], sys.argv[2]
d = json.load(open(p))
d.setdefault("env", {})["ANTHROPIC_BASE_URL"] = f"http://127.0.0.1:{port}"
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
PATCH
echo "  被试流量 → 127.0.0.1:$PORT"

# ── 2. 环境隔离,带自动还原 ────────────────────────────────────────────────
PROXY_PID=""
cleanup() {
  [[ -n "$PROXY_PID" ]] && kill "$PROXY_PID" 2>/dev/null
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

# 遗留检查:旧版 go.sh 挪过 skill,没还原干净的话在这里提醒
[[ -d "$HOME/.claude/skills.parked" ]] \
  && echo "  ⚠ 存在 ~/.claude/skills.parked(旧版遗留)。确认后 mv 回 ~/.claude/skills"

# ── 3. 起监听 ─────────────────────────────────────────────────────────────
mkdir -p "$RUNS/$LABEL"
python3 -u "$KIT/capture/proxy.py" --port "$PORT" --out "$RUNS/$LABEL" \
  > "$RUNS/$LABEL.proxy.log" 2>&1 &
PROXY_PID=$!
sleep 2
kill -0 "$PROXY_PID" 2>/dev/null || die "监听没起来,看 $RUNS/$LABEL.proxy.log"

model=$(python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d.get("model","<默认>"))' \
        "$WORK/.claude/settings.json" 2>/dev/null || echo "?")

# ── 3.5 顺手把静态服务器起好 ──────────────────────────────────────────────
# fourier-01 里被试自己花了 4 次调用起服务器、试端口(8000 被占,挪到 8811)。
# 那是配管不是方法。起好了直接给它 URL —— 但**不要**替它截图:
# 「看自己的作品然后想」占了 43% 墙钟,是画面质量的来源,那个回路得留给它。
WEBPORT="${WEBPORT:-8123}"
WEB_PID=""
if ss -ltn 2>/dev/null | grep -q ":$WEBPORT "; then
  echo "  ⚠ 端口 $WEBPORT 被占,不自动起静态服务器了"
  WEBPORT=""
else
  ( cd "$WORK" && exec python3 -m http.server "$WEBPORT" --bind 127.0.0.1 ) >/dev/null 2>&1 &
  WEB_PID=$!
  sleep 1
  kill -0 "$WEB_PID" 2>/dev/null || { WEBPORT=""; WEB_PID=""; }
fi

cat <<EOF

$(printf '\033[1m▸ 一切就绪,现在把 claude 起起来\033[0m')

  实验 $EXP  ·  被试模型 $model  ·  监听 127.0.0.1:$PORT
  被试可见 skill $(ls "$WORK/.claude/skills" 2>/dev/null | wc -l) 个(工作目录白名单),user 级和内置都不加载
  ${EXP_JAIL:+文件视图:jail 已开 —— notale-v2、infra、别的项目 transcript 在它眼里不存在}
  思考过程:已开(--thinking-display summarized);不开的话只抓得到加密 signature
  ${WEBPORT:+静态服务器 http://localhost:$WEBPORT/ 已起好,指向工作目录}
  ${AUTOSEND:+任务书已经替你发进去了,不用粘。}${AUTOSEND:+ }${AUTOSEND:-任务书在这里,起来之后自己粘进去:
    $TASK}

  $(printf '\033[32m你自己的会话不受影响 —— 全程没动 ~/.claude,想开几个开几个。\033[0m')

  它做完之后 /exit 或 Ctrl-D 退出,本脚本接着归档、脱敏、测量、跑判据闸。
  ${SPLIT:+分屏模式:左边是实时监控,右边是 claude。Ctrl-b ← → 换格,Ctrl-b d 脱离。}

EOF
if [[ -z "$AUTOSEND" ]]; then
  # 手动模式:先把任务书打在屏幕上,你选中复制,回车后 claude 起来再粘。
  printf '\n\033[2m%s\033[0m\n' "──────── 以下整段复制 ────────"
  cat "$TASK"
  printf '\033[2m%s\033[0m\n' "──────────── 到此 ────────────"
fi

read -rp "
  按回车启动 claude… " _

# 两种都是同一个交互界面(完整 TUI),区别只在第一条消息谁来打。
cd "$WORK"
# jail:被试只看得见白名单里的东西。它自己的 transcript 写进本轮的 projects 目录 ——
# 绑上去之后 ~/.claude/projects 里别的项目和 memory 在它眼里就不存在了。
PROJDIR="$RUNS/$LABEL.projects"
HOMEDIR="$RUNS/$LABEL.home"
JAIL=""
if [[ -n "$EXP_JAIL" ]]; then
  mkdir -p "$PROJDIR" "$HOMEDIR"
  # ~/.claude 下这些目录装着**我自己**会话的痕迹:改过的文件快照、历史会话、
  # 计划、粘贴缓存、shell 快照、装过的 skill。被试 Read 得到,所以一律盖掉。
  # 留下的只有跑得起来必须的:.credentials.json(登录)、cache、各种 *-settings/stats。
  hide_home=""
  for d in skills plugins plans sessions session-env shell-snapshots tasks todos jobs \
           daemon backups file-history paste-cache skills-backup-*; do
    [[ -d "$HOME/.claude/$d" ]] && hide_home="$hide_home --hide $HOME/.claude/$d"
  done
  # ~/.claude.json 记着我 21 个项目的路径;settings.json 记着我的模型、插件和
  # autoMode 里那段写明仓库是什么的环境描述。都换成消过毒的副本(被试照常写它自己的)。
  python3 - "$HOME/.claude.json" "$HOMEDIR/claude.json" <<'SANITIZE'
import json, sys
d = json.load(open(sys.argv[1]))
d["projects"] = {}                     # 只留登录状态和 onboarding 标记
for k in ("githubRepoPaths", "seenNotifications", "announcementImpressions", "tipsHistory"):
    d.pop(k, None)
json.dump(d, open(sys.argv[2], "w"))
SANITIZE
  echo '{}' > "$HOMEDIR/settings.json"
  : > "$PROJDIR/history.jsonl"
  JAIL="$KIT/capture/jail.sh $EXP_JAIL $hide_home \
        --bind $PROJDIR:$HOME/.claude/projects \
        --bind $PROJDIR/history.jsonl:$HOME/.claude/history.jsonl \
        --bind $HOMEDIR/settings.json:$HOME/.claude/settings.json \
        --bind $HOMEDIR/claude.json:$HOME/.claude.json --"
fi
CMD="$JAIL $LAUNCH"
[[ -n "$AUTOSEND" ]] && CMD="$CMD $(printf '%q' "$(cat "$TASK")")"

if [[ -n "$SPLIT" ]] && command -v tmux >/dev/null; then
  # 左:实时监控(只读)  右:claude
  # claude 退出时顺手 kill 掉整个 session,否则监控那一格会一直挂着,
  # attach 不返回,归档就永远开始不了。
  SESS="motale-$LABEL-$$"
  tmux kill-session -t "$SESS" 2>/dev/null || true
  tmux new-session -d -s "$SESS" -c "$WORK" \
    "$CMD; tmux kill-session -t $SESS" || die "tmux 起不来"
  sleep 1
  tmux has-session -t "$SESS" 2>/dev/null || die "claude 那一格起来就死了。单窗口重试看报错:
    $0 $LABEL --exp $EXP --no-split"
  tmux split-window -t "$SESS" -h -b -l 42% -c "$KIT" \
    "python3 '$KIT/watch.py' '$LABEL' --runs '$RUNS' --work '$WORK' --interval 5" 2>/dev/null
  # ── 外观:让它看起来是一个应用,不是「你在 tmux 里跑了两个东西」 ──────────
  # 全部用 session/window 作用域设置,不碰你的 ~/.tmux.conf,也不依赖
  # tmux -f(服务器已经起着的话 -f 是不生效的)。
  tset(){ tmux set-option -t "$SESS" "$@" 2>/dev/null || true; }
  twset(){ tmux set-window-option -t "$SESS" "$@" 2>/dev/null || true; }
  tset mouse on
  tset status on
  tset status-position top
  tset status-interval 5
  tset status-style "bg=colour234,fg=colour245"
  tset status-left "#[bg=colour24,fg=colour231,bold] MOTALE #[default] "
  tset status-left-length 20
  tset status-right "#[fg=colour109]#(python3 '$KIT/statusline.py' '$RUNS' '$LABEL' '$EXP')#[default]"
  tset status-right-length 120
  tset window-status-format ""
  tset window-status-current-format ""
  tset message-style "bg=colour24,fg=colour231"
  twset pane-border-status top
  twset pane-border-format " #{?pane_active,#[fg=colour231#,bold],#[fg=colour244]}#{pane_title} "
  twset pane-border-style "fg=colour238"
  twset pane-active-border-style "fg=colour24"
  tmux select-pane -t "$SESS".0 -T "实验记录" 2>/dev/null || true
  tmux select-pane -t "$SESS".1 -T "claude" 2>/dev/null || true
  tmux select-pane -t "$SESS" -R          # 焦点给 claude 那一格
  if [[ -n "${TMUX:-}" ]]; then
    # 已经在 tmux 里:switch-client 不会嵌套
    tmux switch-client -t "$SESS"
    while tmux has-session -t "$SESS" 2>/dev/null; do sleep 2; done
  else
    tmux attach -t "$SESS"
  fi
else
  [[ "$SPLIT" == "1" ]] && echo "  ⚠ 没有 tmux,退回单屏"
  eval "$CMD"
fi

# ── 4. 归档 ───────────────────────────────────────────────────────────────
say "归档"
kill "$PROXY_PID" 2>/dev/null; PROXY_PID=""
sleep 1

slug="$(sed 's#/#-#g' <<< "$WORK")"
tdir="$HOME/.claude/projects/$slug"
[[ -n "$EXP_JAIL" ]] && tdir="$RUNS/$LABEL.projects/$slug"
latest=$(ls -t "$tdir"/*.jsonl 2>/dev/null | head -1)
if [[ -z "$latest" ]]; then
  echo "  ⚠ 没找到 transcript。只有监听记录可用。"
else
  cp "$latest" "$RUNS/$LABEL.session.jsonl"
  sub="${latest%.jsonl}/subagents"
  if [[ -d "$sub" ]]; then
    mkdir -p "$RUNS/$LABEL.session/subagents"
    cp "$sub"/*.jsonl "$RUNS/$LABEL.session/subagents/" 2>/dev/null
    echo "  trajectory + $(ls "$sub"/*.jsonl 2>/dev/null | wc -l) 个 subagent"
  else
    echo "  trajectory(单 agent)"
  fi
fi

# 交付物也留一份 —— 工作目录下一轮就被 reset 清掉了
mkdir -p "$RUNS/$LABEL.deliverable"
# 软链(lib → vendor)也要带走,而且保持为链接(-P):不然归档页里的库全 404。
( cd "$WORK" && find . \( -type f -o -type l \) ! -path "./materials/*" ! -path "./.claude/*" \
    -exec cp --parents -P {} "$RUNS/$LABEL.deliverable/" \; ) 2>/dev/null
# materials 不拷(14MB × 每轮),但**必须软链** —— shell.js import 的是
# ./materials/motale/...,少了它归档下来的片子加载不了 shell,整个页面是死的。
# 实测过一次:shell 全局 undefined,lib/index.js 404。
[[ -n "$EXP_MATERIALS" && -d "$EXP_MATERIALS" ]] \
  && ln -sfnr "$EXP_MATERIALS" "$RUNS/$LABEL.deliverable/materials"   # -r:相对路径,换机器/搬目录不会断
echo "  交付物 → $RUNS/$LABEL.deliverable/ ($(find "$RUNS/$LABEL.deliverable" -type f | wc -l) 个文件${EXP_MATERIALS:+ + materials 软链})"
echo "    回看:  cd $RUNS/$LABEL.deliverable && python3 -m http.server 8231"

say "脱敏"
python3 "$KIT/capture/redact.py" "$RUNS/$LABEL"/*.json \
  ${latest:+"$RUNS/$LABEL.session.jsonl"} \
  "$RUNS/$LABEL.session/subagents"/*.jsonl 2>/dev/null | grep -v 干净 || true
echo "  完成(只列出擦到东西的文件)"

say "花了多少"
# 放在最前面,因为这是唯一一个「值不值得再跑一轮」直接看的数。
# 逐 lane 的拆分在下面 trajectory.py 的第 1 节里(main vs sub 的成本差是并行的真实代价)。
python3 "$KIT/measure/price.py" "$RUNS/$LABEL" 2>&1 || true

if [[ -n "${EXP_METER:-}" ]]; then
  say "仪表(不判成败,只攒基线)"
  $EXP_METER "$RUNS/$LABEL.deliverable" 2>&1 || true
fi

if [[ -n "$EXP_VERIFY" ]]; then
  say "判据闸(只查对不对,查不了好不好看 —— 观感仍需你自己看)"
  $EXP_VERIFY "$RUNS/$LABEL.deliverable" 2>&1 | tail -16
fi

say "思考过程"
python3 "$KIT/measure/thinking.py" --calls "$RUNS/$LABEL" --top 5 \
  | tee "$RUNS/$LABEL.thinking.txt"
python3 "$KIT/measure/thinking.py" --calls "$RUNS/$LABEL" --dump "$RUNS/$LABEL.thinking.md" >/dev/null 2>&1

if [[ -n "$EXP_JAIL" ]]; then
  say "隔离审计(轨迹里有没有碰到白名单外的路径)"
  python3 "$KIT/measure/leaks.py" "$RUNS/$LABEL" || true
fi

say "测量"
python3 "$KIT/measure/trajectory.py" \
  --calls "$RUNS/$LABEL" ${latest:+--session "$RUNS/$LABEL.session.jsonl"} \
  | tee "$RUNS/$LABEL.trajectory.txt"

cat <<EOF

▸ 这一轮完了。同题目再跑一轮(只跑一轮分不清「它就是这么做的」和「这次碰巧这么做」):

    $0 ${LABEL%-*}-02 --exp $EXP

EOF
