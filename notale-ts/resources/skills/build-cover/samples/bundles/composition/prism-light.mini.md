<sample id="prism-light" category="composition" variant="mini">
  <file path="samples/composition/prism-light/mini/pages/index.html">
```html
<!doctype html>
<html lang="zh-CN">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width,initial-scale=1">
	<title>解剖一束光</title>
	<link rel="stylesheet" href="assets/base.css">
	<link rel="stylesheet" href="assets/style.css">
</head>
<body>
	<main id="stage" tabindex="0" aria-labelledby="cover-title" aria-describedby="cover-subtitle">
		<header class="cover-copy">
			<h1 id="cover-title"><span>解剖一束</span><strong>光</strong></h1>
			<p id="cover-subtitle">折射、色散与我们看见的颜色</p>
		</header>
		<svg class="scene cv-fill" viewBox="0 0 1600 900" role="img"
			aria-labelledby="optical-title optical-description">
			<title id="optical-title">玻璃棱镜中的白光色散</title>
			<desc id="optical-description">白光进入三维玻璃棱镜，内部折射后展开为连续光谱。</desc>
			<defs>
				<linearGradient id="beam" x1="0" y1="611" x2="1258" y2="525" gradientUnits="userSpaceOnUse">
					<stop offset="0" stop-color="#ddd8cc" stop-opacity="0"/>
					<stop offset=".2" stop-color="#f2eee4" stop-opacity=".58"/>
					<stop offset=".68" stop-color="#fff" stop-opacity=".94"/>
					<stop offset="1" stop-color="#dffcff"/>
				</linearGradient>
				<linearGradient id="glass" x1="850" y1="690" x2="1040" y2="210" gradientUnits="userSpaceOnUse">
					<stop stop-color="#98dbe6" stop-opacity=".08"/>
					<stop offset=".38" stop-color="#fffdf5" stop-opacity=".03"/>
					<stop offset=".72" stop-color="#b7dce2" stop-opacity=".12"/>
					<stop offset="1" stop-color="#fffaf0" stop-opacity=".2"/>
				</linearGradient>
				<linearGradient id="facet" x1="1000" y1="190" x2="1300" y2="660" gradientUnits="userSpaceOnUse">
					<stop stop-color="#f8ffff" stop-opacity=".22"/>
					<stop offset=".52" stop-color="#5f8d94" stop-opacity=".11"/>
					<stop offset="1" stop-color="#eefcfa" stop-opacity=".18"/>
				</linearGradient>
				<linearGradient id="edge" x1="810" y1="704" x2="986" y2="198" gradientUnits="userSpaceOnUse">
					<stop stop-color="#aaa79d" stop-opacity=".34"/>
					<stop offset=".38" stop-color="#fffef8" stop-opacity=".98"/>
					<stop offset="1" stop-color="#eafcff" stop-opacity=".76"/>
				</linearGradient>
				<linearGradient id="refraction" x1="868" y1="544" x2="1258" y2="525" gradientUnits="userSpaceOnUse">
					<stop stop-color="#fff"/>
					<stop offset=".56" stop-color="#eefcff"/>
					<stop offset=".76" stop-color="#fff09a"/>
					<stop offset=".88" stop-color="#63dfd1"/>
					<stop offset="1" stop-color="#b879ff"/>
				</linearGradient>
				<linearGradient id="spectrum" x1="0" y1="0" x2="0" y2="1">
					<stop stop-color="#ff342c"/>
					<stop offset=".15" stop-color="#ff9928"/>
					<stop offset=".29" stop-color="#f4e94a"/>
					<stop offset=".44" stop-color="#57df69"/>
					<stop offset=".59" stop-color="#2bd9cf"/>
					<stop offset=".74" stop-color="#268eff"/>
					<stop offset=".87" stop-color="#554cff"/>
					<stop offset="1" stop-color="#9b3dff"/>
				</linearGradient>
				<linearGradient id="sheen" x1="900" y1="240" x2="1160" y2="670" gradientUnits="userSpaceOnUse">
					<stop stop-color="#fff" stop-opacity="0"/>
					<stop offset=".47" stop-color="#fff" stop-opacity=".04"/>
					<stop offset=".55" stop-color="#fff" stop-opacity=".42"/>
					<stop offset=".64" stop-color="#fff" stop-opacity=".03"/>
					<stop offset="1" stop-color="#fff" stop-opacity="0"/>
				</linearGradient>
				<radialGradient id="flare">
					<stop stop-color="#fff" stop-opacity=".98"/>
					<stop offset=".28" stop-color="#f5f0e5" stop-opacity=".6"/>
					<stop offset="1" stop-color="#c8c4b9" stop-opacity="0"/>
				</radialGradient>
				<filter id="beam-blur" x="-15%" y="-100%" width="140%" height="300%">
					<feGaussianBlur stdDeviation="9"/>
				</filter>
				<filter id="soft-spectrum" x="-10%" y="-15%" width="120%" height="130%">
					<feGaussianBlur stdDeviation="7"/>
				</filter>
				<filter id="shadow" x="-30%" y="-30%" width="180%" height="190%">
					<feDropShadow dx="16" dy="22" stdDeviation="23" flood-color="#01070b" flood-opacity=".78"/>
				</filter>
				<filter id="flare-blur" x="-100%" y="-100%" width="300%" height="300%">
					<feGaussianBlur stdDeviation="4"/>
				</filter>
				<clipPath id="front-clip"><polygon points="986,198 810,704 1210,690"/></clipPath>
			</defs>
			<g class="spectrum">
				<polygon class="spectrum-halo" points="1258,525 1600,390 1600,814" fill="url(#spectrum)"
					filter="url(#soft-spectrum)"/>
				<polygon points="1258,525 1600,402 1600,802" fill="url(#spectrum)" opacity=".88"/>
			</g>
			<g class="beam" fill="none" stroke-linecap="round">
				<path d="M0 611 L868 544" stroke="url(#beam)" stroke-width="36" opacity=".3"
					filter="url(#beam-blur)"/>
				<path d="M0 611 L868 544" stroke="url(#beam)" stroke-width="12" opacity=".88"/>
				<path d="M0 611 L868 544" stroke="#fff" stroke-width="2.4" opacity=".94"/>
			</g>
			<g class="prism" filter="url(#shadow)">
				<polygon points="986,198 1210,690 1314,646 1090,154" fill="url(#facet)"
					stroke="#d8fbff" stroke-opacity=".36" stroke-width="2"/>
				<polygon points="986,198 810,704 1210,690" fill="url(#glass)" stroke="url(#edge)"
					stroke-width="6" stroke-linejoin="round"/>
				<g class="inside" fill="none" stroke-linecap="round">
					<path d="M868 544 L1048 551 L1258 525" stroke="#dffbff" stroke-opacity=".27"
						stroke-width="28" filter="url(#beam-blur)"/>
					<path d="M868 544 L1048 551 L1258 525" stroke="url(#refraction)" stroke-width="8.5"/>
					<path d="M868 544 L1048 551 L1258 525" stroke="#fff" stroke-width="1.7" opacity=".9"/>
				</g>
				<g clip-path="url(#front-clip)">
					<polygon class="sheen" points="900,234 973,207 1158,676 1086,679" fill="url(#sheen)"/>
				</g>
				<path d="M986 198 L1090 154 L1314 646 L1210 690" fill="none" stroke="#e9ffff"
					stroke-opacity=".42" stroke-width="2.2"/>
				<ellipse class="flare" cx="1258" cy="525" rx="22" ry="17" fill="url(#flare)"
					filter="url(#flare-blur)"/>
			</g>
		</svg>
	</main>
	<script src="assets/base.js"></script>
	<script src="assets/app.js"></script>
</body>
</html>
```
  </file>
  <file path="samples/composition/prism-light/mini/pages/assets/style.css">
