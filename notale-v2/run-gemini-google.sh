#!/usr/bin/env bash
# Google 官方端点上跑完整两臂:planner + builder 同一档 effort。
# 顺序跑,不并行 —— 免得两轮互相抢配额、把限流读成模型能力。
set -uo pipefail
Q="AdaBoosting算法"
AUD="学过基础机器学习概念(分类、训练集、误差)但没系统学过集成学习的本科生"
SCN="课堂授课,教师带着讲;学生课后可以自己重看一遍"
GBASE=https://generativelanguage.googleapis.com/v1beta/openai

for EFF in low medium; do
  L=adaboost-google-$EFF-20260904
  echo "=========== $L ==========="
  if ! python3 -u -m core.planner --label "$L" --query "$Q" --minutes 20 \
       --audience "$AUD" --scenario "$SCN" \
       --model gemini-3.8-flash --base-url "$GBASE" \
       --key-env GEMINI_API_KEY --wire chat --effort "$EFF" \
       > "runs/$L.plan.log" 2>&1; then
    echo "✗ planner 失败"; tail -12 "runs/$L.plan.log"; continue
  fi
  [[ -s "runs/$L/briefs.json" ]] || { echo "✗ 无 briefs.json"; continue; }
  echo "✓ planner"; grep -E "deck |逐页内容|briefs " "runs/$L.plan.log"

  python3 -u -m core.builder --label "$L" --profile "gemini38-google-$EFF" \
    --uniform --concurrency 4 > "runs/$L.builder.log" 2>&1
  echo "builder exit=$?"; tail -12 "runs/$L.builder.log"
done
