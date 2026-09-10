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