```css
:root {
	--bg: #11110f;
	--text: #f3f7f8;
	--muted: #aaa79d;
	--focus: #f0e5ca;
	--font-sans: "Noto Sans CJK SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif;
	--font-display: "Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", serif;
	--settle: cubic-bezier(.16, 1, .3, 1);
}
#stage {
	isolation: isolate;
	contain: layout paint;
	background: linear-gradient(124deg, #181814 0, #10110f 54%, #0b0c0a 100%);
}
#stage::before {
	content: "";
	position: absolute;
	inset: 0;
	z-index: 8;
	pointer-events: none;
	box-shadow: inset 0 0 150px rgba(0, 0, 0, .48);
}
#stage:focus-visible { outline: 3px solid var(--focus); outline-offset: -8px; }
.cover-copy {
	position: absolute;
	z-index: 6;
	left: 112px;
	top: 104px;
	pointer-events: none;
}
h1 {
	display: flex;
	width: max-content;
	flex-direction: column;
	align-items: flex-start;
	color: #f2f5f5;
	font-family: var(--font-display);
	font-weight: 600;
	letter-spacing: -.075em;
}
h1 span { font-size: 108px; line-height: .98; white-space: nowrap; }
h1 strong {
	margin-top: 14px;
	font-size: 188px;
	font-weight: inherit;
	line-height: .84;
	letter-spacing: -.12em;
}
.cover-copy p {
	margin-top: 48px;
	color: var(--muted);
	font-size: 25px;
	line-height: 1.5;
	letter-spacing: .095em;
	white-space: nowrap;
}
.cover-copy p::before {
	content: "";
	display: inline-block;
	width: 38px;
	height: 1px;
	margin: 0 18px 8px 2px;
	background: rgba(230, 224, 207, .58);
}
.scene { z-index: 3; overflow: hidden; pointer-events: none; }
.prism, .beam, .spectrum { transform-box: fill-box; }
.prism { transform-origin: center; }
.beam { transform-origin: right center; }
.spectrum { transform-origin: left center; mix-blend-mode: screen; }
.spectrum-halo { opacity: .24; }
.settled .sheen { animation: sheen-drift 8s ease-in-out infinite alternate; }
.entering .prism { animation: prism-settle 1050ms var(--settle) both; }
.entering .beam { animation: beam-settle 950ms 180ms var(--settle) both; }
.entering .spectrum { animation: spectrum-settle 1150ms 420ms var(--settle) both; }
.paused .sheen { animation-play-state: paused; }
@keyframes prism-settle {
	from { opacity: .82; transform: translate(12px, -7px) scale(.986); }
	to { opacity: 1; transform: none; }
}
@keyframes beam-settle {
	from { opacity: .54; transform: scaleX(.97); }
	to { opacity: 1; transform: none; }
}
@keyframes spectrum-settle {
	from { opacity: .45; transform: scaleX(.91); }
	to { opacity: 1; transform: none; }
}
@keyframes sheen-drift {
	from { opacity: .18; transform: translateX(-5px); }
	to { opacity: .35; transform: translateX(8px); }
}
@media (prefers-reduced-motion: reduce) {
	.prism, .beam, .spectrum, .sheen { animation: none !important; opacity: 1; transform: none; }
}
```
  </file>
  <file path="samples/composition/prism-light/mini/pages/assets/app.js">
