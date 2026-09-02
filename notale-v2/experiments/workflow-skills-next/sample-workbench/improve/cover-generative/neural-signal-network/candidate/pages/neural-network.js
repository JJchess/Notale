(() => {
  "use strict";

  const CONFIG = Object.freeze({
    seed:"notale-neural-cover-v1",
    nodeCount:720,
    linkDistance:80,
    margin:34,
    pointerRadius:168,
    propagationSpeed:840,
    maxEdges:14000,
    maxPulses:5
  });
  const AUTO_SIGNAL_POINTS = [[1240,410], [1040,690], [1450,230], [850,760]];
  const stage = document.querySelector("#stage");
  const canvas = document.querySelector("#net");
  const readouts = ["#nodes", "#links", "#signals"].map(selector => document.querySelector(selector));
  const aborter = new AbortController();
  const reducedMotion = Deck.reduced();
  const { nodeCount:N, linkDistance:LINK_DISTANCE, margin:MARGIN } = CONFIG;

  const nodeX = new Float32Array(N);
  const nodeY = new Float32Array(N);
  const nodeAngle = new Float32Array(N);
  const nodeSpeed = new Float32Array(N);
  const nodeTurn = new Float32Array(N);
  const nodePhase = new Float32Array(N);
  const nodeSize = new Float32Array(N);
  const nodeLight = new Float32Array(N);
  const edgeFrom = new Int32Array(CONFIG.maxEdges);
  const edgeTo = new Int32Array(CONFIG.maxEdges);
  const edgeDistance = new Float32Array(CONFIG.maxEdges);
  const pointer = { active:false, x:0, y:0 };

  let context;
  let width = 1600;
  let height = 900;
  let edgeCount = 0;
  let pulses = [];
  let injectedCount = 0;
  let clock = 0;
  let nextAutoSignal = 6900;
  let autoSignalStep = 0;
  let stopLoop = () => {};
  let removeResize = () => {};
  let networkColor, signalColor, glowSprite, fallbackSvg;
  let disposed = false;
  let fallback = false;
  let ready = false;

  const rgba = (color, alpha) => `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;

  function titleFieldDistance(x, y) {
    return Math.hypot((x - 365) / 470, (y - 474) / 260);
  }

  function titleFieldDensity(x, y) {
    const distance = titleFieldDistance(x, y);
    if (distance < 1) return .08;
    if (distance < 1.34) return .08 + (distance - 1) / .34 * .92;
    return 1;
  }

  function listen(target, type, handler) {
    target.addEventListener(type, handler, { signal:aborter.signal });
  }

  function createRandom(seed) {
    if (typeof Math.seedrandom === "function") return new Math.seedrandom(seed);
    fallback = true;
    stage.dataset.fallback = "seed";
    let state = 2166136261;
    for (let index = 0; index < seed.length; index++) {
      state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
    }
    return () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function rebuildEdges() {
    edgeCount = 0;
    for (let from = 0; from < N; from++) {
      for (let to = from + 1; to < N; to++) {
        const dx = nodeX[from] - nodeX[to];
        const dy = nodeY[from] - nodeY[to];
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < LINK_DISTANCE * LINK_DISTANCE) {
          edgeFrom[edgeCount] = from;
          edgeTo[edgeCount] = to;
          edgeDistance[edgeCount++] = Math.sqrt(distanceSquared);
        }
      }
    }
  }

  function computeArrivalTimes(source) {
    const neighbors = Array.from({ length:N }, () => []);
    for (let edge = 0; edge < edgeCount; edge++) {
      const from = edgeFrom[edge];
      const to = edgeTo[edge];
      const travelTime = edgeDistance[edge] / CONFIG.propagationSpeed;
      neighbors[from].push([to, travelTime]);
      neighbors[to].push([from, travelTime]);
    }

    const arrival = new Float32Array(N);
    const queued = new Uint8Array(N);
    const queue = [source];
    arrival.fill(Infinity);
    arrival[source] = 0;
    queued[source] = 1;
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      queued[node] = 0;
      for (const [neighbor, travelTime] of neighbors[node]) {
        const candidate = arrival[node] + travelTime;
        if (candidate + 1e-5 < arrival[neighbor]) {
          arrival[neighbor] = candidate;
          if (!queued[neighbor]) {
            queue.push(neighbor);
            queued[neighbor] = 1;
          }
        }
      }
    }
    return arrival;
  }

  function injectSignal(x, y, amplitude = 1, startedAt = clock, tally = true) {
    rebuildEdges();
    let source = 0;
    let nearestDistance = Infinity;
    for (let node = 0; node < N; node++) {
      const dx = nodeX[node] - x;
      const dy = nodeY[node] - y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < nearestDistance) {
        nearestDistance = distanceSquared;
        source = node;
      }
    }
    if (pulses.length === CONFIG.maxPulses) pulses.shift();
    pulses.push({ arrival:computeArrivalTimes(source), startedAt, amplitude });
    if (tally) {
      injectedCount++;
      updateReadouts();
    }
  }

  function resetModel() {
    if (disposed) return;
    const random = createRandom(CONFIG.seed);
    for (let node = 0; node < N; node++) {
      let x, y, attempts = 0;
      do {
        x = -MARGIN + random() * (width + 2 * MARGIN);
        y = -MARGIN + random() * (height + 2 * MARGIN);
      } while (titleFieldDistance(x, y) < 1 && ++attempts < 16);
      nodeX[node] = x;
      nodeY[node] = y;
      nodeAngle[node] = random() * 7;
      nodeSpeed[node] = 5 + random() * 15;
      nodeTurn[node] = (random() - .5) * .24;
      nodePhase[node] = random() * 7;
      nodeSize[node] = .75 + random() * 1.35;
    }
    pointer.active = false;
    pulses = [];
    injectedCount = clock = autoSignalStep = 0;
    nextAutoSignal = 6900;
    injectSignal(800, 706, .82, 900, false);
    updateReadouts();
  }

  function advanceNodes(deltaMs) {
    const delta = Math.min(deltaMs, 50) / 1000;
    const time = clock / 1000;
    const lowerBound = -MARGIN;
    for (let node = 0; node < N; node++) {
      nodeAngle[node] += (nodeTurn[node] + Math.sin(time * .31 + nodePhase[node]) * .055) * delta;
      nodeX[node] += Math.cos(nodeAngle[node]) * nodeSpeed[node] * delta;
      nodeY[node] += Math.sin(nodeAngle[node]) * nodeSpeed[node] * delta;
      if (nodeX[node] < lowerBound || nodeX[node] > width + MARGIN) {
        nodeX[node] = Deck.clamp(nodeX[node], lowerBound, width + MARGIN);
        nodeAngle[node] = Math.PI - nodeAngle[node];
      }
      if (nodeY[node] < lowerBound || nodeY[node] > height + MARGIN) {
        nodeY[node] = Deck.clamp(nodeY[node], lowerBound, height + MARGIN);
        nodeAngle[node] = -nodeAngle[node];
      }
      if (pointer.active) {
        const dx = nodeX[node] - pointer.x;
        const dy = nodeY[node] - pointer.y;
        const distance = Math.hypot(dx, dy) || .001;
        const force = 1 - distance / CONFIG.pointerRadius;
        if (force > 0) {
          nodeX[node] += dx / distance * force * force * 46 * delta;
          nodeY[node] += dy / distance * force * force * 46 * delta;
        }
      }
    }
  }

  function updateNodeLight() {
    nodeLight.fill(0);
    if (pointer.active) {
      for (let node = 0; node < N; node++) {
        const force = 1 - Math.hypot(nodeX[node] - pointer.x, nodeY[node] - pointer.y) / CONFIG.pointerRadius;
        if (force > 0) nodeLight[node] = Math.min(1, force * force * 1.15);
      }
    }
    for (let index = pulses.length - 1; index >= 0; index--) {
      const pulse = pulses[index];
      const age = (clock - pulse.startedAt) / 1000;
      if (age > 5) {
        pulses.splice(index, 1);
        continue;
      }
      if (age < 0) continue;
      const fade = age < 4 ? 1 : 5 - age;
      for (let node = 0; node < N; node++) {
        const lag = age - pulse.arrival[node];
        if (lag >= 0 && lag < 1.5) {
          nodeLight[node] = Math.max(nodeLight[node], Math.exp(-lag * 2.7) * pulse.amplitude * fade);
        }
      }
    }
  }

  function drawNetwork() {
    if (!context || disposed) return;
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    rebuildEdges();
    updateNodeLight();

    const alphaByBucket = [.026, .047, .075, .112, .17];
    for (let bucket = 0; bucket < 5; bucket++) {
      context.beginPath();
      for (let edge = 0; edge < edgeCount; edge++) {
        const from = edgeFrom[edge];
        const to = edgeTo[edge];
        const density = (1 - edgeDistance[edge] / LINK_DISTANCE) *
          titleFieldDensity((nodeX[from] + nodeX[to]) / 2, (nodeY[from] + nodeY[to]) / 2);
        if (Math.min(4, density * 5 | 0) === bucket) {
          context.moveTo(nodeX[from], nodeY[from]);
          context.lineTo(nodeX[to], nodeY[to]);
        }
      }
      context.strokeStyle = rgba(networkColor, alphaByBucket[bucket]);
      context.lineWidth = 1;
      context.stroke();
    }

    context.beginPath();
    for (let edge = 0; edge < edgeCount; edge++) {
      const from = edgeFrom[edge];
      const to = edgeTo[edge];
      if ((nodeLight[from] > .12 || nodeLight[to] > .12) &&
          titleFieldDensity((nodeX[from] + nodeX[to]) / 2, (nodeY[from] + nodeY[to]) / 2) > .18) {
        context.moveTo(nodeX[from], nodeY[from]);
        context.lineTo(nodeX[to], nodeY[to]);
      }
    }
    context.strokeStyle = rgba(signalColor, .3);
    context.lineWidth = 1.2;
    context.stroke();

    const pulseFronts = [];
    context.beginPath();
    for (const pulse of pulses) {
      const age = (clock - pulse.startedAt) / 1000;
      if (age < 0 || age > 4.32) continue;
      for (let edge = 0; edge < edgeCount; edge++) {
        const from = edgeFrom[edge];
        const to = edgeTo[edge];
        const fromArrival = pulse.arrival[from];
        const toArrival = pulse.arrival[to];
        const start = Math.min(fromArrival, toArrival);
        const end = Math.max(fromArrival, toArrival);
        if (!isFinite(start) || age < start || age > end + .32 ||
            titleFieldDensity((nodeX[from] + nodeX[to]) / 2, (nodeY[from] + nodeY[to]) / 2) < .18) continue;
        context.moveTo(nodeX[from], nodeY[from]);
        context.lineTo(nodeX[to], nodeY[to]);
        if (age <= end && end > start) {
          const earlier = fromArrival < toArrival ? from : to;
          const later = fromArrival < toArrival ? to : from;
          const progress = (age - start) / (end - start);
          pulseFronts.push(
            Deck.lerp(nodeX[earlier], nodeX[later], progress),
            Deck.lerp(nodeY[earlier], nodeY[later], progress)
          );
        }
      }
    }
    context.strokeStyle = rgba(signalColor, .82);
    context.lineWidth = 1.55;
    context.stroke();

    context.fillStyle = rgba(networkColor, .34);
    context.beginPath();
    for (let node = 0; node < N; node++) {
      if (nodeLight[node] <= .06 && titleFieldDensity(nodeX[node], nodeY[node]) > .22) {
        context.moveTo(nodeX[node] + nodeSize[node], nodeY[node]);
        context.arc(nodeX[node], nodeY[node], nodeSize[node], 0, 7);
      }
    }
    context.fill();

    context.save();
    context.globalCompositeOperation = "lighter";
    for (let node = 0; node < N; node++) {
      if (nodeLight[node] > .06) {
        const light = Math.min(1, nodeLight[node]);
        const glowSize = 10 + 30 * light;
        context.globalAlpha = .28 + .62 * light;
        context.drawImage(glowSprite, nodeX[node] - glowSize / 2, nodeY[node] - glowSize / 2, glowSize, glowSize);
      }
    }
    context.restore();

    context.fillStyle = "#dcfdff";
    context.beginPath();
    for (let node = 0; node < N; node++) {
      if (nodeLight[node] > .06) {
        const radius = nodeSize[node] + Math.min(1, nodeLight[node]) * 1.3;
        context.moveTo(nodeX[node] + radius, nodeY[node]);
        context.arc(nodeX[node], nodeY[node], radius, 0, 7);
      }
    }
    for (let index = 0; index < pulseFronts.length; index += 2) {
      context.moveTo(pulseFronts[index] + 2.1, pulseFronts[index + 1]);
      context.arc(pulseFronts[index], pulseFronts[index + 1], 2.1, 0, 7);
    }
    context.fill();
    updateReadouts();
  }

  function updateReadouts() {
    readouts[0].textContent = N;
    readouts[1].textContent = edgeCount;
    readouts[2].textContent = injectedCount;
    readouts[0].className = nodeLight.some(value => value > .06) ? "on" : "";
    readouts[2].className = injectedCount ? "on" : "";
  }

  function renderFrame(_time, deltaMs) {
    clock = reducedMotion ? 1400 : clock + Math.min(deltaMs, 50);
    if (!reducedMotion && clock >= nextAutoSignal) {
      const point = AUTO_SIGNAL_POINTS[autoSignalStep++ % AUTO_SIGNAL_POINTS.length];
      injectSignal(...point, .46, clock, false);
      nextAutoSignal = clock + 7800;
    }
    advanceNodes(reducedMotion ? 0 : deltaMs);
    drawNetwork();
  }

  function setPointer(event) {
    const point = Deck.pt(canvas, event);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.active = true;
    return point;
  }

  function buildGlowSprite() {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 40;
    const spriteContext = sprite.getContext("2d");
    const gradient = spriteContext.createRadialGradient(20, 20, 0, 20, 20, 20);
    gradient.addColorStop(0, "#bff");
    gradient.addColorStop(.35, "#00e5ff80");
    gradient.addColorStop(1, "#00e5ff00");
    spriteContext.fillStyle = gradient;
    spriteContext.fillRect(0, 0, 40, 40);
    return sprite;
  }

  function renderSvgFallback() {
    const svgNamespace = "http://www.w3.org/2000/svg";
    fallbackSvg = document.createElementNS(svgNamespace, "svg");
    fallbackSvg.classList.add("fallback-network");
    fallbackSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    fallbackSvg.setAttribute("aria-hidden", "true");
    rebuildEdges();
    updateNodeLight();

    let links = "";
    let activeLinks = "";
    for (let edge = 0; edge < edgeCount; edge++) {
      const from = edgeFrom[edge];
      const to = edgeTo[edge];
      if (titleFieldDensity((nodeX[from] + nodeX[to]) / 2, (nodeY[from] + nodeY[to]) / 2) <= .18) continue;
      const segment = `M${nodeX[from]} ${nodeY[from]}L${nodeX[to]} ${nodeY[to]}`;
      links += segment;
      if (nodeLight[from] > .12 || nodeLight[to] > .12) activeLinks += segment;
    }
    const nodes = Array.from({ length:N }, (_, node) =>
      titleFieldDensity(nodeX[node], nodeY[node]) > .22 ? `M${nodeX[node]} ${nodeY[node]}h.1` : ""
    ).join("");
    const path = (data, color, opacity, width) => {
      const element = document.createElementNS(svgNamespace, "path");
      element.setAttribute("d", data);
      element.setAttribute("fill", "none");
      element.setAttribute("stroke", color);
      element.setAttribute("stroke-opacity", opacity);
      element.setAttribute("stroke-width", width);
      element.setAttribute("stroke-linecap", "round");
      return element;
    };
    fallbackSvg.append(
      path(links, "currentColor", ".16", "1"),
      path(nodes, "currentColor", ".58", "2.2"),
      path(activeLinks, "#00e5ff", ".72", "1.5")
    );
    stage.insertBefore(fallbackSvg, stage.firstChild);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    stopLoop();
    removeResize();
    aborter.abort();
    glowSprite = null;
    fallbackSvg?.remove();
  }

  listen(stage, "pointermove", event => {
    if (disposed) return;
    setPointer(event);
    if (reducedMotion) drawNetwork();
  });
  listen(stage, "pointerleave", () => {
    if (disposed) return;
    pointer.active = false;
    if (reducedMotion) drawNetwork();
  });
  listen(stage, "pointerdown", event => {
    if (disposed) return;
    const point = setPointer(event);
    stage.focus({ preventScroll:true });
    injectSignal(point.x, point.y, 1, reducedMotion ? clock - 650 : clock);
    if (reducedMotion) drawNetwork();
  });
  listen(stage, "keydown", event => {
    if (disposed) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      injectSignal(1060, 520, 1, reducedMotion ? clock - 650 : clock);
      if (reducedMotion) drawNetwork();
    } else if (event.key.toLowerCase() === "r") {
      resetModel();
      if (reducedMotion) clock = 1400;
      drawNetwork();
    }
  });
  listen(window, "pagehide", dispose);

  Deck.init();
  try {
    context = Deck.fit(canvas);
  } catch (_error) {
    context = null;
  }
  if (!context) {
    fallback = true;
    stage.dataset.fallback = "true";
  }
  networkColor = Deck.rgb("network");
  signalColor = Deck.rgb("signal");
  if (context) glowSprite = buildGlowSprite();
  resetModel();
  if (context) {
    removeResize = Deck.onResize(() => {
      if (disposed) return;
      context = Deck.fit(canvas);
      drawNetwork();
    });
    stopLoop = Deck.loop(renderFrame, { still:1400 });
  } else {
    if (reducedMotion) clock = 1400;
    renderSvgFallback();
    updateReadouts();
  }
  ready = true;

  window.NeuralSignalNetwork = {
    reset:() => {
      if (disposed) return;
      resetModel();
      if (reducedMotion) clock = 1400;
      drawNetwork();
    },
    inject:(x, y, amplitude = 1) => {
      if (disposed) return;
      injectSignal(x, y, amplitude, reducedMotion ? clock - 650 : clock);
      if (reducedMotion) drawNetwork();
    },
    pointer:(x, y, active = true) => {
      if (disposed) return;
      Object.assign(pointer, { x, y, active });
      if (reducedMotion) drawNetwork();
    },
    step:deltaMs => { if (!disposed) renderFrame(clock, deltaMs); },
    dispose,
    getState:() => ({
      ready, fallback, disposed, reducedMotion, clock, edgeCount, injectedCount,
      nextAutoSignal, autoSignalStep, pulseCount:pulses.length,
      pointer:{ ...pointer }
    }),
    inspectModel:() => ({
      x:Array.from(nodeX), y:Array.from(nodeY), angle:Array.from(nodeAngle),
      edges:Array.from({ length:edgeCount }, (_, index) => [edgeFrom[index], edgeTo[index], edgeDistance[index]]),
      pulses:pulses.map(pulse => ({
        startedAt:pulse.startedAt,
        amplitude:pulse.amplitude,
        arrival:Array.from(pulse.arrival)
      }))
    })
  };
})();
