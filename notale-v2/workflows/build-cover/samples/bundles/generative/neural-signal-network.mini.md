<sample id="neural-signal-network" category="generative" variant="mini">
  <file path="samples/generative/neural-signal-network/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>神经网络 · 会自己调参数的机器</title>
	<link rel="stylesheet" href="assets/base.css">
	<link rel="stylesheet" href="assets/style.css">
</head>
<body>
	<main id="stage" tabindex="0" aria-labelledby="cover-title" aria-describedby="cover-description">
		<canvas id="network" class="cv-fill no-pan" aria-hidden="true"></canvas>
		<div class="scrim" aria-hidden="true"></div>
		<div class="topline" aria-hidden="true">
			<span>神经网络 · 交互讲义</span><i></i><span>01/14</span>
		</div>
		<header class="hero">
			<p class="kicker">第一幕 · 进门</p>
			<h1 id="cover-title">神经<em>网络</em></h1>
			<div class="rule"></div>
			<p id="cover-description" class="description">让万千经验穿过层层连接，在计算深处沉淀为<strong>直觉</strong>。</p>
			<p class="meta">十四页　·　六幕　·　每一页都要你动手</p>
		</header>
	</main>
	<script src="assets/base.js"></script>
	<script src="assets/lib/seedrandom.min.js"></script>
	<script src="assets/app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/generative/neural-signal-network/mini/pages/assets/style.css">
```css
:root {
	--bg: #02050a;
	--text: #eef6fb;
	--signal: #00e5ff;
	--network: #72bed1;
	--font-sans: "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
}
#stage {
	cursor: crosshair;
	background:
		radial-gradient(900px 560px at 74% 43%, #0081a613, transparent 66%),
		linear-gradient(#07101a, #03070d 52%, var(--bg));
}
#stage::after {
	content: "";
	position: absolute;
	inset: 0;
	z-index: 8;
	pointer-events: none;
	box-shadow: inset 0 0 210px #000a;
}
#network, .fallback-network { z-index: 1; }
.fallback-network { position: absolute; inset: 0; width: 100%; height: 100%; }
.scrim {
	position: absolute;
	inset: 0;
	z-index: 2;
	pointer-events: none;
	background: radial-gradient(690px 420px at 27% 49%, #02050aeb, #02050ab8 47%, transparent 76%);
}
.topline {
	position: absolute;
	z-index: 5;
	left: 68px;
	right: 68px;
	top: 16px;
	display: grid;
	grid-template-columns: auto 1fr auto;
	align-items: center;
	gap: 28px;
	color: #445064;
	font: 11px ui-monospace, monospace;
	letter-spacing: .14em;
}
.topline i { height: 3px; background: linear-gradient(90deg, var(--signal) 0 7%, #ffffff17 7%); }
.topline span:last-child { color: #78859a; font-size: 14px; }
.hero {
	position: absolute;
	z-index: 5;
	left: 104px;
	top: 292px;
	width: 670px;
	pointer-events: none;
}
.kicker {
	color: var(--signal);
	font: 13px ui-monospace, monospace;
	letter-spacing: .22em;
}
h1 {
	margin-top: 22px;
	color: #f8fbfd;
	font-size: 112px;
	font-weight: 750;
	line-height: .94;
	letter-spacing: -.045em;
	text-shadow: 0 8px 42px #000c;
}
h1 em {
	color: var(--signal);
	font-style: normal;
	text-shadow: 0 0 32px #00e5ff7a, 0 0 90px #00e5ff2e;
}
.rule { width: 74px; height: 2px; margin-top: 28px; background: var(--signal); }
.description { margin-top: 20px; color: #8090a5; font-size: 19px; line-height: 1.68; }
.description strong { color: var(--signal); font-weight: 500; }
.meta {
	margin-top: 23px;
	color: #445064;
	font: 11px ui-monospace, monospace;
	letter-spacing: .18em;
}
#stage:focus-visible { outline: 3px solid #dffcff; outline-offset: -8px; }
```
  </file>
  <file path="samples/generative/neural-signal-network/mini/pages/assets/app.js">
