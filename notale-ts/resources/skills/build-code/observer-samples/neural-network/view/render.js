const NL = { packet: null, sample: 1, inputs: null };
const nsCopy = { forward: "前向传播", loss: "预测与目标", backward: "反向传播", update: "参数更新", done: "最终权重" };
const nsFmt = (v, n = 3) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(n) : "—");
const nsFlat = (v) => (Array.isArray(v) ? v.flat(Infinity) : []);
const nsScalar = (v) => (Array.isArray(v) ? v.flat(Infinity)[0] : v);
const nsEsc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const nsText = (x, y, text, cls = "nl-svg-label", extra = "") =>
  `<text x="${x}" y="${y}" font-family="inherit" font-size="${{ "nl-math": 17, "nl-value": 15, "nl-svg-small": 10 }[cls] || 12}" font-style="${cls === "nl-math" ? "italic" : "normal"}" fill="${cls === "nl-value" ? "var(--code-ink)" : "var(--code-muted)"}" ${extra}>${nsEsc(text)}</text>`;
function nsSvg(body, label) {
  return `<svg viewBox="0 0 640 430" role="img" aria-label="${nsEsc(label)}">${body}</svg>`;
}
function nsUpdateNote(s) {
  let note = s.stage === "backward" ? "误差回传 · 更新梯度汇总全部 4 个样本" : "";
  if (s.stage === "update") {
    const a = nsFlat(s.before),
      b = nsFlat(s.after);
    const i = a.reduce((best, v, j) => (Math.abs(b[j] - v) > Math.abs(b[best] - a[best]) ? j : best), 0);
    const cols = Array.isArray(s.before?.[0]) ? s.before[0].length : 0;
    const idx = cols ? `${Math.floor(i / cols)},${i % cols}` : i;
    note = `本次最大改动：${s.param}[${idx}]  ${nsFmt(a[i], 4)} → ${nsFmt(b[i], 4)}`;
  }
  return note;
}

