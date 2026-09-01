(() => {
"use strict";
const get = id => document.getElementById(id);
const controller = new AbortController(), signal = controller.signal;
let nodes = [], links = [], bridgeIds = new Set(), summaries = new Map(), byId = new Map();
let chart, marks, edges, simulation;
let state = { view:"bridge", selected:null };
let ready = false, destroyed = false;

function settle() {
const random = d3.randomLcg(.71);
nodes.forEach(node => {
node.x = node.nx * 1138 + (random() - .5) * 18;
node.y = node.ny * 572 + (random() - .5) * 18;
});
simulation = d3.forceSimulation(nodes).randomSource(d3.randomLcg(.37))
.force("link", d3.forceLink(links).id(node => node.id)
  .distance(link => link.source.bridge ? 350 : 240)
  .strength(link => link.source.bridge ? .018 : .045))
.force("charge", d3.forceManyBody().strength(node => node.bridge ? -125 : -82))
.force("collide", d3.forceCollide().radius(node => node.bridge ? 42 : 34).iterations(2))
.force("x", d3.forceX(node => node.nx * 1138).strength(node => node.bridge ? .88 : .66))
.force("y", d3.forceY(node => node.ny * 572).strength(.74))
.alpha(1).alphaDecay(.0228).velocityDecay(.48).stop();
for (let tick = 0; tick < 340; tick += 1) simulation.tick();
}
function buildChart() {
settle();
const weight = d3.scaleSqrt().domain([8, 33]).range([1.5, 8]);
edges = chart.append("g").selectAll("line").data(links, link => link.id).join("line")
.attr("class", link => `edge ${link.side}`)
.attr("x1", link => link.source.x).attr("y1", link => link.source.y)
.attr("x2", link => link.target.x).attr("y2", link => link.target.y)
.attr("stroke-width", link => weight(link.visits));
marks = chart.append("g").selectAll("g.node").data(nodes, node => node.id).join("g")
.attr("class", node => `node ${node.kind}${node.bridge ? " bridge" : ""}`)
.attr("transform", node => `translate(${node.x},${node.y})`);
const symbol = { plant:d3.symbolStar, pollinator:d3.symbolDiamond };
marks.append("path").attr("class", "symbol")
.attr("d", node => d3.symbol(symbol[node.kind], node.kind === "plant" ? 250 : 410)());
marks.append("text").attr("x", node => node.kind === "plant" ? (node.side === "a" ? 22 : -22) : 0)
.attr("y", node => node.kind === "plant" ? 4 : 33)
.attr("text-anchor", node => node.kind === "plant" ? (node.side === "a" ? "start" : "end") : "middle")
.text(node => node.label);
marks.filter(node => node.kind === "pollinator").on("click.mini", (_, node) => select(node.id));
ready = true;
update(false);
}
function update(animate = true) {
if (!ready || destroyed) return;
const selected = state.selected, linked = new Set([selected]);
links.forEach(link => {
if (link.source.id === selected) linked.add(link.target.id);
});
const duration = animate && !Deck.reduced() ? 220 : 0;
edges.interrupt().transition().duration(duration).style("opacity", link => selected ?
(link.source.id === selected ? .96 : .045) :
(state.view === "bridge" ? (link.source.bridge ? .8 : .08) : .55));
marks.interrupt().transition().duration(duration).style("opacity", node => selected ?
(linked.has(node.id) ? 1 : .18) :
(state.view === "bridge" && node.kind === "pollinator" && !node.bridge ? .58 : 1));
get("bridge").setAttribute("aria-pressed", state.view === "bridge");
get("full").setAttribute("aria-pressed", state.view === "full");
document.querySelectorAll("[data-pick]").forEach(button =>
button.setAttribute("aria-pressed", button.dataset.pick === selected));
if (!selected) {
get("status").textContent = state.view === "bridge" ?
  "桥接证据：2 位传粉者的 16 条跨群落关系保持醒目。" :
  "完整网络：8 位传粉者、8 种植物、28 条访花关系。";
return;
}
const node = byId.get(selected), value = summaries.get(selected);
get("status").textContent = `${node.label}：林缘 ${value.a} 次，湿草甸 ${value.b} 次；` +
(node.bridge ? `${value.count} 条边抵达两侧。` : "全部连接留在一侧。");
}
function select(id) {
if (!ready || destroyed || byId.get(id)?.kind !== "pollinator") return;
state.selected = id;
update();
}
function setView(view) {
if (!ready || destroyed) return;
state = { view, selected:null };
update();
}
function reset() { setView("bridge"); }
function fallback(message) {
get("fallback").hidden = false;
get("network").style.display = "none";
get("status").textContent = message;
}
function dispose() {
if (destroyed) return;
destroyed = true;
controller.abort();
simulation?.stop();
chart?.selectAll("*").interrupt().on(".mini", null);
}

get("bridge").addEventListener("click", () => setView("bridge"), { signal });
get("full").addEventListener("click", () => setView("full"), { signal });
get("reset").addEventListener("click", reset, { signal });
document.querySelectorAll("[data-pick]").forEach(button =>
button.addEventListener("click", () => select(button.dataset.pick), { signal }));
window.addEventListener("pagehide", dispose, { once:true, signal });
Deck.init({ keys:false });

window.PollinatorMini = { setView, select, reset, dispose,
snapshot: () => ({ ready, state:{ ...state }, nodes:nodes.length, links:links.length,
bridges:[...bridgeIds], ticks:340, destroyed,
signature:nodes.map(node => `${node.id}:${node.x?.toFixed(3)},${node.y?.toFixed(3)}`).join("|") }) };

fetch("assets/network.json", { signal }).then(response => {
if (!response.ok) throw Error();
return response.json();
}).then(data => {
nodes = data.nodes.map(([id, label, kind, side, nx, ny]) => ({ id, label, kind, side, nx, ny }));
byId = new Map(nodes.map(node => [node.id, node]));
links = data.links.map(([source, target, visits], index) =>
({ id:`link-${index + 1}`, source, target, visits, side:byId.get(target).side }));
links.forEach(link => {
const value = summaries.get(link.source) || { a:0, b:0, count:0, sides:new Set() };
value[link.side] += link.visits;
value.count += 1;
value.sides.add(link.side);
summaries.set(link.source, value);
});
bridgeIds = new Set([...summaries].filter(([, value]) => value.sides.size === 2).map(([id]) => id));
nodes.forEach(node => { node.bridge = bridgeIds.has(node.id); });
if (!window.d3?.forceSimulation) {
fallback("D3 渲染器不可用；文字仍保留桥接与局部证据。");
return;
}
chart = d3.select("#network");
buildChart();
}).catch(() => {
if (!destroyed) fallback("network.json 不可用；没有用占位关系替代固定教学数据。");
});
})();
