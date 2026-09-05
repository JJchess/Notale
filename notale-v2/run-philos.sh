#!/usr/bin/env bash
# 整改后的完整实验:planner + builder,3×mini 样本臂。
# 改动:philosophy.md 接线(planner +111 / builder +146 字符)、IDENTITY 那句改窄、
#       selfcheck 加「主体」「字阶」两行陈述(不判定)。
set -uo pipefail
L=ensemble-philos-mini3-20260905
Q="《集成学习--机器学习概论第八讲》"
AUD="修过《机器学习概论》前七讲的本科生,已掌握监督学习、训练/测试划分、过拟合与偏差方差,但没系统学过集成方法"
SCN="课堂授课,教师带着讲;学生课后可以自己重看一遍。这是系列课第八讲,前面已讲过决策树与模型评估,本讲不重复那些基础"

if ! python3 -u -m core.planner --label "$L" --query "$Q" --minutes 45 \
     --audience "$AUD" --scenario "$SCN" > "runs/$L.plan.log" 2>&1; then
  echo "✗ planner 失败"; tail -20 "runs/$L.plan.log"; exit 1
fi
[[ -s "runs/$L/briefs.json" ]] || { echo "✗ 无 briefs.json"; exit 1; }
echo "✓ planner"; grep -E "deck |逐页内容|图池|briefs |合计|⚠" "runs/$L.plan.log"

python3 -u -m core.builder --label "$L" --profile gemini38-google-low \
  --uniform --samples mini --aux-samples --concurrency 6 > "runs/$L.builder.log" 2>&1
echo "builder exit=$?"; tail -8 "runs/$L.builder.log"
