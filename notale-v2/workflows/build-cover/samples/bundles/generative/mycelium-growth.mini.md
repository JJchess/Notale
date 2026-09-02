<sample id="mycelium-growth" category="generative" variant="mini">
  <file path="samples/generative/mycelium-growth/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>菌丝｜地下的生长网络</title>
	<link rel="stylesheet" href="assets/base.css">
	<link rel="stylesheet" href="assets/style.css">
</head>
<body>
	<main id="stage" aria-labelledby="cover-title">
		<figure class="field" role="img"
		aria-label="菌丝消耗能量趋向营养源，达到阈值后分枝，并避开标题与临近菌丝。">
			<canvas id="growth" class="cv-fill" aria-hidden="true"></canvas>
		<div class="fallback-network" aria-hidden="true"></div>
		</figure>
		<header class="cover-copy">
			<h1 id="cover-title">菌丝</h1>
			<p class="subtitle">地下的生长网络</p>
		</header>
		<p class="fallback-copy" role="status">孢子消耗能量，分枝并趋向尚有养分的资源。</p>
	</main>
	<script src="assets/base.js"></script>
	<script src="assets/app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/generative/mycelium-growth/mini/pages/assets/style.css">
```css
:root {
	--bg: #11140f;
	--text: #f0eadc;
	--text-soft: #beb6a6;
	--mycelium: #c8c5b0;
	--mycelium-hot: #eee2c3;
	--nutrient: #bd8437;
	--spore: #7b9276;
	--font-sans: "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
	--font-display: "Noto Serif CJK SC", "Songti SC", "STSong", serif;
}
.field { position: absolute; inset: 0; z-index: 1; }
.cover-copy {
	position: absolute;
	z-index: 4;
	left: 92px;
	top: 185px;
}
h1 {
	font-family: var(--font-display);
	font-size: 194px;
	font-weight: 500;
	line-height: .86;
	letter-spacing: -.08em;
}
.subtitle {
	position: relative;
	margin-top: 50px;
	padding: 25px 0 0 7px;
	color: var(--text-soft);
	font-size: 29px;
	letter-spacing: .14em;
}
.subtitle::before {
	content: "";
	position: absolute;
	top: 0;
	left: 7px;
	width: 54px;
	height: 1px;
	background: var(--nutrient);
}
.fallback-network, .fallback-copy { display: none; }
.fallback-network {
	position: absolute;
	left: 735px;
	top: 468px;
	width: 650px;
	height: 2px;
	background: var(--mycelium);
	transform: rotate(-8deg);
}
.fallback-network::before, .fallback-network::after {
	content: "";
	position: absolute;
	top: -23px;
	width: 48px;
	height: 48px;
	border: 2px solid currentColor;
	border-radius: 50%;
}
.fallback-network::before { left: 0; color: var(--spore); }
.fallback-network::after { right: 0; color: var(--nutrient); }
.fallback-copy {
	position: absolute;
	z-index: 3;
	left: 735px;
	top: 640px;
	color: var(--text-soft);
	font-size: 20px;
}
.context-fallback #growth { display: none; }
.context-fallback .fallback-network,
.context-fallback .fallback-copy { display: block; }
```
  </file>
  <file path="samples/generative/mycelium-growth/mini/pages/assets/app.js">
