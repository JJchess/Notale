(() => {
  "use strict";
  const data = window.CITIES;
  const ZONES = ["Cold", "Temperate", "Tropical", "Arid"];
  const ui = {};
  document.querySelectorAll("[id]").forEach(element => ui[element.id] = element);
  const events = new AbortController();
  let state = initialState();

  function initialState(caseIndex = 0) {
    return { caseIndex, phase: "predict", prediction: null };
  }
  function mainZone(type) {
    return type.split(",")[0];
  }
  function selectedCity() {
    return data.find(city => city.id === (state.caseIndex ? 43 : 0));
  }
  function derive(city) {
    const candidates = data.filter(item => item.type_2023 === city.type_2070);
    const gap = item => Math.abs(city.temp_2070 - item.temp_2023);
    const analogue = candidates.sort((first, second) => gap(first) - gap(second)
      || first.id - second.id || first.name.localeCompare(second.name))[0];
    return { analogue, gap: gap(analogue) };
  }
  function point(type, temperature) {
    return [180 + ZONES.indexOf(mainZone(type)) * 200, 440 - temperature / 32 * 360];
  }
  function temperature(value) {
    return `${value.toFixed(1)}°C`;
  }
  function mark(element, position) {
    element.setAttribute("transform", `translate(${position.join(" ")})`);
  }

  function render() {
    const city = selectedCity();
    const result = derive(city);
    const revealed = state.phase !== "predict";
    ui.map.dataset.phase = state.phase;
    const origin = point(city.type_2023, city.temp_2023);
    const future = point(city.type_2070, city.temp_2070);
    const analoguePoint = point(result.analogue.type_2023, result.analogue.temp_2023);
    mark(ui.traveler, revealed ? future : origin);
    mark(ui.ghost, origin);
    mark(ui.analogue, analoguePoint);
    const bend = origin[0] === future[0] ? 65 : 0;
    const control = [(origin[0] + future[0]) / 2 + bend, (origin[1] + future[1]) / 2];
    ui.route.setAttribute("d", `M${origin} Q${control} ${future}`);
    ui.question.textContent = `Where will ${city.name}'s 2070 climate land?`;
    ui.present.textContent = `2023: ${city.type_2023}, ${temperature(city.temp_2023)}.`;
    document.querySelectorAll("[data-case]").forEach(button => {
      button.ariaPressed = String(+button.dataset.case === state.caseIndex);
    });
    document.querySelectorAll("[data-zone]").forEach(button => {
      button.ariaPressed = String(button.dataset.zone === state.prediction);
      button.disabled = state.phase !== "predict";
    });
    ui.confirm.disabled = !state.prediction || state.phase !== "predict";
    ui.next.hidden = state.phase !== "revealed";
    if (state.phase === "predict") {
      ui.status.textContent = "Choose a zone, then reveal 2070.";
      ui.evidence.textContent = "";
    } else {
      const actual = mainZone(city.type_2070);
      ui.status.textContent = state.prediction === actual
        ? `Prediction matched: ${actual}.`
        : `You chose ${state.prediction}. The model result is ${actual}.`;
      const boundary = result.analogue.id === city.id
        ? "<br>The analogue is the same city today."
        : "";
      ui.evidence.innerHTML = `<strong>${city.type_2023} to ${city.type_2070}</strong>` +
        `${temperature(city.temp_2023)} becomes ${temperature(city.temp_2070)}.<br>` +
        `<b>${result.analogue.name}</b> is the closest same-subtype city: ` +
        `${temperature(result.analogue.temp_2023)}, gap ${result.gap.toFixed(2)}°C.${boundary}`;
      ui.next.textContent = state.caseIndex ? "Run Oslo again" : "Test New Delhi";
    }
  }

  function snapshot() {
    const isFallback = state.phase === "fallback";
    const city = isFallback ? null : selectedCity();
    const result = city && derive(city);
    return {
      ...state,
      cityId: city?.id ?? null,
      analogueId: result?.analogue.id ?? null,
      cityCount: Array.isArray(data) ? data.length : 0,
      fallback: isFallback
    };
  }
  function chooseCase(index) {
    state = initialState(index);
    ui.map.classList.add("instant");
    render();
    void ui.map.getBoundingClientRect();
    ui.map.classList.remove("instant");
  }
  function dispose() {
    document.getAnimations().forEach(animation => animation.cancel());
    events.abort();
  }
  function showFallback() {
    state = { caseIndex: 0, phase: "fallback", prediction: null };
    ui.world.innerHTML = `<div class="fallback"><strong>Climate data unavailable</strong><br>` +
      `Model needs 70 records: same projected subtype, least temperature gap, ` +
      `then id/name ties.</div>`;
    ui.lab.hidden = true;
  }

  window.addEventListener("pagehide", dispose, { signal: events.signal });
  window.ClimateMini = { reset: () => chooseCase(0), dispose, snapshot };
  const valid = Array.isArray(data) && data.length === 70 && data[0]?.id === 0 && data[43]?.id === 43;
  if (!window.Deck || !valid) {
    showFallback();
    return;
  }
  document.addEventListener("click", event => {
    const caseIndex = event.target.dataset.case;
    const zone = event.target.dataset.zone;
    if (caseIndex !== undefined) chooseCase(+caseIndex);
    if (zone && state.phase === "predict") {
      state.prediction = zone;
      render();
    }
    if (event.target === ui.confirm && state.prediction) {
      state.phase = "revealed";
      render();
    }
    if (event.target === ui.next) chooseCase(state.caseIndex ? 0 : 1);
    if (event.target === ui.reset) chooseCase(0);
  }, { signal: events.signal });
  render();
})();
