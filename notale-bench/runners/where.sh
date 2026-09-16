#!/usr/bin/env bash
# 开工前确认自己在哪条线上。两个工作树各自钉死一个分支，pre-push 钩子再兜一道。
for w in /data1/home/zhuyifan/ws2/Notale /data1/home/zhuyifan/ws2/Notale-bench; do
  [ -d "$w" ] || continue
  b=$(git -C "$w" branch --show-current)
  u=$(git -C "$w" rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo '无上游')
  d=$(git -C "$w" status --porcelain | wc -l)
  printf '%-40s %-16s → %-24s 未提交 %s\n' "$w" "$b" "$u" "$d"
done
echo
printf 'pre-push 钩子: '; [ -x /data1/home/zhuyifan/ws2/Notale/.git/hooks/pre-push ] && echo '已装（Notale 只许推 nv2-dev，Notale-bench 只许推 nv2-paper）' || echo '缺失'