```javascript
(() => {
	"use strict";

	const WIDTH = 1600;
	const HEIGHT = 900;
	const CONFIG = {
		seed: 4217,
		steps: 680,
		stepSize: 6.2,
		maxTips: 112,
		branchEnergy: 25
	};
	const SPORES = [
		[220, 748, -.13, 44],
		[850, 817, -1.23, 46],
		[1425, 730, -2.32, 44]
	].map(([x, y, angle, energy]) => ({ x, y, angle, energy }));
	const NUTRIENTS = [
		[706, 661, 31, 132], [790, 390, 27, 124], [938, 536, 36, 176],
		[1065, 224, 29, 134], [1220, 378, 39, 190], [1438, 470, 34, 158]
	].map(([x, y, radius, amount]) => ({ x, y, radius, amount }));
	const canvas = document.querySelector("#growth");
	const listeners = new AbortController();
	let model;
	let canvasFit;

	Deck.init({ title: "菌丝｜地下的生长网络", keys: false });

	function seededRandom(seed) {
		let state = seed >>> 0 || 1;
		return () => {
			state += 0x6D2B79F5;
			let value = state;
			value = Math.imul(value ^ value >>> 15, value | 1);
			value ^= value + Math.imul(value ^ value >>> 7, value | 61);
			return ((value ^ value >>> 14) >>> 0) / 4294967296;
		};
	}

	function blendAngle(current, target, amount) {
		const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
		return current + difference * amount;
	}

	function insideTitle(x, y, padding = 0) {
		return x > 64 - padding && x < 688 + padding &&
			y > 104 - padding && y < 582 + padding;
	}

	function buildModel() {
		const random = seededRandom(CONFIG.seed);
		const nutrients = NUTRIENTS.map(source => ({
			...source, initial: source.amount
		}));
		const occupancy = new Uint16Array(67 * 38);
		const segments = [];
		let createdTips = SPORES.length;
		let tips = SPORES.map(spore => ({
			...spore,
			cooldown: 0
		}));

		for (let step = 0; step < CONFIG.steps && tips.length; step += 1) {
			const nextTips = [];
			for (const tip of tips) {
				if (tip.energy < 4.5) continue;
				let attractionX = 0;
				let attractionY = 0;
				for (const source of nutrients) {
					if (source.amount < .5) continue;
					const deltaX = source.x - tip.x;
					const deltaY = source.y - tip.y;
					const distanceSquared = deltaX * deltaX + deltaY * deltaY;
					const distance = Math.sqrt(distanceSquared) || 1;
					const pull = source.amount / (distanceSquared + 3600);
					attractionX += deltaX / distance * pull;
					attractionY += deltaY / distance * pull;
				}
				if (!attractionX && !attractionY) {
					attractionX = Math.cos(tip.angle);
					attractionY = Math.sin(tip.angle);
				}

				const cellX = Math.floor(tip.x / 24);
				const cellY = Math.floor(tip.y / 24);
				const cell = cellY * 67 + cellX;
				const repulsionX = occupancy[cell - 1] - occupancy[cell + 1];
				const repulsionY = occupancy[cell - 67] - occupancy[cell + 67];
				const target = Math.atan2(attractionY + repulsionY * .006,
					attractionX + repulsionX * .006);
				tip.angle = blendAngle(tip.angle, target, .22) + (random() - .5) * .36;
				let nextX = tip.x + Math.cos(tip.angle) * CONFIG.stepSize;
				let nextY = tip.y + Math.sin(tip.angle) * CONFIG.stepSize;

				if (insideTitle(nextX, nextY, 8)) {
					tip.angle = blendAngle(tip.angle, Math.PI / 2, .88);
					nextX = tip.x + Math.cos(tip.angle) * CONFIG.stepSize;
					nextY = tip.y + Math.sin(tip.angle) * CONFIG.stepSize;
					if (insideTitle(nextX, nextY, 2)) continue;
				}
				if (nextX < 58 || nextX > 1542 || nextY < 62 || nextY > 842) {
					tip.angle += Math.PI * .72;
					nextX = tip.x + Math.cos(tip.angle) * CONFIG.stepSize;
					nextY = tip.y + Math.sin(tip.angle) * CONFIG.stepSize;
					tip.energy -= 1.8;
				}

				segments.push([tip.x, tip.y, nextX, nextY]);
				tip.x = nextX;
				tip.y = nextY;
				tip.cooldown += 1;
				tip.energy -= .16;
				let harvested = 0;
				for (const source of nutrients) {
					const distance = Math.hypot(source.x - tip.x, source.y - tip.y);
					if (distance < source.radius + 11 && source.amount > 0) {
						const amount = Math.min(source.amount, 1.55);
						source.amount -= amount;
						tip.energy += amount * 1.22;
						harvested += amount;
					}
				}
				occupancy[Math.floor(tip.y / 24) * 67 + Math.floor(tip.x / 24)] += 1;

				const readiness = tip.energy - CONFIG.branchEnergy + Math.min(7, harvested * 4);
				if (readiness > 0 && tip.cooldown > 15 && createdTips < CONFIG.maxTips &&
					random() < .1 + Math.min(.2, readiness / 45)) {
					const turn = (random() < .5 ? -1 : 1) * (.45 + random() * .24);
					const childEnergy = tip.energy * .43;
					tip.energy -= childEnergy;
					tip.cooldown = 0;
					const child = {
						...tip,
						angle: tip.angle + turn,
						energy: childEnergy,
						cooldown: 0
					};
					createdTips += 1;
					tip.angle -= turn * .3;
					nextTips.push(child);
				}
				if (tip.energy >= 4.5) nextTips.push(tip);
			}
			tips = nextTips;
		}
		return { segments, nutrients };
	}

	const paint = (name, alpha) => Deck.rgba(name, alpha);
	function circle(context, x, y, radius) {
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
	}

	function drawSoil(context) {
		const gradient = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
		gradient.addColorStop(0, "#11140f");
		gradient.addColorStop(1, "#20251b");
		context.fillStyle = gradient;
		context.fillRect(0, 0, WIDTH, HEIGHT);
		const grain = seededRandom(CONFIG.seed + 99);
		context.fillStyle = "rgba(203,193,164,.075)";
		for (let index = 0; index < 1250; index += 1) {
			const x = grain() * WIDTH;
			const y = grain() * HEIGHT;
			if (grain() < .16 + .84 * Math.pow(x / WIDTH, 1.6)) context.fillRect(x, y, 1, 1);
		}
	}

	function drawNetwork(context) {
		context.lineCap = "round";
		context.lineJoin = "round";
		context.beginPath();
		for (const segment of model.segments) {
			context.moveTo(segment[0], segment[1]);
			context.lineTo(segment[2], segment[3]);
		}
		context.strokeStyle = "rgba(17,20,15,.76)";
		context.lineWidth = 4.5;
		context.stroke();
		context.strokeStyle = paint("mycelium", .7);
		context.lineWidth = 1.75;
		context.stroke();
	}

	function drawSpore(context, spore) {
		context.strokeStyle = paint("spore", .8);
		context.fillStyle = paint("spore", .2);
		context.lineWidth = 1.4;
		circle(context, spore.x, spore.y, 10);
		context.fill();
		context.stroke();
		context.fillStyle = paint("mycelium-hot", .88);
		circle(context, spore.x, spore.y, 3.6);
		context.fill();
	}

	function drawNutrient(context, source) {
		const remaining = Math.max(0, source.amount / source.initial);
		context.fillStyle = paint("nutrient", .14 + remaining * .18);
		circle(context, source.x, source.y, source.radius * .74);
		context.fill();
		context.fillStyle = paint("nutrient", .2 + remaining * .52);
		circle(context, source.x, source.y, source.radius * (.2 + remaining * .34));
		context.fill();
		context.fillStyle = paint("mycelium-hot", .72);
		circle(context, source.x - 4, source.y - 4, 2.1);
		context.fill();
	}

	function draw(context) {
		drawSoil(context);
		drawNetwork(context);
		SPORES.forEach(spore => drawSpore(context, spore));
		model.nutrients.forEach(source => drawNutrient(context, source));
	}

	function reset() {
		model = buildModel();
		canvasFit?.redraw();
	}

	function cleanup() {
		canvasFit?.stop();
		listeners.abort();
	}

	document.addEventListener("keydown", event => {
		if (event.key === "r" || event.key === "R") reset();
	}, { signal: listeners.signal });
	window.addEventListener("pagehide", cleanup, { signal: listeners.signal, once: true });
	if (!canvas.getContext("2d")) document.body.classList.add("context-fallback");
	else {
		model = buildModel();
		canvasFit = Deck.autofit(canvas, draw);
	}
})();
```
  </file>
</sample>
