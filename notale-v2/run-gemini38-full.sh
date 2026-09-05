#!/usr/bin/env bash
# 第二臂:planner 和 builder 都跑 gemini-3.8-flash(ROUTER_GEMINI_API_KEY)。
# 这条中转不支持 /v1/responses,所以 planner 必须 --wire chat。
set -uo pipefail
L=adaboost-gemini38-full-20260904
Q="AdaBoosting算法"
AUD="学过基础机器学习概念(分类、训练集、误差)但没系统学过集成学习的本科生"
SCN="课堂授课,教师带着讲;学生课后可以自己重看一遍"

if ! python3 -u -m core.planner --label "$L" --query "$Q" --minutes 20 \
     --audience "$AUD" --scenario "$SCN" \
     --model gemini-3.8-flash --base-url https://api.999555999.com/v1 \
     --key-env ROUTER_GEMINI_API_KEY --wire chat \
     > "runs/$L.plan.log" 2>&1; then
  echo "✗ planner 失败"; tail -25 "runs/$L.plan.log"; exit 1
fi
[[ -s "runs/$L/briefs.json" ]] || { echo "✗ 无 briefs.json"; exit 1; }
echo "✓ planner 完成"; tail -12 "runs/$L.plan.log"

python3 -u -m core.builder --label "$L" --profile gemini38-flash-low \
  --uniform --concurrency 8 > "runs/$L.builder.log" 2>&1
echo "builder 退出码 $?"; tail -25 "runs/$L.builder.log"