```javascript
(() => {
	"use strict";
	const CONFIG = Object.freeze({
		seed: "notale-neural-mini-v1",
		nodeCount: 420,
		linkDistance: 108,
		signalSpeed: 720
	});
	const stage = document.querySelector("#stage");
	const canvas = document.querySelector("#network");
	const reduced = Deck.reduced();
	const listeners = new AbortController();
	let context, nodes = [], edges = [], neighbors = [];
	let pulse = null;
	let clock = 0;
	let stopLoop = () => {};
	let stopResize = () => {};

	Deck.init({ title: "神经网络 · 会自己调参数的机器", keys: false });

	function insideTitle(x, y) {
		return Math.hypot((x - 355) / 475, (y - 470) / 250) < 1;
	}

	function createRandom(seed) {
		if (typeof Math.seedrandom === "function") return new Math.seedrandom(seed);
		stage.dataset.seedFallback = "true";
		let state = 2166136261;
		for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
		return () => {
			state += 0x6d2b79f5;
			let value = state;
			value = Math.imul(value ^ value >>> 15, value | 1);
			value ^= value + Math.imul(value ^ value >>> 7, value | 61);
			return ((value ^ value >>> 14) >>> 0) / 4294967296;
		};
	}

	function buildGraph() {
		const random = createRandom(CONFIG.seed);
		nodes = [];
		while (nodes.length < CONFIG.nodeCount) {
			const x = 18 + random() * 1564;
			const y = 18 + random() * 864;
			if (!insideTitle(x, y)) nodes.push({ x, y, radius: .7 + random() * 1.25 });
		}
		edges = [];
		neighbors = Array.from({ length: nodes.length }, () => []);
		for (let from = 0; from < nodes.length; from++) {
			for (let to = from + 1; to < nodes.length; to++) {
				const first = nodes[from];
				const second = nodes[to];
				const distance = Math.hypot(first.x - second.x, first.y - second.y);
				if (distance >= CONFIG.linkDistance ||
					insideTitle((first.x + second.x) / 2, (first.y + second.y) / 2)) continue;
				edges.push({ from, to, distance });
				neighbors[from].push({ node: to, distance });
				neighbors[to].push({ node: from, distance });
			}
		}
	}

	function injectSignal(x, y, representative = reduced) {
		let nearest = 0;
		let shortest = Infinity;
		for (let index = 0; index < nodes.length; index++) {
			const distance = Math.hypot(nodes[index].x - x, nodes[index].y - y);
			if (distance < shortest) {
				shortest = distance;
				nearest = index;
			}
		}
		pulse = {
			arrivals: computeArrivals(nearest),
			startedAt: clock - (representative ? .82 : 0)
		};
		drawNetwork();
	}

	function computeArrivals(source) {
		const arrivals = new Float32Array(nodes.length);
		const queued = new Uint8Array(nodes.length);
		const queue = [source];
		arrivals.fill(Infinity);
		arrivals[source] = 0;
		queued[source] = 1;
		for (let head = 0; head < queue.length; head++) {
			const current = queue[head];
			queued[current] = 0;
			for (const link of neighbors[current]) {
				const candidate = arrivals[current] + link.distance / CONFIG.signalSpeed;
				if (candidate >= arrivals[link.node]) continue;
				arrivals[link.node] = candidate;
				if (!queued[link.node]) {
					queue.push(link.node);
					queued[link.node] = 1;
				}
			}
		}
		return arrivals;
	}

	function drawNetwork() {
		if (!context) return;
		context.clearRect(0, 0, 1600, 900);
		context.lineCap = "round";
		context.beginPath();
		for (const edge of edges) {
			context.moveTo(nodes[edge.from].x, nodes[edge.from].y);
			context.lineTo(nodes[edge.to].x, nodes[edge.to].y);
		}
		context.strokeStyle = "rgba(114,190,209,.12)";
		context.lineWidth = .75;
		context.stroke();

		context.beginPath();
		for (const node of nodes) {
			context.moveTo(node.x + node.radius, node.y);
			context.arc(node.x, node.y, node.radius, 0, 7);
		}
		context.fillStyle = "rgba(126,203,221,.42)";
		context.fill();

		const activeNodes = [];
		context.beginPath();
		if (pulse) for (const edge of edges) {
			const age = clock - pulse.startedAt;
			const start = Math.min(pulse.arrivals[edge.from], pulse.arrivals[edge.to]);
			const end = Math.max(pulse.arrivals[edge.from], pulse.arrivals[edge.to]);
			if (age < start || age > end + .28) continue;
			context.moveTo(nodes[edge.from].x, nodes[edge.from].y);
			context.lineTo(nodes[edge.to].x, nodes[edge.to].y);
		}
		context.strokeStyle = "rgba(0,229,255,.85)";
		context.lineWidth = 1.5;
		context.stroke();

		if (pulse) for (let node = 0; node < nodes.length; node++) {
			const lag = clock - pulse.startedAt - pulse.arrivals[node];
			if (lag >= 0 && lag < .9) activeNodes.push({ ...nodes[node], light: Math.exp(-lag * 3) });
		}
		context.save();
		context.fillStyle = "#dcfdff";
		context.shadowColor = "#00e5ff";
		context.shadowBlur = 15;
		context.beginPath();
		for (const node of activeNodes) {
			const radius = 1.3 + node.light * 1.4;
			context.moveTo(node.x + radius, node.y);
			context.arc(node.x, node.y, radius, 0, 7);
		}
		context.fill();
		context.restore();
	}

	function renderSvgFallback() {
		stage.dataset.rendererFallback = "svg";
		const age = clock - pulse.startedAt;
		const segment = edge => `M${nodes[edge.from].x.toFixed(1)} ${nodes[edge.from].y.toFixed(1)}` +
			`L${nodes[edge.to].x.toFixed(1)} ${nodes[edge.to].y.toFixed(1)}`;
		const links = edges.map(segment).join("");
		const active = edges.filter(edge => {
			const start = Math.min(pulse.arrivals[edge.from], pulse.arrivals[edge.to]);
			const end = Math.max(pulse.arrivals[edge.from], pulse.arrivals[edge.to]);
			return age >= start && age <= end + .28;
		}).map(segment).join("");
		stage.insertAdjacentHTML("afterbegin", `<svg class="fallback-network" viewBox="0 0 1600 900" ` +
			`aria-hidden="true"><g fill="none" stroke-linecap="round"><path d="${links}" stroke="#72bed1" ` +
			`stroke-opacity=".16"/><path d="${active}" stroke="#00e5ff" stroke-width="1.8"/></g></svg>`);
	}

	function resetModel() {
		buildGraph();
		pulse = null;
		if (reduced) {
			clock = .9;
			injectSignal(1140, 470);
		} else drawNetwork();
	}

	function dispose() {
		stopLoop();
		stopResize();
		listeners.abort();
	}

	stage.addEventListener("pointerdown", event => {
		const point = Deck.pt(stage, event);
		stage.focus({ preventScroll: true });
		injectSignal(point.x, point.y);
	}, { signal: listeners.signal });
	document.addEventListener("keydown", event => {
		if (event.key.toLowerCase() === "r") resetModel();
		else if (event.key === "Enter" && document.activeElement === stage) {
			event.preventDefault();
			injectSignal(1120, 470);
		}
	}, { signal: listeners.signal });
	window.addEventListener("pagehide", dispose, { signal: listeners.signal, once: true });

	context = Deck.fit(canvas);
	if (context) {
		resetModel();
		stopResize = Deck.onResize(() => {
			context = Deck.fit(canvas);
			drawNetwork();
		});
		stopLoop = Deck.loop(time => {
			clock = time / 1000;
			drawNetwork();
		}, { still: 900 });
	} else {
		buildGraph();
		clock = .9;
		injectSignal(1140, 470, true);
		renderSvgFallback();
	}
})();
```
  </file>
</sample>
