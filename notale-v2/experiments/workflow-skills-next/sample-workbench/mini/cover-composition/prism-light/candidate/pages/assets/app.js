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
