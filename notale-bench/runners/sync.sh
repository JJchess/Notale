#!/usr/bin/env bash
# 把 nv2-paper 跟到 nv2-dev 最新提交上：rebase + 跑 TS 测试。dev 合一波，跑一次。
set -euo pipefail
W=/data1/home/zhuyifan/ws2/Notale-bench
cd "$W"
echo "dev  : $(git log --oneline -1 nv2-dev)"
echo "paper: $(git log --oneline -1 nv2-paper)"
git rebase nv2-dev || { echo "✗ rebase 冲突，手工解决后 git rebase --continue"; exit 1; }
cd notale-ts && npm run verify:quick
echo "now  : $(git -C "$W" log --oneline -1)"
