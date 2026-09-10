#!/usr/bin/env bash
# 截图消融 C1:3×mini(mini+aux)基线之上,读 Main bundle 时附该 sample 的多态截图拼图。
# 基线 C0 = runs/ensemble-abl-mini3-20260904(同一冻结 fixture,samples=mini+aux,无拼图)。
# 拼图先由 core/sample_shots.py 生成到 workflows/*/samples/<cat>/<id>/shots.png。
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
D=$(date +%Y%m%d)
run "ensemble-abl-mini3-shots-$D" "samples=mini+aux+shots" --samples mini --aux-samples --sample-shots
