#!/usr/bin/env bash
# 一轮 = planner(effort=high) + builder(effort=medium),按轮覆盖模型。
run() {
  label="$1"; model="$2"; query="$3"; aud="$4"
  python3 -u -m core.planner --label "$label" --model "$model" \
    --query "$query" --minutes 90 --audience "$aud" > "runs/$label.planner.log" 2>&1
  python3 -u -m core.builder --label "$label" --model "$model" \
    --effort medium --concurrency 10 > "runs/$label.builder.log" 2>&1
  echo "[$label] 完成"
}
SONNET=AWS-Claude-Sonnet-5
GPT=AWS-GPT-5.6-Sol
NN="神经网络的发展历史"
ORB="火箭与轨道 —— 怎么把东西送上太空,并让它待在那儿"
A1="学过一点线性代数和微积分、没系统学过机器学习的读者"
A2="学过一点力学、没接触过轨道的高中生"

run s5-nn   "$SONNET" "$NN"  "$A1" &
run s5-orb  "$SONNET" "$ORB" "$A2" &
run gpt-nn  "$GPT"    "$NN"  "$A1" &
wait
echo "=== 三轮全部结束 ==="