```javascript
(() => {
	"use strict";
	const stage = document.querySelector("#stage");
	const motion = matchMedia("(prefers-reduced-motion: reduce)");
	const listeners = new AbortController();
	let settleTimer = 0;

	Deck.init({ title: "解剖一束光", keys: false });

	function replay() {
		clearTimeout(settleTimer);
		stage.classList.remove("entering", "settled");
		void stage.offsetWidth;
		if (motion.matches) return stage.classList.add("settled");
		stage.classList.add("entering");
		settleTimer = setTimeout(() => {
			stage.classList.remove("entering");
			stage.classList.add("settled");
		}, 1700);
	}

	document.addEventListener("keydown", event => {
		const replayKey = event.key === "r" || event.key === "R" ||
			event.key === "Enter" && event.target === stage;
		if (!replayKey) return;
		event.preventDefault();
		replay();
	}, { signal: listeners.signal });
	document.addEventListener("visibilitychange", () => {
		stage.classList.toggle("paused", document.hidden);
	}, { signal: listeners.signal });
	motion.addEventListener("change", replay, { signal: listeners.signal });
	window.addEventListener("pagehide", () => {
		clearTimeout(settleTimer);
		stage.classList.add("paused");
		listeners.abort();
	}, { signal: listeners.signal, once: true });
	replay();
})();
```
  </file>
</sample>