function nsNetwork(s) {
  const back = s.stage === "backward",
    up = s.stage === "update";
  const left = [
      { x: 82, y: 124 },
      { x: 82, y: 238 },
    ],
    middle = [
      { x: 320, y: 66 },
      { x: 320, y: 180 },
      { x: 320, y: 294 },
    ],
    out = { x: 558, y: 180 };
  const width = (v) => 1 + Math.min(Math.abs(Number(v) || 0), 2) * 1.5;
  let body =
    nsText(82, 21, "输入", "nl-svg-label", 'text-anchor="middle"') +
    nsText(320, 21, "隐藏层", "nl-svg-label", 'text-anchor="middle"') +
    nsText(558, 21, "预测", "nl-svg-label", 'text-anchor="middle"');
  function edge(a, b, value, label, group, before) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy),
      ux = dx / len,
      uy = dy / len;
    const d = `M${a.x + ux * 38} ${a.y + uy * 38} L${b.x - ux * 38} ${b.y - uy * 38}`;
    const changing = up && s.param === group,
      real = Number.isFinite(value);
    body += `<path fill="none" stroke-linecap="round" d="${d}" stroke="var(--code-muted)" stroke-width="${width(before)}" opacity="${changing ? 0.3 : 0}"/>`;
    body += `<path fill="none" stroke-linecap="round" d="${d}" stroke="${changing ? "var(--code-accent)" : "var(--code-muted)"}" stroke-width="${width(value)}" opacity="${changing ? 1 : 0.5}" stroke-dasharray="${value < 0 ? "4 6" : "none"}"><title>${nsEsc(label)}：${changing ? nsFmt(before, 5) + " → " : ""}${real ? nsFmt(value, 5) : "未记录"}</title></path>`;
  }
  left.forEach((a, i) =>
    middle.forEach((b, j) => edge(a, b, s.W1?.[i]?.[j], `W₁[${i},${j}]`, "W1", s.before?.[i]?.[j])),
  );
  middle.forEach((a, i) => edge(a, out, nsScalar(s.W2?.[i]), `W₂[${i}]`, "W2", nsScalar(s.before?.[i])));
  function node(p, label, value, bias, biasGroup, index) {
    const active = Number.isFinite(value),
      changing = up && s.param === biasGroup;
    body += `<circle fill="var(--code-bg)" stroke="var(--code-line)" stroke-width="1.4" cx="${p.x}" cy="${p.y}" r="32"/>`;
    body += `<circle cx="${p.x}" cy="${p.y}" r="37" opacity="${active ? 1 : 0}" fill="none" stroke="var(--code-accent)" stroke-width="3" stroke-dasharray="${Math.max(0, Math.min(1, active ? value : 0)) * 232.48} 232.48" transform="rotate(-90 ${p.x} ${p.y})"/>`;
    body += nsText(p.x, p.y + 5, active ? nsFmt(value, 2) : "—", "nl-value", 'text-anchor="middle"');
    body += nsText(p.x, p.y + 55, label, "nl-math", 'text-anchor="middle"');
    const b = changing
      ? `偏置 ${nsFmt(nsFlat(s.before)[index], 2)} → ${nsFmt(bias, 2)}`
      : Number.isFinite(bias)
        ? `偏置 ${nsFmt(bias, 2)}`
        : "";
    body += nsText(
      p.x,
      p.y + 75,
      b,
      "nl-svg-small",
      `text-anchor="middle" style="fill:${changing ? "var(--code-accent)" : "var(--code-muted)"}"`,
    );
  }
  left.forEach((p, i) => node(p, "x" + ["₁", "₂"][i], s.X?.[NL.sample]?.[i]));
  middle.forEach((p, i) => node(p, "h" + ["₁", "₂", "₃"][i], s.a1?.[NL.sample]?.[i], nsFlat(s.b1)[i], "b1", i));
  const pred = nsScalar(s.a2?.[NL.sample]),
    target = nsScalar(s.Y?.[NL.sample]);
  node(out, "ŷ", pred, nsFlat(s.b2)[0], "b2", 0);
  body += nsText(558, 291, `预测 ${nsFmt(pred, 2)} · 目标 ${target ?? "—"}`, "nl-svg-label", 'text-anchor="middle"');
  body += `<path d="M500 311 H616" stroke="var(--code-line)" stroke-width="3"/>`;
  body += `<path d="M${500 + 116 * (Number.isFinite(target) ? target : 0)} 302 v18" stroke="var(--code-ink)" stroke-width="2"/>`;
  body += `<circle cx="${500 + 116 * (Number.isFinite(pred) ? pred : 0)}" cy="311" r="5" fill="var(--code-accent)" opacity="${Number.isFinite(pred) ? 1 : 0}"/>`;
  body += nsText(
    558,
    341,
    s.stage === "loss" ? `样本损失 ${nsFmt(nsScalar(s.sample_loss?.[NL.sample]))}` : "",
    "nl-svg-small",
    'text-anchor="middle"',
  );
  body += `<path fill="none" stroke-linecap="round" d="M535 384 H115 l9 -5 M115 384 l9 5" stroke="var(--code-secondary)" stroke-width="2" opacity="${back ? 1 : 0}"/>`;
  body += nsText(320, 410, nsUpdateNote(s), "nl-svg-label", 'text-anchor="middle"');
  return nsSvg(body, "节点为激活值，连线为权重，输出旁对照预测与目标");
}

function nsSampleControls(rows) {
  const controls = document.getElementById("code-controls");
  controls.hidden = false;
  NL.sample = Math.min(NL.sample, Math.max(0, rows.length - 1));
  const inputs = JSON.stringify(rows);
  if (inputs !== NL.inputs) {
    controls.replaceChildren(
      ...rows.map((row, index) => {
        const button = document.createElement("button");
        button.className = "nl-sample";
        button.textContent = row.join("");
        button.setAttribute("aria-label", `查看输入 ${row.join(", ")} 的样本`);
        button.onclick = () => {
          NL.sample = index;
          nsPaint();
        };
        return button;
      }),
    );
    NL.inputs = inputs;
  }
  for (const [index, button] of [...controls.children].entries()) {
    button.setAttribute("aria-pressed", String(index === NL.sample));
  }
}

function nsPaint() {
  if (!NL.packet) return;
  const { state: s } = NL.packet,
    copy = nsCopy[s.stage] || nsCopy.forward;
  document.getElementById("code-title").textContent = "神经网络";
  document.getElementById("code-status").textContent = copy + (s.stage === "update" ? " · " + s.param : "");
  nsSampleControls(s.X || []);
  patchSvg(document.getElementById("code-plot"), nsNetwork(s), { animate: true });
  document.getElementById("code-caption").innerHTML = ["update", "done"].includes(s.stage)
    ? "激活与预测保留本轮更新前的实测值；高亮参数已更新"
    : "圆环表示激活值 · 连线表示权重（虚线为负）";
}
window.renderNotaleView = (packet) => {
  NL.packet = packet;
  nsPaint();
};
