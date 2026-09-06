#!/usr/bin/env bash
# 把被试的工作目录还原成预置状态。**每一轮实验之前跑一次。**
#
#   PRESET=<预置件目录> MATERIALS=<素材目录> ./reset.sh <工作目录> [--yes|--force]
#
# 一般不直接调 —— go.sh 会带着实验定义调它。手动跑的话:
#   PRESET=…/experiments/interactive-video/preset ./reset.sh ~/exp/zero
#
# 做三件事:
#   1. 污染闸 —— 工作目录的任何一级祖先都不许有 CLAUDE.md
#   2. 清空   —— 上一轮的产物全删掉,否则这一轮分不清什么是它做的
#   3. 铺预置件 —— materials/ + .claude/settings.json,并写下 sha256 清单
#
# 为什么要闸这一条:实测 Claude Code 会把**所有祖先目录**的 CLAUDE.md 注入上下文,
# `--setting-sources project,local` 拦不住(那个 flag 只管 settings.json)。工作目录
# 一旦落在本仓库里面,被试就读到了研究计划,那一轮观测直接作废 —— 而且
# 悄无声息,轨迹上看不出来。这是一个模型自己永远不会发现的盲区,只能由脚本来查。
set -uo pipefail

KIT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 预置件和素材由调用方给 —— 这两样是**实验**的属性,不是 harness 的属性。
PRESET="${PRESET:?需要 PRESET=<预置件目录>}"
MATERIALS="${MATERIALS:-}"          # 留空就不拷素材

say()  { printf "\n\033[1m▸ %s\033[0m\n" "$*"; }
die()  { printf "\n\033[31m✗ %s\033[0m\n" "$*"; exit 1; }
warn() { printf "  \033[33m⚠ %s\033[0m\n" "$*"; }

