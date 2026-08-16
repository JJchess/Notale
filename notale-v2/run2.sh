#!/usr/bin/env bash
run() {
  label="$1"; query="$2"; aud="$3"
  python3 -u -m core.planner --label "$label" --model AWS-Claude-Sonnet-5 \
    --query "$query" --minutes 90 --audience "$aud" >> "runs/$label.planner.log" 2>&1 || { echo "[$label] planner 失败"; return 1; }
  python3 -u -m core.builder --label "$label" --model AWS-Claude-Sonnet-5 \
    --effort medium --concurrency 10 > "runs/$label.builder.log" 2>&1
  echo "[$label] 完成"
}
run s5-nn  "神经网络的发展历史" "学过一点线性代数和微积分、没系统学过机器学习的读者" &
run s5-orb "火箭与轨道 —— 怎么把东西送上太空,并让它待在那儿" "学过一点力学、没接触过轨道的高中生" &
wait
echo "=== 两轮 Sonnet 结束 ==="
