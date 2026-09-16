#!/usr/bin/env bash
# 跑 PresentBench 一题:planner(带材料) → builder → slides.pdf → judge。
#   [SUFFIX=-r2] bash presentbench_case.sh education/MIT-the_human_brain/01 [minutes]
# 产物:Notale-bench/experiments/runs/notale-v2/pb-<case>/（worktree 自己的 RUNS_ROOT） ;PDF 与评分落在 PresentBench/results/notale/<case>/generation_task/results/
set -euo pipefail
CASE=$1; MIN=${2:-120}
B=/data1/home/zhuyifan/ws2/Notale/benchmark; NV2=/data1/home/zhuyifan/ws2/Notale-bench/notale-v2   # nv2-benchmark 分支的 worktree
DATA=$B/PresentBench-data/$CASE
LABEL=pb-$(echo "$CASE" | sed 's#[^A-Za-z0-9._-]#-#g')${SUFFIX:-}
RES=$B/PresentBench/results/notale/$CASE/generation_task/results
TITLE=$(grep -m1 -oP 'Lecture Title:\s*"\K[^"]+' "$DATA/generation_task/instructions.md" || true)
TITLE=${TITLE:-$(basename "$CASE")}
DOMAIN=$(echo "$CASE" | cut -d/ -f1)

cd "$NV2"
echo "▸ $LABEL  《$TITLE》  $MIN 分钟"
MATS=(--materials "$DATA/generation_task/instructions.md")
for m in "$DATA"/material*.pdf "$DATA"/material*.md; do [ -f "$m" ] && MATS+=(--materials "$m"); done
python3 -m core.planner --label "$LABEL" --query "$TITLE" --minutes "$MIN" \
  --audience "本科生" --scenario "大学课堂授课,教师带着讲。全部页面文字使用材料的语言(英文)撰写" "${MATS[@]}"
python3 -m core.builder --label "$LABEL"

mkdir -p "$RES"
python3 "$B/notale/deck2pdf.py" "$NV2/../experiments/runs/notale-v2/$LABEL" "$RES/slides.pdf"

cd "$B/PresentBench"
# judge 见到同目录已有 *_score.yaml 会直接跳过;把上一轮结果先归档
if ls "$RES"/*.yaml >/dev/null 2>&1; then mkdir -p "$RES/prev-$(date +%m%d-%H%M%S)" && mv "$RES"/*.yaml "$RES"/prev-*/ 2>/dev/null || true; fi
MATERIALS=(); for m in "$DATA"/material*; do [ -f "$m" ] && MATERIALS+=("$m"); done
python3 judge.py --api_type gemini --model gemini-3-flash-preview \
  --slides "$RES/slides.pdf" --material "${MATERIALS[@]}" \
  --judge_prompt "$DATA/generation_task/judge_prompt.json" \
  --common_judge_prompt "$B/PresentBench-data/$DOMAIN/common_judge_prompt.json" \
  --weights_path "$B/PresentBench-data/$DOMAIN/judge_weights.yaml" "${@:3}"

python3 "$B/notale/record.py" "$CASE" "$NV2/../experiments/runs/notale-v2/$LABEL" "$(ls -t "$RES"/*_score.yaml | head -1)" "${NOTE:-}"
