#!/usr/bin/env bash
# 给被试造一个只看得见白名单的文件系统视图,然后在里面跑命令。
#
#   ./jail.sh --hide <路径> --keep <路径> --bind <src>:<dst> -- <命令…>
#
#   --hide  用空 tmpfs 盖住这个目录(它和它下面的一切在被试眼里就成了空目录)
#   --keep  即使落在 --hide 里面也要保留(先绑走,盖完再绑回原位)
#   --bind  把 src 绑到 dst(比如把本轮的 projects 目录绑到 ~/.claude/projects,
#           被试照常写自己的 transcript,却看不见别的项目和 memory)
#
# 靠 Linux 用户命名空间实现,不需要 root、不需要装东西:
#   unshare -Urm 起一个私有 mount 命名空间(里面我们是 root,所以能 mount);
#   挂完再嵌套一层 --map-user 把身份映回真实 uid —— 不映回去被试就是 root,
#   claude 的 bypassPermissions 会拒绝以 root 运行。
#
# 网络不隔离(没有 -n),所以 127.0.0.1 上的采集 proxy 照常连得上。
# 这是内核层面的视图,对 Read、Bash、subagent 一律生效。为什么不能只在提示里
# 请它别读:gallery-deck-01 顺着 pages/assets/lib 的软链 ls 到上级目录,
# 把整套 harness 的 skill 和反套路清单读了个遍,那一轮的风格结论因此作废。
#
# **--bind 和 --keep 的源都在盖之前先绑到暂存处** —— 源要是落在被盖的树里
# (比如 runs/ 就在仓库底下),盖完再去绑就只能绑到一个空目录,
# 被试的 transcript 会写进 tmpfs,退出即失,而且不报错。
set -euo pipefail

HIDE=(); KEEP=(); BIND=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hide) HIDE+=("$2"); shift 2 ;;
    --keep) KEEP+=("$2"); shift 2 ;;
    --bind) BIND+=("$2"); shift 2 ;;
    --) shift; break ;;
    *) echo "jail.sh: 不认识的参数 $1" >&2; exit 2 ;;
  esac
done
[[ $# -gt 0 ]] || { echo "jail.sh: -- 后面要给命令" >&2; exit 2; }

# 源必须先存在:文件型的(history.jsonl)先建空文件,目录型的建目录
for b in ${BIND[@]+"${BIND[@]}"}; do
  src="${b%%:*}"
  if [[ "$src" == *.json || "$src" == *.jsonl ]]; then
    mkdir -p "$(dirname "$src")"; [[ -e "$src" ]] || : > "$src"
  else
    mkdir -p "$src"
  fi
done

export _J_HIDE="$(printf '%s\n' ${HIDE[@]+"${HIDE[@]}"})"
export _J_KEEP="$(printf '%s\n' ${KEEP[@]+"${KEEP[@]}"})"
export _J_BIND="$(printf '%s\n' ${BIND[@]+"${BIND[@]}"})"
export _J_UID="$(id -u)" _J_GID="$(id -g)"

exec unshare -Urm --propagation private bash -c '
set -euo pipefail
hold=$(mktemp -d); n=0
# 计数器必须留在当前 shell —— 放进 $(…) 子 shell 里 n 不会累加,
# 两个源会抢同一个暂存点,而且第二次 mount 才报错,前一个已经悄悄错位了。
stash() {
  n=$((n+1)); STASH="$hold/$n"
  if [[ -d "$1" ]]; then mkdir -p "$STASH"; else : > "$STASH"; fi
  mount --bind "$1" "$STASH" 2>/dev/null
}
while read -r k; do [[ -n "$k" ]] || continue
  [[ -e "$k" ]] || { echo "jail: --keep 不存在: $k" >&2; exit 1; }
  stash "$k"; echo "$STASH $k" >> "$hold/keep"
done <<< "$_J_KEEP"
while read -r b; do [[ -n "$b" ]] || continue
  stash "${b%%:*}"; echo "$STASH ${b#*:}" >> "$hold/bind"
done <<< "$_J_BIND"

while read -r h; do [[ -n "$h" ]] || continue
  [[ -d "$h" ]] && mount -t tmpfs -o size=1m,mode=755 none "$h" 2>/dev/null
done <<< "$_J_HIDE"

for f in keep bind; do
  [[ -f "$hold/$f" ]] || continue
  while read -r s d; do
    if [[ -d "$s" ]]; then mkdir -p "$d"; else mkdir -p "$(dirname "$d")"; [[ -e "$d" ]] || : > "$d"; fi
    mount --bind "$s" "$d" 2>/dev/null
  done < "$hold/$f"
done

exec unshare -U --map-user="$_J_UID" --map-group="$_J_GID" "$@"
' bash "$@"
