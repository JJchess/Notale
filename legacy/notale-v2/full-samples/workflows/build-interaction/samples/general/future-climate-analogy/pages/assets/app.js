(() => {
  "use strict";

  const cities = window.CITIES;
  const subtypesByZone = {
    Cold: ["dry winter, hot summer", "no dry season, hot summer", "no dry season, warm summer"],
    Temperate: ["dry summer, hot summer", "no dry season, warm summer", "no dry season, hot summer",
      "dry summer, warm summer", "dry winter, hot summer", "dry winter, warm summer"],
    Tropical: ["monsoon", "rainforest", "savannah"],
    Arid: ["desert, hot", "desert, cold", "steppe, hot", "steppe, cold"]
  };
  const zoneNames = Object.keys(subtypesByZone);
  const board = document.querySelector("#board");
  const interaction = document.querySelector("#interaction");
  const unitButton = document.querySelector("#unit");
  const resetButton = document.querySelector("#reset");
  const stage = document.querySelector("#stage");
  const routeLines = [...document.querySelectorAll("#connections line")];
  const cityNodes = new Map();
  const groupsByType = new Map();
  const events = new AbortController();

  let state = initialState();
  let originGhost = null;
  let routeFrame = 0;
  let transitionFrame = 0;
  let focusFrame = 0;
  let settleTimer = 0;
  let removeResize = () => {};
  let disposed = false;

  function initialState() {
    return { phase: "ready", selectedId: null, prediction: null, unit: "C", attempts: [] };
  }
  function listen(target, type, handler, options = {}) {
    target.addEventListener(type, handler, { ...options, signal: events.signal });
  }
  function createElement(tag, className) {
    const element = document.createElement(tag);
    element.className = className;
    return element;
  }
  function mainZone(type) { return type.split(",")[0]; }
  function typeSlug(type) {
    return type.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function normalizeName(name) { return name.replace(/\s+/g, " "); }
  function selectedCity() { return cities.find(city => city.id === state.selectedId) || null; }
  function isRevealed() { return state.phase === "moving" || state.phase === "revealed"; }

  // The analogue is computed at runtime: same projected subtype, then nearest temperature.
  function closestAnalogue(city) {
    const temperatureGap = candidate => Math.abs(city.temp_2070 - candidate.temp_2023);
    return cities
      .filter(candidate => candidate.type_2023 === city.type_2070)
      .sort((a, b) => temperatureGap(a) - temperatureGap(b)
        || a.id - b.id || a.name.localeCompare(b.name))[0];
  }

  // All user actions pass through this canonical state transition.
  function transition(current, action) {
    if (action.type === "RESET") return initialState();
    if (action.type === "UNIT") return { ...current, unit: current.unit === "C" ? "F" : "C" };
    if (action.type === "SELECT" && current.phase !== "moving") {
      return { ...current, phase: "predict", selectedId: action.id, prediction: null };
    }
    if (action.type === "PREDICT" && current.phase === "predict") {
      return { ...current, prediction: action.zone };
    }
    if (action.type === "CONFIRM" && current.phase === "predict" && current.prediction) {
      const attempt = { cityId: current.selectedId, prediction: current.prediction };
      return { ...current, phase: "moving", attempts: current.attempts.concat(attempt) };
    }
    if (action.type === "END" && current.phase === "moving") {
      return { ...current, phase: "revealed" };
    }
    return current;
  }

  function buildBoard() {
    zoneNames.forEach(zoneName => {
      const zone = createElement("section", `zone zone-${zoneName.toLowerCase()}`);
      zone.dataset.zone = zoneName;
      zone.setAttribute("aria-labelledby", `head-${zoneName}`);
      zone.innerHTML = [
        `<h2 class="zone-head" id="head-${zoneName}"`,
        ` title="${zoneName} climate zone">${zoneName}</h2>`
      ].join("");
      board.append(zone);

      subtypesByZone[zoneName].forEach(subtype => {
        const climateType = `${zoneName}, ${subtype}`;
        const group = createElement("div", "group");
        group.dataset.type = climateType;
        group.innerHTML = [
          `<span class="classification" tabindex="0" title="${climateType}">${subtype}</span>`,
          `<span class="chips"></span>`
        ].join("");
        groupsByType.set(climateType, group.querySelector(".chips"));
        zone.append(group);
      });
    });

    cities.forEach(city => {
      const button = createElement("button", "city");
      const cityName = normalizeName(city.name);
      button.type = "button";
      button.dataset.city = city.id;
      button.textContent = cityName;
      button.setAttribute("aria-label",
        `${cityName}, ${city.type_2023}, ${city.temp_2023.toFixed(1)} degrees Celsius`);
      cityNodes.set(city.id, button);
    });
    layoutBoard();
    renderInterface();
    syncInspectionState();
  }

  function boardRecords() {
    const selected = selectedCity();
    const showFuture = isRevealed();
    return cities.map(city => {
      const future = showFuture && selected && city.id === selected.id;
      return {
        id: city.id,
        climate: future ? city.type_2070 : city.type_2023,
        temperature: future ? city.temp_2070 : city.temp_2023,
        node: cityNodes.get(city.id)
      };
    });
  }

  function updateCityNode(city, selected, analogue, showFuture) {
    const node = cityNodes.get(city.id);
    const future = showFuture && selected && city.id === selected.id;
    const climateType = future ? city.type_2070 : city.type_2023;
    const temperature = future ? city.temp_2070 : city.temp_2023;
    node.className = `city type-${typeSlug(climateType)}`;
    if (selected && city.id === selected.id) node.classList.add(showFuture ? "result" : "selected");
    if (analogue && city.id === analogue.id && city.id !== selected.id) node.classList.add("analogue");
    node.disabled = state.phase === "moving";
    node.setAttribute("aria-pressed", String(Boolean(selected) && city.id === selected.id));
    const analogueLabel = analogue && city.id === analogue.id ? ", closest present-day analogue" : "";
    node.setAttribute("aria-label",
      `${normalizeName(city.name)}, ${climateType}, ${temperature.toFixed(1)} degrees Celsius${analogueLabel}`);
  }

  function layoutBoard() {
    originGhost?.remove();
    originGhost = null;
    const selected = selectedCity();
    const showFuture = isRevealed();
    const analogue = showFuture && selected ? closestAnalogue(selected) : null;
    cities.forEach(city => updateCityNode(city, selected, analogue, showFuture));
    const records = boardRecords();

    if (showFuture && selected) {
      const analogueClass = analogue.id === selected.id ? " analogue" : "";
      originGhost = createElement("span",
        `city ghost appear type-${typeSlug(selected.type_2023)}${analogueClass}`);
      originGhost.textContent = normalizeName(selected.name);
      originGhost.setAttribute("aria-hidden", "true");
      records.push({
        id: 1000 + selected.id,
        climate: selected.type_2023,
        temperature: selected.temp_2023,
        node: originGhost
      });
    }
    groupsByType.forEach((container, climateType) => {
      records.filter(record => record.climate === climateType)
        .sort((a, b) => b.temperature - a.temperature || a.id - b.id)
        .forEach(record => container.append(record.node));
    });
  }

  function captureCityRects() {
    const rects = new Map();
    cityNodes.forEach((node, id) => rects.set(id, node.getBoundingClientRect()));
    return rects;
  }
  function hideRoute() {
    routeLines.forEach(line => {
      line.style.visibility = "hidden";
      ["x1", "y1", "x2", "y2"].forEach(attribute => line.setAttribute(attribute, 0));
    });
  }
  function cancelOwnedWork() {
    [routeFrame, transitionFrame, focusFrame].forEach(cancelAnimationFrame);
    clearTimeout(settleTimer);
    routeFrame = transitionFrame = focusFrame = settleTimer = 0;
    cityNodes.forEach(node => {
      node.style.transition = "none";
      node.style.transform = "";
      node.getAnimations().forEach(animation => animation.cancel());
    });
    hideRoute();
  }
  function completeReveal() {
    state = transition(state, { type: "END" });
    cityNodes.forEach(node => { node.disabled = false; });
    renderInterface();
    drawRoute();
    syncInspectionState();
  }

  function animateFlip(firstRects, duration, completesReveal) {
    const stageRect = stage.getBoundingClientRect();
    const scale = stageRect.width / 1600;
    cityNodes.forEach((node, id) => {
      const before = firstRects.get(id);
      const after = node.getBoundingClientRect();
      if (!before) return;
      const deltaX = (before.left - after.left) / scale;
      const deltaY = (before.top - after.top) / scale;
      if (Math.abs(deltaX) + Math.abs(deltaY) > .2) {
        node.style.transition = "none";
        node.style.transform = `translate(${deltaX}px,${deltaY}px)`;
      }
    });
    if (!duration || Deck.reduced()) {
      cityNodes.forEach(node => { node.style.transition = "none"; node.style.transform = ""; });
      if (completesReveal) completeReveal();
      return;
    }
    transitionFrame = requestAnimationFrame(() => {
      transitionFrame = requestAnimationFrame(() => {
        cityNodes.forEach(node => {
          node.style.transition = `transform ${duration}ms cubic-bezier(.83,0,.17,1)`;
          node.style.transform = "";
        });
        if (completesReveal) traceRoute();
      });
    });
    settleTimer = setTimeout(() => {
      cityNodes.forEach(node => { node.style.transition = ""; node.style.transform = ""; });
      if (completesReveal) completeReveal();
      settleTimer = 0;
    }, duration + 60);
  }

  function stageCoordinates(element) {
    const bounds = element.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    const scale = stageBounds.width / 1600;
    return {
      x: (bounds.left + bounds.width / 2 - stageBounds.left) / scale,
      y: (bounds.top + bounds.height / 2 - stageBounds.top) / scale
    };
  }
  function drawRoute() {
    const selected = selectedCity();
    if (!originGhost || !selected || !isRevealed()) return hideRoute();
    const origin = stageCoordinates(originGhost);
    const destination = stageCoordinates(cityNodes.get(state.selectedId));
    routeLines.forEach(line => {
      line.style.visibility = "visible";
      line.setAttribute("x1", origin.x);
      line.setAttribute("y1", origin.y);
      line.setAttribute("x2", destination.x);
      line.setAttribute("y2", destination.y);
    });
  }
  function traceRoute() {
    drawRoute();
    if (state.phase === "moving") routeFrame = requestAnimationFrame(traceRoute);
  }

  function formatTemperature(value) {
    return state.unit === "C" ? `${value.toFixed(1)}°C` : `${(value * 9 / 5 + 32).toFixed(1)}°F`;
  }
  function formatGap(value) {
    return state.unit === "C" ? `${value.toFixed(1)}°C` : `${(value * 9 / 5).toFixed(1)}°F`;
  }
  function typeChip(type) {
    return `<span class="type-chip z-${mainZone(type).toLowerCase()}">${type}</span>`;
  }
  function renderUnitButton() {
    unitButton.innerHTML = state.unit === "C"
      ? "<strong>°C</strong><span> / °F</span>"
      : "<span>°C / </span><strong>°F</strong>";
    const targetUnit = state.unit === "C" ? "Fahrenheit" : "Celsius";
    unitButton.setAttribute("aria-label", `Show temperatures in ${targetUnit}`);
  }

  // Joined fragments keep source lines legible without injecting layout whitespace into the DOM.
  function initialPrompt() {
    return [
      `<div class="prompt"><h2 id="prompt-title">Select any city to make a 2070 prediction.</h2>`,
      `<p class="quiet">The board shows all 70 cities in their present-day climate subtype.</p></div>`
    ].join("");
  }
  function predictionPrompt(city) {
    const choices = zoneNames.map(zoneName => [
      `<button type="button" class="zone-choice z-${zoneName.toLowerCase()}"`,
      ` data-zone="${zoneName}" aria-pressed="${state.prediction === zoneName}">${zoneName}</button>`
    ].join("")).join("");
    return [
      `<div class="prompt"><h2 id="prompt-title">Which main climate zone will <b>`,
      `${normalizeName(city.name)}</b> enter by 2070?</h2><div class="choices">${choices}`,
      `<button type="button" class="confirm" data-confirm${state.prediction ? "" : " disabled"}>`,
      `Confirm prediction</button></div><p class="quiet">Commit before the future classification `,
      `and temperature are revealed.</p></div>`
    ].join("");
  }
  function feedback(city) {
    const analogue = closestAnalogue(city);
    const matched = state.prediction === mainZone(city.type_2070);
    const temperatureGap = Math.abs(city.temp_2070 - analogue.temp_2023);
    const verdict = matched ? "Prediction matched the model."
      : `Prediction: ${state.prediction}. Model result: ${mainZone(city.type_2070)}.`;
    return [
      `<div class="feedback"><span class="verdict ${matched ? "right" : "wrong"}">${verdict}</span>`,
      `<p id="prompt-title" class="evidence"><b>${normalizeName(city.name)}</b>: `,
      `${typeChip(city.type_2023)} at <b>${formatTemperature(city.temp_2023)}</b> → `,
      `${typeChip(city.type_2070)} at <b>${formatTemperature(city.temp_2070)}</b>.</p>`,
      `<p class="analogy">Closest present-day analogue: <b>${normalizeName(analogue.name)}</b>. `,
      `Its present-day subtype matches the projected subtype, and ${formatTemperature(analogue.temp_2023)} `,
      `gives the smallest temperature gap among all matching cities `,
      `(<b>${formatGap(temperatureGap)}</b>).</p><div class="legend">`,
      `<span><i></i>selected city in 2070</span><span><i class="dash"></i>closest city today</span>`,
      `</div><p class="quiet">Choose another city to test a new prediction.</p></div>`
    ].join("");
  }
  function renderInterface() {
    renderUnitButton();
    const selected = selectedCity();
    if (!selected) interaction.innerHTML = initialPrompt();
    else if (!isRevealed()) interaction.innerHTML = predictionPrompt(selected);
    else interaction.innerHTML = feedback(selected);
  }

  function syncInspectionState() {
    const selected = selectedCity();
    window.__CLIMATE_SAMPLE__ = {
      state: JSON.parse(JSON.stringify(state)),
      analogue: isRevealed() && selected ? closestAnalogue(selected) : null,
      cityCount: cities.length
    };
  }
  function dispatch(action) {
    if (disposed) return;
    if (action.type === "RESET") {
      cancelOwnedWork();
      state = initialState();
      layoutBoard();
      renderInterface();
      return syncInspectionState();
    }
    if (action.type === "UNIT" || action.type === "PREDICT") {
      state = transition(state, action);
      renderInterface();
      return syncInspectionState();
    }
    const firstRects = captureCityRects();
    const wasRevealed = isRevealed();
    const nextState = transition(state, action);
    if (nextState === state) return;
    cancelOwnedWork();
    state = nextState;
    layoutBoard();
    renderInterface();
    syncInspectionState();
    if (action.type === "CONFIRM") animateFlip(firstRects, 2000, true);
    else if (action.type === "SELECT" && wasRevealed) animateFlip(firstRects, 700, false);
  }

  function scheduleFocus(selector) {
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      focusFrame = 0;
      if (!disposed) interaction.querySelector(selector)?.focus();
    });
  }
  function onBoardClick(event) {
    const cityButton = event.target.closest("[data-city]");
    if (!cityButton) return;
    dispatch({ type: "SELECT", id: +cityButton.dataset.city });
    if (event.detail === 0) scheduleFocus(".zone-choice");
  }
  function onInteractionClick(event) {
    const zoneButton = event.target.closest("[data-zone]");
    if (zoneButton) {
      dispatch({ type: "PREDICT", zone: zoneButton.dataset.zone });
      if (event.detail === 0) scheduleFocus("[data-confirm]");
    }
    if (event.target.closest("[data-confirm]")) dispatch({ type: "CONFIRM" });
  }

  function renderDependencyFallback() {
    board.innerHTML = [
      `<div class="model-fallback"><h2>Climate analogue model</h2>`,
      `<p>The activity compares 70 cities. A future city is matched to present-day cities with `,
      `the same projected climate subtype, then chooses the smallest temperature gap.</p></div>`
    ].join("");
    interaction.innerHTML = [
      `<div class="prompt"><h2 id="prompt-title">The city data could not be loaded.</h2>`,
      `<p class="quiet">Reload to make a prediction with the full model.</p></div>`
    ].join("");
    unitButton.disabled = true;
    resetButton.disabled = true;
    window.__CLIMATE_SAMPLE__ = {
      state: initialState(), analogue: null, cityCount: Array.isArray(cities) ? cities.length : 0
    };
  }
  function teardown() {
    if (disposed) return;
    disposed = true;
    cancelOwnedWork();
    removeResize();
    events.abort();
  }

  if (!window.Deck || !Array.isArray(cities) || cities.length !== 70) {
    renderDependencyFallback();
    return;
  }
  listen(board, "click", onBoardClick);
  listen(interaction, "click", onInteractionClick);
  listen(unitButton, "click", () => dispatch({ type: "UNIT" }));
  listen(resetButton, "click", () => dispatch({ type: "RESET" }));
  listen(window, "pagehide", teardown, { once: true });
  removeResize = Deck.onResize(drawRoute);
  buildBoard();
  Deck.init({ keys: false, title: "Future climate analogue" });
})();
