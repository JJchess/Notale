#!/usr/bin/env bash
# 一轮完整跑:planner(配置里的 AWS-GPT-5.6-Sol) + builder 全页型 gemini-3.8-flash。
# planner 失败必须挡住 builder —— 否则 builder 会报 briefs.json 不见了,
# 把「规划崩了」伪装成「文件缺失」(见 run12.sh 顶部那段账)。
set -uo pipefail
L=adaboost-gemini38-20260904
Q="AdaBoosting算法"
AUD="学过基础机器学习概念(分类、训练集、误差)但没系统学过集成学习的本科生"
SCN="课堂授课,教师带着讲;学生课后可以自己重看一遍"

if ! python3 -u -m core.planner --label "$L" --query "$Q" --minutes 20 \
     --audience "$AUD" --scenario "$SCN" > "runs/$L.plan.log" 2>&1; then
  echo "✗ planner 失败,不起 builder"; tail -20 "runs/$L.plan.log"; exit 1
fi
if [[ ! -s "runs/$L/briefs.json" ]]; then
  echo "✗ planner 退出码 0 但没写出 briefs.json"; exit 1
fi
echo "✓ planner 完成"; tail -12 "runs/$L.plan.log"

python3 -u -m core.builder --label "$L" --profile gemini38-flash-low \
  --uniform --concurrency 8 > "runs/$L.builder.log" 2>&1
echo "builder 退出码 $?"
tail -25 "runs/$L.builder.log"
