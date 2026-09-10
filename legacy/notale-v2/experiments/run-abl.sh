#!/usr/bin/env bash
# 样本消融剩下两臂:mini(1×紧凑) 和 mini+aux(多份紧凑)。
# 同一份冻结的 27 页规划,planner 一次都不再调用,只换 builder 的样本预算。
set -uo pipefail
SRC=runs/ensemble-l8-google-low-r2-20260904
freeze() {  # $1=目标 label  $2=臂说明
  local L=$1
  rm -rf "runs/$L"; mkdir -p "runs/$L/pages"
  cp -r "$SRC/pages/plan" "runs/$L/pages/plan"
  cp -r "$SRC/pages/assets" "runs/$L/pages/assets"
  rm -rf "runs/$L/pages/assets/lessons"
  cp "$SRC/briefs.json" "runs/$L/briefs.json"
  printf '{"schemaVersion":1,"frozenFrom":"%s","arm":"%s","targetState":"absent"}\n' \
    "$(basename $SRC)" "$2" > "runs/$L/fixture-lock.json"
}
run() {  # $1=label  $2=臂说明  $3...=builder 额外参数
  local L=$1 NOTE=$2; shift 2
  echo "=========== $L ($NOTE) ==========="
  freeze "$L" "$NOTE"
  python3 -u -m core.builder --label "$L" --profile gemini38-google-low \
    --uniform --concurrency 6 "$@" > "runs/$L.builder.log" 2>&1
  echo "exit=$?"; tail -7 "runs/$L.builder.log"
}
run ensemble-abl-mini-20260904    "samples=mini"          --samples mini --no-aux-samples
run ensemble-abl-mini3-20260904   "samples=mini+aux"      --samples mini --aux-samples
