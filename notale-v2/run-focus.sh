#!/usr/bin/env bash
# 视觉焦点消融 D1:3×mini(mini+aux)基线之上,页表每页多一行「视觉焦点」,builder system 追加使用规则。
# 基线 C0 = runs/ensemble-abl-mini3-20260904(同一冻结 fixture,samples=mini+aux)。
# 焦点行不重新规划,由 core/annotate_focus.py 对冻结页表一次性补出,放在 $SRC/pages/plan-focus/。
set -uo pipefail
SRC=runs/ensemble-l8-google-low-r2-20260904
[[ -s "$SRC/pages/plan-focus/pages.md" ]] || { echo "✗ 先跑: python3 -m core.annotate_focus --src $(basename $SRC)"; exit 1; }
freeze() {  # $1=目标 label  $2=臂说明
  local L=$1
  rm -rf "runs/$L"; mkdir -p "runs/$L/pages"
  cp -r "$SRC/pages/plan" "runs/$L/pages/plan"
  cp "$SRC"/pages/plan-focus/p[0-9][0-9].md "$SRC/pages/plan-focus/pages.md" "runs/$L/pages/plan/"   # 不带 pages.raw.md
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
run "ensemble-abl-mini3-focus-$D" "samples=mini+aux+visual-focus" --samples mini --aux-samples --visual-focus