[[ $# -ge 1 ]] || die "用法: ./reset.sh <工作目录> [--yes]"
RAW="$1"; shift
YES=""; FORCE=""
for a in "$@"; do
  [[ "$a" == "--yes" ]] && YES=1
  [[ "$a" == "--force" ]] && { FORCE=1; YES=1; }
done

[[ -d "$RAW" ]] || die "工作目录不存在: $RAW  (先 mkdir -p)"
# -P: 取真实路径。软链接下 pwd 给的是逻辑路径,而 claude 认的是 realpath ——
# 两者不一致时,闸会去查错的祖先链,等于没查。
WORK="$(cd "$RAW" && pwd -P)"

# ── 安全:别把不该删的目录清了 ─────────────────────────────────────────────
[[ "$WORK" == "/" || "$WORK" == "$HOME" ]] && die "拒绝清空 $WORK"
depth=$(awk -F/ '{print NF-1}' <<< "$WORK")
(( depth >= 3 )) || die "$WORK 层级太浅,拒绝清空。工作目录请放深一点,比如 ~/exp/zero"
[[ "$WORK" == "$KIT"* ]] && die "工作目录不能在 harness-kit 里面: $WORK"

# ── 闸零:这个工作目录上有没有实验正在跑 ───────────────────────────────────
# 2026-08-17 血的教训:一轮 fourier-02 跑到第 27 分钟时,我为了「验证改完的
# reset.sh 还能用」在同一个工作目录上跑了 reset.sh --yes,把被试写的 12 个文件
# 全删了。它在思考里写:「something wiped out an hour of work」。
# 清空是不可逆的,所以宁可误报也不能漏报 —— 扫 /proc 看有没有进程正把这里当 cwd。
say "占用检查"
busy=""
for d in /proc/[0-9]*; do
  pid="${d#/proc/}"
  cwd=$(readlink "$d/cwd" 2>/dev/null) || continue
  [[ "$cwd" == "$WORK" || "$cwd" == "$WORK"/* ]] || continue
  [[ "$pid" == "$$" || "$pid" == "$PPID" ]] && continue
  busy+="    pid $pid  $(tr '\0' ' ' < "$d/cmdline" 2>/dev/null | cut -c1-90)\n"
done
if [[ -n "$busy" && -z "$FORCE" ]]; then
  printf "\n\033[31m✗ 有进程正在这个工作目录里跑,拒绝清空:\033[0m\n"
  printf "$busy"
  die "先把它们停掉。确定要强清就加 --force。"
fi
echo "  没有进程占用 $WORK"

# ── 闸一:祖先目录不许有 CLAUDE.md ─────────────────────────────────────────
say "污染闸"
hits=()
probe="$WORK"
while :; do
  [[ -f "$probe/CLAUDE.md" ]] && hits+=("$probe/CLAUDE.md")
  [[ "$probe" == "/" ]] && break
  probe="$(dirname "$probe")"
done
[[ -f "$HOME/.claude/CLAUDE.md" ]] && hits+=("$HOME/.claude/CLAUDE.md")

if (( ${#hits[@]} > 0 )); then
  printf "\n\033[31m✗ 祖先链上有 CLAUDE.md,被试会读到它:\033[0m\n"
  printf "    %s\n" "${hits[@]}"
  die "换一个和这些文件没有父子关系的工作目录。"
fi
echo "  祖先链干净($WORK 往上到 / 没有 CLAUDE.md)"

# memory 会被自动注入,而且**只按项目目录匹配** —— 只需要查被试自己那一个,
# 查全部会把每一轮都拦下来(别的项目有 memory 是常态,和这轮实验无关)。
slug="$(sed 's#/#-#g' <<< "$WORK")"
mem="$HOME/.claude/projects/$slug/memory/MEMORY.md"
[[ -f "$mem" ]] && die "被试项目有 memory,会带着上一轮的结论起跑。先挪走:
    mv $HOME/.claude/projects/$slug/memory /tmp/"
echo "  被试项目无 memory"

# user 级 skill 靠被试启动时的 --setting-sources project,local 排除,不挪 ~/.claude。
# 所以你自己的会话全程不受影响,也可以并行跑别的实验。
[[ -d "$HOME/.claude/skills.parked" ]] && warn "~/.claude/skills.parked 存在(旧版遗留),确认后 mv 回 ~/.claude/skills"

# ── 清空 ──────────────────────────────────────────────────────────────────
say "清空工作目录"
n=$(find "$WORK" -mindepth 1 -maxdepth 1 2>/dev/null | wc -l)
if (( n > 0 )); then
  find "$WORK" -mindepth 1 -maxdepth 1 -printf "    %P\n" 2>/dev/null | head -20
  (( n > 20 )) && echo "    … 共 $n 项"
  if [[ -z "$YES" ]]; then
    read -rp "  上面这些全部删掉?[y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "已取消"
  fi
  find "$WORK" -mindepth 1 -maxdepth 1 -exec rm -rf {} + || die "清空失败"
fi
echo "  已清空"

# ── 铺预置件 ──────────────────────────────────────────────────────────────
say "铺预置件"
[[ -d "$PRESET" ]] || die "找不到预置件目录 $PRESET"
if [[ -n "$MATERIALS" ]]; then
  [[ -d "$MATERIALS" ]] || die "找不到素材目录 $MATERIALS"
  cp -r "$MATERIALS" "$WORK/materials" || die "拷 materials 失败"
fi
# 拷贝而不是软链接:软链接会把 realpath 暴露成仓库里的路径,被试 ls .. 一下
# 就看见 CLAUDE.md 和 harness-kit ——闸一白装了。
# preset/ 整个铺下去(含 .claude):接好线的播放器外壳 + 模型设置。
# preset 里的软链原样带过去(画廊索引、底盘、lib → 仓库里的真源),被试顺着链接读就是最新版。
cp -r "$PRESET/." "$WORK/" || die "拷 preset 失败"

[[ -n "$MATERIALS" ]] && echo "  materials/          $(find "$WORK/materials" -type f | wc -l) 个文件"
echo "  预置件              $(cd "$PRESET" && ls | grep -v '^\.' | tr '\n' ' ')"
[[ -f "$WORK/.claude/settings.json" ]] && \
  echo "  .claude/settings.json  model=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("model","<默认>"))' "$WORK/.claude/settings.json")"
[[ -d "$WORK/.claude/skills" ]] && echo "  skill 白名单        $(ls "$WORK/.claude/skills" | wc -l) 个"

# ── 清单:下一轮好逐字节校验预置件没被改过 ────────────────────────────────
# 存在**工作目录外面**。放里面的话被试就看见一个 MANIFEST.sha256,
# 等于告诉它「你的起点被人对过账」—— 观测工具不该在被测对象眼前留下痕迹。
MANIFEST="$KIT/.manifests/$(sed 's#/#-#g' <<< "$WORK").sha256"
mkdir -p "$(dirname "$MANIFEST")"
( cd "$WORK" && find . -type f -print0 | sort -z | xargs -0 sha256sum ) > "$MANIFEST" 2>/dev/null
echo "  起点清单            $(wc -l < "$MANIFEST") 个文件(存在 $MANIFEST)"

# 被 go.sh 调用时(--yes)不打这段 —— go.sh 自己会给下一步指引,重复只是噪音。
if [[ -z "$YES" ]]; then
  cat <<EOF

▸ 干净了。开跑:
    $KIT/go.sh <label> --exp <实验名>

  注意工作目录的 .claude/settings.json 把 ANTHROPIC_BASE_URL 指向了监听端口,
  所以**监听没起的时候这个目录里的 claude 连不上** —— 这是故意的,
  防止「忘了开采集就跑了一轮」。
EOF
fi
