(function () {
  "use strict";

  Deck.init({
    title: "谁连接了两个授粉群落？",
    total: 1,
    keys: false
  });

  // Canonical teaching records. Renderer input is always derived from these untouched values.
  const CANONICAL_NODES = Object.freeze([
    { id: "plant-clover", label: "红三叶", kind: "plant", community: "a", nx: .070, ny: .205 },
    { id: "plant-sage", label: "林下鼠尾草", kind: "plant", community: "a", nx: .070, ny: .405 },
    { id: "plant-hawthorn", label: "山楂", kind: "plant", community: "a", nx: .070, ny: .605 },
    { id: "plant-bramble", label: "覆盆子", kind: "plant", community: "a", nx: .070, ny: .805 },
    { id: "bee-osmia", label: "红壁蜂", kind: "pollinator", local: "a", nx: .305, ny: .265 },
    { id: "bee-leafcutter", label: "切叶蜂", kind: "pollinator", local: "a", nx: .305, ny: .515 },
    { id: "bee-longhorn", label: "长角蜂", kind: "pollinator", local: "a", nx: .305, ny: .745 },
    { id: "bee-bumble", label: "白尾熊蜂", kind: "pollinator", nx: .500, ny: .375 },
    { id: "fly-hover", label: "条纹食蚜蝇", kind: "pollinator", nx: .500, ny: .650 },
    { id: "bee-reed", label: "芦蜂", kind: "pollinator", local: "b", nx: .695, ny: .265 },
    { id: "butterfly-ringlet", label: "眼蝶", kind: "pollinator", local: "b", nx: .695, ny: .515 },
    { id: "moth-silver", label: "银纹夜蛾", kind: "pollinator", local: "b", nx: .695, ny: .745 },
    { id: "plant-loosestrife", label: "千屈菜", kind: "plant", community: "b", nx: .930, ny: .205 },
    { id: "plant-vetchling", label: "草甸山黧豆", kind: "plant", community: "b", nx: .930, ny: .405 },
    { id: "plant-scabious", label: "松虫草", kind: "plant", community: "b", nx: .930, ny: .605 },
    { id: "plant-angelica", label: "欧当归", kind: "plant", community: "b", nx: .930, ny: .805 }
  ]);

  const CANONICAL_LINKS = Object.freeze([
    { id: "l01", pollinator: "bee-bumble", plant: "plant-clover", visits: 32 },
    { id: "l02", pollinator: "bee-bumble", plant: "plant-sage", visits: 21 },
    { id: "l03", pollinator: "bee-bumble", plant: "plant-hawthorn", visits: 10 },
    { id: "l04", pollinator: "bee-bumble", plant: "plant-bramble", visits: 28 },
    { id: "l05", pollinator: "bee-bumble", plant: "plant-loosestrife", visits: 19 },
    { id: "l06", pollinator: "bee-bumble", plant: "plant-vetchling", visits: 24 },
    { id: "l07", pollinator: "bee-bumble", plant: "plant-scabious", visits: 17 },
    { id: "l08", pollinator: "bee-bumble", plant: "plant-angelica", visits: 18 },
    { id: "l09", pollinator: "fly-hover", plant: "plant-clover", visits: 11 },
    { id: "l10", pollinator: "fly-hover", plant: "plant-sage", visits: 14 },
    { id: "l11", pollinator: "fly-hover", plant: "plant-hawthorn", visits: 19 },
    { id: "l12", pollinator: "fly-hover", plant: "plant-bramble", visits: 9 },
    { id: "l13", pollinator: "fly-hover", plant: "plant-loosestrife", visits: 8 },
    { id: "l14", pollinator: "fly-hover", plant: "plant-vetchling", visits: 10 },
    { id: "l15", pollinator: "fly-hover", plant: "plant-scabious", visits: 17 },
    { id: "l16", pollinator: "fly-hover", plant: "plant-angelica", visits: 12 },
    { id: "l17", pollinator: "bee-osmia", plant: "plant-clover", visits: 25 },
    { id: "l18", pollinator: "bee-osmia", plant: "plant-sage", visits: 33 },
    { id: "l19", pollinator: "bee-leafcutter", plant: "plant-sage", visits: 15 },
    { id: "l20", pollinator: "bee-leafcutter", plant: "plant-bramble", visits: 29 },
    { id: "l21", pollinator: "bee-longhorn", plant: "plant-clover", visits: 19 },
    { id: "l22", pollinator: "bee-longhorn", plant: "plant-hawthorn", visits: 27 },
    { id: "l23", pollinator: "bee-reed", plant: "plant-loosestrife", visits: 30 },
    { id: "l24", pollinator: "bee-reed", plant: "plant-vetchling", visits: 20 },
    { id: "l25", pollinator: "butterfly-ringlet", plant: "plant-vetchling", visits: 18 },
    { id: "l26", pollinator: "butterfly-ringlet", plant: "plant-scabious", visits: 31 },
    { id: "l27", pollinator: "moth-silver", plant: "plant-scabious", visits: 22 },
    { id: "l28", pollinator: "moth-silver", plant: "plant-angelica", visits: 26 }
  ]);

  const nodeById = new Map(CANONICAL_NODES.map(d => [d.id, d]));
  const pollinatorCommunities = new Map();
  CANONICAL_LINKS.forEach(link => {
    const set = pollinatorCommunities.get(link.pollinator) || new Set();
    set.add(nodeById.get(link.plant).community);
    pollinatorCommunities.set(link.pollinator, set);
  });
  const bridgeIds = new Set(
    Array.from(pollinatorCommunities.entries())
      .filter(([, communities]) => communities.size > 1)
      .map(([id]) => id)
  );

  const state = {
    view: "bridge",
    selected: null
  };

  const svgElement = document.getElementById("networkSvg");
  const host = document.getElementById("networkHost");
  const status = document.getElementById("chartStatus");
  const fallback = document.getElementById("chartFallback");
  const bridgeViewButton = document.getElementById("bridgeView");
  const fullViewButton = document.getElementById("fullView");
  const resetButton = document.getElementById("resetView");
  const cleanups = [];
  let simulation = null;
  let graph = null;
  let resizeFrame = 0;
  let destroyed = false;

  function addListener(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  function seededRandom(seed) {
    let value = seed >>> 0;
    return function () {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function formatVisits(value) {
    return `${value} 次`;
  }

  function entityId(nodeOrId) {
    return typeof nodeOrId === "object" ? nodeOrId.id : nodeOrId;
  }

  function summarizePollinator(id) {
    const totals = { a: 0, b: 0, total: 0 };
    CANONICAL_LINKS.forEach(link => {
      if (link.pollinator !== id) return;
      const community = nodeById.get(link.plant).community;
      totals[community] += link.visits;
      totals.total += link.visits;
    });
    return totals;
  }

  function renderEvidence() {
    const list = document.getElementById("bridgeList");
    list.replaceChildren();
    Array.from(bridgeIds).forEach(id => {
      const record = nodeById.get(id);
      const totals = summarizePollinator(id);
      const item = document.createElement("article");
      item.className = "bridge-evidence";
      item.innerHTML = `
        <button class="entity-button" type="button" data-entity="${id}" aria-label="聚焦${record.label}">
          <span class="entity-hex" aria-hidden="true"></span>${record.label}
        </button>
        <span class="entity-total">合计 ${formatVisits(totals.total)}</span>
        <div class="split-bar" aria-hidden="true">
          <span class="split-a" style="width:${(totals.a / totals.total * 100).toFixed(2)}%"></span>
          <span class="split-b" style="width:${(totals.b / totals.total * 100).toFixed(2)}%"></span>
        </div>
        <div class="split-values">
          <span>林缘 <strong>${formatVisits(totals.a)}</strong></span>
          <span>湿草甸 <strong>${formatVisits(totals.b)}</strong></span>
        </div>`;
      list.appendChild(item);
    });
    list.querySelectorAll("[data-entity]").forEach(button => {
      addListener(button, "click", () => selectEntity(button.dataset.entity));
    });
  }

  function populateFallback() {
    const rows = document.getElementById("fallbackRows");
    const labels = { a: "林缘", b: "湿草甸" };
    rows.replaceChildren();
    CANONICAL_LINKS.forEach(link => {
      const plant = nodeById.get(link.plant);
      const pollinator = nodeById.get(link.pollinator);
      const row = document.createElement("tr");
      row.innerHTML = `<td>${pollinator.label}</td><td>${plant.label}</td><td>${labels[plant.community]}</td><td>${formatVisits(link.visits)}</td>`;
      rows.appendChild(row);
    });
  }

  function flowerMark(selection) {
    const angles = [-90, -18, 54, 126, 198];
    angles.forEach(angle => {
      const radians = angle * Math.PI / 180;
      selection.append("circle")
        .attr("class", "plant-petal")
        .attr("cx", Math.cos(radians) * 9)
        .attr("cy", Math.sin(radians) * 9)
        .attr("r", 8.5);
    });
    selection.append("circle").attr("class", "plant-core").attr("r", 5.5);
  }

  function pollinatorMark(selection, bridge) {
    const r = bridge ? 20 : 17;
    const points = Array.from({ length: 6 }, (_, index) => {
      const a = Math.PI / 3 * index;
      return `${Math.cos(a) * r},${Math.sin(a) * r}`;
    }).join(" ");
    selection.append("polygon")
      .attr("class", `pollinator-mark${bridge ? " bridge" : ""}`)
      .attr("points", points);
    selection.append("line").attr("class", "pollinator-stripe").attr("x1", -7).attr("x2", -7).attr("y1", -11).attr("y2", 11);
    selection.append("line").attr("class", "pollinator-stripe").attr("x1", 2).attr("x2", 2).attr("y1", -14).attr("y2", 14);
  }

  function buildLayout(width, height) {
    const random = seededRandom(0xB10D1E);
    const topPad = 34;
    const usableHeight = height - 42;
    const nodes = CANONICAL_NODES.map(record => ({
      ...record,
      bridge: bridgeIds.has(record.id),
      tx: record.nx * width,
      ty: topPad + record.ny * usableHeight,
      x: record.nx * width + (random() - .5) * 18,
      y: topPad + record.ny * usableHeight + (random() - .5) * 18
    }));
    const nodesById = new Map(nodes.map(node => [node.id, node]));
    const links = CANONICAL_LINKS.map(record => {
      const plant = nodesById.get(record.plant);
      return {
        ...record,
        source: record.pollinator,
        target: record.plant,
        bridge: bridgeIds.has(record.pollinator),
        community: plant.community
      };
    });

    if (simulation) simulation.stop();
    simulation = d3.forceSimulation(nodes)
      .randomSource(seededRandom(0x5E771E))
      .force("link", d3.forceLink(links)
        .id(node => node.id)
        .distance(link => link.bridge ? width * .315 : width * .215)
        .strength(link => link.bridge ? .018 : .045))
      .force("charge", d3.forceManyBody().strength(node => node.bridge ? -125 : -82))
      .force("collide", d3.forceCollide().radius(node => node.bridge ? 44 : 36).iterations(2))
      .force("x", d3.forceX(node => node.tx).strength(node => node.bridge ? .88 : .66))
      .force("y", d3.forceY(node => node.ty).strength(.74))
      .alpha(1)
      .alphaDecay(.0228)
      .velocityDecay(.48)
      .stop();

    for (let i = 0; i < 340; i += 1) simulation.tick();
    simulation.stop();

    nodes.forEach(node => {
      node.x = Math.max(40, Math.min(width - 40, node.x));
      node.y = Math.max(66, Math.min(height - 34, node.y));
    });

    return { nodes, links };
  }

  function edgePath(link) {
    const sx = link.source.x;
    const sy = link.source.y;
    const tx = link.target.x;
    const ty = link.target.y;
    const direction = link.community === "a" ? -1 : 1;
    const hash = parseInt(link.id.slice(1), 10);
    const bow = ((hash % 3) - 1) * 6 + direction * (link.bridge ? 5 : 2);
    const mx = (sx + tx) / 2;
    const my = (sy + ty) / 2 + bow;
    return `M${sx.toFixed(2)},${sy.toFixed(2)} Q${mx.toFixed(2)},${my.toFixed(2)} ${tx.toFixed(2)},${ty.toFixed(2)}`;
  }

  function renderGraph() {
    if (destroyed || !window.d3) return;
    const width = Math.max(900, Math.round(host.clientWidth || 1100));
    const height = Math.max(430, Math.round(host.clientHeight || 506));
    const svg = d3.select(svgElement);
    svg.selectAll("*").interrupt();
    svg.selectAll("g[data-layer]").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    graph = buildLayout(width, height);
    graph.width = width;
    graph.height = height;
    const weight = d3.scaleSqrt().domain([0, 34]).range([1.1, 8.6]);

    const backdrop = svg.append("g").attr("data-layer", "backdrop").attr("aria-hidden", "true");
    backdrop.append("rect")
      .attr("class", "community-zone a")
      .attr("x", 18).attr("y", 18)
      .attr("width", width * .405).attr("height", height - 34)
      .attr("rx", 86);
    backdrop.append("rect")
      .attr("class", "community-zone b")
      .attr("x", width * .575).attr("y", 18)
      .attr("width", width * .408).attr("height", height - 34)
      .attr("rx", 86);
    backdrop.append("rect")
      .attr("class", "bridge-band")
      .attr("x", width * .437).attr("y", 16)
      .attr("width", width * .126).attr("height", height - 30)
      .attr("rx", 58);

    backdrop.append("text").attr("class", "zone-label a").attr("x", 42).attr("y", 42).text("A · 林缘植物群落");
    backdrop.append("text").attr("class", "zone-sub").attr("x", 42).attr("y", 58).text("4 种植物 · 3 位局部访花者");
    backdrop.append("text").attr("class", "zone-label b").attr("x", width - 42).attr("y", 42).attr("text-anchor", "end").text("B · 湿草甸植物群落");
    backdrop.append("text").attr("class", "zone-sub").attr("x", width - 42).attr("y", 58).attr("text-anchor", "end").text("4 种植物 · 3 位局部访花者");
    backdrop.append("text").attr("class", "zone-label bridge").attr("x", width / 2).attr("y", 37).text("桥接走廊");
    backdrop.append("text").attr("class", "zone-sub bridge").attr("x", width / 2).attr("y", 53).text("同时抵达 A + B");

    const orderedLinks = graph.links.slice().sort((a, b) => Number(a.bridge) - Number(b.bridge) || a.visits - b.visits);
    const links = svg.append("g").attr("data-layer", "links").attr("aria-hidden", "true")
      .selectAll("path")
      .data(orderedLinks, d => d.id)
      .join("path")
      .attr("class", d => `link community-${d.community}`)
      .attr("d", edgePath)
      .attr("stroke-width", d => weight(d.visits));
    links.append("title").text(d => `${nodeById.get(d.pollinator).label} → ${nodeById.get(d.plant).label}：${formatVisits(d.visits)}`);

    const haloLayer = svg.append("g").attr("data-layer", "halos").attr("aria-hidden", "true");
    const halos = haloLayer.selectAll("circle")
      .data(graph.nodes.filter(node => node.bridge), d => d.id)
      .join("circle")
      .attr("class", "bridge-halo")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 32);

    const nodes = svg.append("g").attr("data-layer", "nodes")
      .selectAll("g.node")
      .data(graph.nodes, d => d.id)
      .join("g")
      .attr("class", "node")
      .attr("transform", d => `translate(${d.x},${d.y})`)
      .attr("tabindex", 0)
      .attr("role", "button")
      .attr("aria-label", d => {
        if (d.kind === "plant") return `${d.label}，植物，${d.community === "a" ? "林缘" : "湿草甸"}群落`;
        const total = summarizePollinator(d.id).total;
        return `${d.label}，传粉者，${d.bridge ? "连接两个群落" : "只连接一个群落"}，共 ${formatVisits(total)}`;
      });

    nodes.append("circle").attr("class", "node-focus").attr("r", d => d.bridge ? 28 : 24);
    nodes.append("circle").attr("r", 27).attr("fill", "transparent").attr("aria-hidden", "true");
    nodes.each(function (node) {
      const mark = d3.select(this).append("g").attr("aria-hidden", "true");
      if (node.kind === "plant") flowerMark(mark);
      else pollinatorMark(mark, node.bridge);
    });

    nodes.each(function (node) {
      const group = d3.select(this);
      let x = 0;
      let y = 0;
      let anchor = "middle";
      if (node.kind === "plant" && node.community === "a") { x = 25; y = 4; anchor = "start"; }
      else if (node.kind === "plant") { x = -25; y = 4; anchor = "end"; }
      else if (node.bridge) { x = 0; y = 36; }
      else { x = 0; y = 31; }
      group.append("text")
        .attr("class", `node-label${node.bridge ? " bridge" : ""}`)
        .attr("x", x).attr("y", y).attr("text-anchor", anchor)
        .text(node.label);
      if (node.kind === "pollinator" && !node.bridge) {
        group.append("text").attr("class", "node-role").attr("x", 0).attr("y", y + 15).attr("text-anchor", "middle").text("局部访花者");
      }
      if (node.bridge) {
        const tag = group.append("g").attr("class", "bridge-tag").attr("transform", "translate(0,-34)").attr("aria-hidden", "true");
        tag.append("rect").attr("x", -22).attr("y", -10).attr("width", 44).attr("height", 20).attr("rx", 10);
        tag.append("text").attr("y", 4).text("桥梁");
      }
    });

    nodes.on("click.network", (_, node) => selectEntity(node.id));
    nodes.on("keydown.network", function (event, node) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectEntity(node.id);
      }
    });
    nodes.on("focus.network", (_, node) => selectEntity(node.id));

    graph.linksSelection = links;
    graph.nodesSelection = nodes;
    graph.halosSelection = halos;
    updateView(false);
  }

  function updateView(animate) {
    if (!graph) return;
    const duration = animate && !Deck.reduced() ? 220 : 0;
    const selected = state.selected;
    const selectionIsBridge = selected && bridgeIds.has(selected);
    const linkedIds = new Set();
    if (selected) {
      graph.links.forEach(link => {
        const sourceId = entityId(link.source);
        const targetId = entityId(link.target);
        if (sourceId === selected || targetId === selected) {
          linkedIds.add(sourceId);
          linkedIds.add(targetId);
        }
      });
    }

    function linkOpacity(link) {
      const sourceId = entityId(link.source);
      const targetId = entityId(link.target);
      if (selected) return sourceId === selected || targetId === selected ? .92 : .045;
      if (state.view === "bridge") return link.bridge ? .78 : .105;
      return link.bridge ? .70 : .52;
    }

    function nodeOpacity(node) {
      if (selected) return node.id === selected || linkedIds.has(node.id) ? 1 : .20;
      if (state.view === "bridge" && node.kind === "pollinator" && !node.bridge) return .68;
      return 1;
    }

    graph.linksSelection.interrupt().transition().duration(duration).style("opacity", linkOpacity);
    graph.nodesSelection.interrupt().transition().duration(duration).style("opacity", nodeOpacity);
    graph.halosSelection.interrupt().transition().duration(duration)
      .style("opacity", node => selected ? (node.id === selected && selectionIsBridge ? 1 : .10) : .92);

    bridgeViewButton.setAttribute("aria-pressed", state.view === "bridge" ? "true" : "false");
    fullViewButton.setAttribute("aria-pressed", state.view === "full" ? "true" : "false");
    document.querySelectorAll("[data-entity]").forEach(button => {
      button.setAttribute("aria-pressed", button.dataset.entity === selected ? "true" : "false");
    });

    if (selected) {
      const record = nodeById.get(selected);
      if (record.kind === "pollinator") {
        const totals = summarizePollinator(selected);
        status.textContent = bridgeIds.has(selected)
          ? `${record.label}：林缘 ${formatVisits(totals.a)}，湿草甸 ${formatVisits(totals.b)}，合计 ${formatVisits(totals.total)}。`
          : `${record.label}：只访问${record.local === "a" ? "林缘" : "湿草甸"}植物，合计 ${formatVisits(totals.total)}。`;
      } else {
        const incoming = CANONICAL_LINKS.filter(link => link.plant === selected);
        const visits = incoming.reduce((sum, link) => sum + link.visits, 0);
        status.textContent = `${record.label}：${record.community === "a" ? "林缘" : "湿草甸"}植物，被 ${incoming.length} 位传粉者访问，共 ${formatVisits(visits)}。`;
      }
    } else if (state.view === "bridge") {
      status.textContent = "桥接证据：2 位传粉者同时连向 A 与 B，共显示 16 条桥接者访花边。";
    } else {
      status.textContent = `完整网络：8 位传粉者、8 种植物、${CANONICAL_LINKS.length} 条访花关系。`;
    }
  }

  function setView(view) {
    state.view = view;
    state.selected = null;
    updateView(true);
  }

  function selectEntity(id) {
    if (!nodeById.has(id)) return;
    state.selected = id;
    updateView(true);
  }

  function resetPage() {
    state.view = "bridge";
    state.selected = null;
    renderGraph();
    status.textContent = "桥接证据：2 位传粉者同时连向 A 与 B，共显示 16 条桥接者访花边。";
  }

  function scheduleResize() {
    if (resizeFrame || destroyed) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      renderGraph();
    });
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (event.key === "1") setView("bridge");
    else if (event.key === "2") setView("full");
    else if (event.key.toLowerCase() === "r") resetPage();
    else if (event.key === "Escape" && state.selected) {
      state.selected = null;
      updateView(true);
    }
  }

  function scrollFallback(event) {
    const page = fallback.clientHeight * .8;
    const amount = { PageDown: page, PageUp: -page, End: fallback.scrollHeight, Home: -fallback.scrollHeight }[event.key];
    if (!amount) return;
    event.preventDefault();
    fallback.scrollBy(0, amount);
  }

  function teardown() {
    if (destroyed) return;
    destroyed = true;
    if (simulation) simulation.stop();
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    if (window.d3) d3.select(svgElement).selectAll("*").interrupt().on(".network", null);
    cleanups.splice(0).forEach(cleanup => cleanup());
  }

  renderEvidence();
  populateFallback();
  document.getElementById("recordCount").textContent = `${CANONICAL_NODES.length} 节点 · ${CANONICAL_LINKS.length} 关系`;

  addListener(bridgeViewButton, "click", () => setView("bridge"));
  addListener(fullViewButton, "click", () => setView("full"));
  addListener(resetButton, "click", resetPage);
  addListener(document, "keydown", onKeyDown);
  addListener(fallback, "keydown", scrollFallback);
  addListener(fallback, "wheel", event => { fallback.scrollTop += event.deltaY; }, { passive: true });
  addListener(window, "pagehide", teardown, { once: true });

  if (!window.d3 || typeof d3.forceSimulation !== "function") {
    fallback.hidden = false;
    svgElement.hidden = true;
    status.textContent = "网络渲染器不可用；已显示全部关系的文字表格。";
  } else {
    try {
      renderGraph();
      const observer = new ResizeObserver(entries => {
        const entry = entries[0];
        if (!entry) return;
        const width = Math.round(entry.contentRect.width);
        const height = Math.round(entry.contentRect.height);
        if (!graph || Math.abs((graph.width || width) - width) > 1 || Math.abs((graph.height || height) - height) > 1) {
          scheduleResize();
        }
      });
      observer.observe(host);
      cleanups.push(() => observer.disconnect());
    } catch (error) {
      console.error("Pollinator network render failed", error);
      fallback.hidden = false;
      svgElement.hidden = true;
      status.textContent = "网络渲染失败；已显示全部关系的文字表格。";
    }
  }

  window.__POLLINATOR_PAGE__ = {
    reset: resetPage,
    setView,
    getState: () => ({ ...state }),
    getLayoutSignature: () => graph ? graph.nodes.map(node => `${node.id}:${node.x.toFixed(3)},${node.y.toFixed(3)}`).join("|") : ""
  };
})();
