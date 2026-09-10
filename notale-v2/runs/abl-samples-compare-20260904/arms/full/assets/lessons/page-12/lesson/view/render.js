const treeCards = new Map();
const impRows = new Map();

const treesList = document.querySelector("#treesList");
const importanceBars = document.querySelector("#importanceBars");
const oobReadout = document.querySelector("#oobReadout");
const treeCountReadout = document.querySelector("#treeCountReadout");
const viewAnnotation = document.querySelector("#viewAnnotation");
const statusMetrics = document.querySelector("#statusMetrics");

function list(val) {
  return Array.isArray(val) ? val : [];
}

function ensureTreeCard(id) {
  if (treeCards.has(id)) return treeCards.get(id);

  const card = document.createElement("div");
  card.className = "tree-card";
  card.dataset.entityId = id;

  const nameEl = document.createElement("span");
  nameEl.className = "tree-name";

  const splitEl = document.createElement("span");
  splitEl.className = "tree-split";

  const candsEl = document.createElement("span");
  candsEl.className = "tree-cands";

  const oobEl = document.createElement("span");
  oobEl.className = "tree-oob";

  card.append(nameEl, splitEl, candsEl, oobEl);
  treesList.append(card);

  const record = { card, nameEl, splitEl, candsEl, oobEl };
  treeCards.set(id, record);
  return record;
}

function ensureImpRow(feat) {
  if (impRows.has(feat)) return impRows.get(feat);

  const row = document.createElement("div");
  row.className = "imp-row";

  const meta = document.createElement("div");
  meta.className = "imp-meta";
  const nameSpan = document.createElement("span");
  nameSpan.className = "imp-name";
  const valSpan = document.createElement("span");
  valSpan.className = "imp-val";
  meta.append(nameSpan, valSpan);

  const track = document.createElement("div");
  track.className = "imp-track";
  const fill = document.createElement("div");
  fill.className = "imp-fill";
  track.append(fill);

  row.append(meta, track);
  importanceBars.append(row);

  const record = { row, nameSpan, valSpan, fill };
  impRows.set(feat, record);
  return record;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const trees = list(state.trees);
  const importances = list(state.importances);
  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));

  // 1. 头部指标
  if (oobReadout) oobReadout.textContent = state.oob_acc || "—";
  if (treeCountReadout) treeCountReadout.textContent = `${trees.length} 棵`;

  // 2. 渲染每棵树卡片
  const activeTreeIds = new Set();
  trees.forEach((t) => {
    const id = String(t.id);
    activeTreeIds.add(id);
    const rec = ensureTreeCard(id);

    rec.nameEl.textContent = `Tree #${t.tree_id + 1}`;
    rec.splitEl.textContent = `划分: ${t.split_feat} ≤ ${t.thresh}`;
    rec.candsEl.textContent = `候选: [${(t.cand_feats || []).join(", ")}]`;
    const oobSamples = (t.oob_indices || []).map((idx) => `S${idx}`).join(", ") || "无";
    rec.oobEl.innerHTML = `OOB: <strong>${t.oob_count} 样本</strong> (${oobSamples})`;

    if (focus.has(id)) {
      rec.card.dataset.focus = focus.get(id);
    } else {
      delete rec.card.dataset.focus;
    }
  });

  for (const [id, rec] of treeCards) {
    if (!activeTreeIds.has(id)) {
      rec.card.remove();
      treeCards.delete(id);
    }
  }

  // 3. 渲染特征重要性条形图
  const activeFeats = new Set();
  importances.forEach((imp) => {
    activeFeats.add(imp.feat);
    const rec = ensureImpRow(imp.feat);
    rec.nameSpan.textContent = imp.feat;
    rec.valSpan.textContent = `${Math.round(imp.ratio * 100)}% (频次 ${imp.value})`;
    rec.fill.style.width = `${Math.max(3, Math.round(imp.ratio * 100))}%`;
  });

  for (const [feat, rec] of impRows) {
    if (!activeFeats.has(feat)) {
      rec.row.remove();
      impRows.delete(feat);
    }
  }

  // 4. 注释与底部状态
  if (viewAnnotation) {
    viewAnnotation.textContent = step?.annotation || "观察随机森林的集成训练与特征评估状态。";
  }

  if (statusMetrics && step?.metrics) {
    statusMetrics.innerHTML = Object.entries(step.metrics)
      .map(([k, v]) => `<span>${k}: <strong>${v}</strong></span>`)
      .join("");
  }
};
