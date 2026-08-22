#!/usr/bin/env bash
# 一轮 = planner(effort=high) + builder(effort=medium),按轮覆盖模型。
#
# planner 失败必须阻止 builder 启动。第一版漏了这条 `||`,后果是实的:
# s5-nn / s5-orb 两轮的 planner 崩在 theme.css 那步(Sonnet 回来的响应里有
# text=None 的内容块,SDK 的 output_text 直接 "".join() 抛 TypeError),
# 而 builder 照样起,报出 `FileNotFoundError: briefs.json` ——
# 把「响应形状不兼容」伪装成「文件不见了」,白丢一整轮的诊断线索。
# (那个 TypeError 已由 core/llm.py 的 text_of() 修掉,这里修的是失败传播。)
set -uo pipefail

FAILED=()

run() {
  label="$1"; model="$2"; query="$3"; aud="$4"; scen="${5:-}"; eff="${6:-medium}"
  if ! python3 -u -m core.planner --label "$label" --model "$model" --effort "$eff" \
       --query "$query" --minutes 45 --audience "$aud" --scenario "$scen" \
       > "runs/$label.planner.log" 2>&1; then
    echo "[$label] ✗ planner 失败,不起 builder。看 runs/$label.planner.log"
    tail -5 "runs/$label.planner.log" | sed 's/^/    /'
    return 1
  fi
  # planner 退出码 0 也要核一眼产物:briefs.json 是 builder 的唯一输入。
  if [[ ! -s "runs/$label/briefs.json" ]]; then
    echo "[$label] ✗ planner 退出码 0 但没写出 briefs.json,不起 builder"
    return 1
  fi
  if ! python3 -u -m core.builder --label "$label" --model "$model" \
       --effort "$eff" --concurrency 50 > "runs/$label.builder.log" 2>&1; then
    echo "[$label] ✗ builder 失败。看 runs/$label.builder.log"
    tail -5 "runs/$label.builder.log" | sed 's/^/    /'
    return 1
  fi
  echo "[$label] ✓ 完成  $(find "runs/$label/pages" -name 'page-*.html' 2>/dev/null | wc -l) 页"
  # 覆盖闸:三条已有的闸都不管「讲够了没有」,而那正是弱模型最大的短板
  # (nn-06 Opus 20 页 vs nn-07 Sonnet 14 页,同一份指令)。只报,不改变退出码 ——
  # 缺页要人来决定是补页还是改规划,不该由脚本判死。
  python3 -m core.check_coverage --label "$label" --minutes 45 || true
}

# 这条链路是并行云的 Responses API,不是 Anthropic 直连 ——
# 那也是 text=None / 空响应这些形状问题的来源(见 core/llm.py 的 EmptyReply)。
#
# **AWS-Claude-Sonnet-5 这条路由当前不可用,不要用它。** 实测(2026-08-20):
#   同一份 PLAN 提示词,冒烟时 415.9s 产出 16,413 字符,几小时后逐字重放 → 800s 超时;
#   effort low/medium/high × 裸题名/带阐释 六格全部 out 打满、**正文 0 字符**;
#   同时小请求(52 tok)秒回、账号没被排队 —— 是这一条路由漂移,不是端点挂了。
# 同一份提示词换模型立刻就通:
#   AWS-GPT-5.6-Sol    179.4s  out=12,724  正文 16,193 字符  18 页
#   DeepSeek-V4-Flash  249.3s  out=26,672  正文 46,827 字符  24 页
# 两份规划都十一项齐全、停留合计恰好 90 分钟 —— 提示词无罪。
SONNET=AWS-Claude-Sonnet-5      # 暂时不可用,留着待路由恢复后补跑
GPT=AWS-GPT-5.6-Sol
DS=DeepSeek-V4-Flash
DSPRO=DeepSeek-V4-Pro

# 这一轮同题对照的是 Claude Code 裸跑的 nn-09 / nn-10(Opus 5,同一个 query/受众/场合)。
# 问的是:harness 能不能把 Sonnet 带到 Opus 裸跑那个量级。
# 只给题名,不带后面那段中文阐释 —— 让 harness 自己从题目里读出要论证什么。
# 注意这和 nn-09/nn-10 的 QUERY 不完全相同(那两轮带了那段阐释),
# 对照时这一条要记着:少给了一段方向性提示。
APE="认识太阳系 —— 天文学通识课第二讲"
APE_AUD="大学一年级通识课学生,专业背景文理兼有,不假定具备微积分或天文学基础"
APE_SCN="课堂授课,教师带着讲;学生课后可以自己重看一遍。这是系列课第二讲,第一讲已讲过「我们怎么知道天上那些是什么」(观测手段与尺度),本讲不要重复"

# 双路同题对照:同一份提示词、同一套闸,只换模型。
# 这一轮验的是两段式并行规划(A 段页表 + B 段 N 路展开)第一次上真实模型。
# 这一轮验的是两处修复:
#   ① 媒体 skill 指派 —— ape-g5 规划里指派媒体 skill 的页 **0** 个,结果 48 页 0 张图;
#      同一轮 ape-ds2 指派了 7 页,取到 13 张真实照片 + 9 张生成插画。
#      根因是 spec.md 的「必用skill」判据只问「这个交互缺哪一块技法」,取图不是交互技法,
#      按那个判据永远选不中;而 plan.md 的形式枚举里「静态视觉」那一行也被后来的重写覆盖没了。
#      判据:ape-g6 的 assets/img/ 会不会从 0 变成有。
#   ② mount 的 `return <容器>` 由 harness 确定性补上 —— V4-Pro 为这一行连烧 3 次、
#      835 秒、0 页交付,而它的 mount 结构本来是对的。
#      判据:ape-dspro3 的 planner 能过 lec.js 那步,且日志里有「已补上 mount 的 return」。
# 45 分钟课时 + 规格里带真实数值(lec_values)。判据:数据表里的字面数值个数
# 从 0 变成多少、文本块从 36 涨到多少、画布占满率。
run sol46 "$GPT" "$APE" "$APE_AUD" "$APE_SCN" low & p1=$!


wait $p1 || FAILED+=(sol46)


if (( ${#FAILED[@]} )); then
  echo "=== 有 ${#FAILED[@]} 路失败: ${FAILED[*]} ==="
  exit 1
fi
echo "=== 结束 ==="
