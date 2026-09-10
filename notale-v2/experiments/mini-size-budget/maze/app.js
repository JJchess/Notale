const assign = Object.assign,
  delay = setTimeout,
  cancelDelay = clearTimeout;
const doc = document,
  address = window.location;
const create = tag => doc.createElement(tag);
const focusStill = element => element?.focus({
  preventScroll: true
});
const stop = element => element.getAnimations().forEach(a => a.cancel());
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
const setAttr = (element, name, value) => element.setAttribute(name, value);
const toggleClass = (element, name, on) => element.classList.toggle(name, on);
const dialog = (element, name, on) => {
  element.classList.toggle(name, on);
  element.ariaModal = on;
};
const $ = (s, e = doc) => e.querySelector(s),
  all = (s, e = doc) => [...e.querySelectorAll(s)],
  clone = index => $('#t').content.children[index].cloneNode(true);
const data = await fetch('assets/mini-data.json').then(r => r.json()),
  states = data.states;
await Promise.allSettled(data.fonts.map(font => (font = new FontFace(...font), doc.fonts.add(font), font.load())));
let selected,
  selectedId,
  game,
  cells,
  dims,
  location,
  path,
  userSolved,
  started,
  currentFact,
  shareTimer,
  methodsOpen = false,
  factNodes = [];
const grid = $('#grid'),
  tracker = $('.tracker'),
  modal = $('.modal'),
  maze = $('.maze-container'),
  overlay = $('.overlay'),
  factBox = $('.facts'),
  [sortSelect, stateSelect] = all('.bar select'),
  savedKey = 'pudding-state-maze-mazes';
const cached0 = $('.stories'),
  cached1 = $('.clipboard'),
  cached3 = $('.start'),
  cached4 = $('.methods');
const readSaved = () => {
  try {
    return JSON.parse(localStorage[savedKey]) || [];
  } catch {
    return [];
  }
};
for (let card of data.storyCards) {
  let e = clone(0),
    images = all('img', e);
  images.forEach((image, index) => assign(image, card.imageAttributes[index]));
  $('.name', e).textContent = card.name;
  $('.info', e).textContent = card.info;
  e.onclick = () => delay(() => open(card.id), 800);
  cached0.append(e);
}
for (let option of data.stateOptions) stateSelect.add(new Option(...option));
stateSelect.onchange = () => open(stateSelect.value);
sortSelect.value = 'geo';
$('.sub').onclick = () => focusStill($('.state'));
const renderGrid = () => {
  let order = sortSelect.value,
    geographic = order === 'geo',
    saved = readSaved(),
    finished = saved.length === 51;
  grid.replaceChildren(tracker);
  toggleClass(grid, 'geo', geographic);
  toggleClass(tracker, 'hasBorder', !geographic);
  $('.tracker-sentence').innerHTML = data.progressLabel.replace('$', finished ? 'all ' : saved.length + '/') + (finished ? `<span class="done">${data.sections.Dashboard.doneMessage}</span>` : '');
  $('.maze-directions').hidden = finished;
  for (let [title, indices] of data.gridGroups[order]) {
    if (title) {
      let h = create('h3');
      h.textContent = title;
      grid.append(h);
    }
    for (let i of indices) {
      let s = states[i],
        id = s.id;
      let e = clone(1);
      e.id = id;
      if (geographic) {
        e.className += ' geo';
        e.style.cssText = `--row:${s.row};--col:${s.col}`;
      }
      all('.text', e).forEach((label, index) => label.textContent = s.gridLabels[+geographic][index]);
      $('.icon', e).hidden = !s.story || order === 'region';
      toggleClass($('.check', e), 'visible', saved.some(x => x.id === id));
      assign($('.img-wrapper>img', e), s.imageAttributes);
      e.onclick = () => open(id);
      e.onkeydown = ev => {
        if (['Enter', ' '].includes(ev.key)) {
          ev.preventDefault();
          open(id);
        }
      };
      grid.append(e);
    }
  }
  requestAnimationFrame(() => {
    all('.state').forEach(e => {
      let [a, b] = all('.text', e),
        short = !!b.textContent && a.clientWidth > e.clientWidth;
      toggleClass(a, 'visible', !short);
      toggleClass(b, 'visible', short);
    });
  });
};
const fade = open => {
  for (let e of [grid, $('.bar'), $('.title'), cached0]) toggleClass(e, 'fade', open);
};
const open = id => {
  let state = states[data.stateIndex[id]];
  if (!state) return;
  selected = state;
  selectedId = id;
  cells = selected.mazeCells;
  dims = selected.mazeDimension;
  resetGame(false);
  dialog(modal, 'open', true);
  fade(true);
  $('.state-info h2').textContent = selected.displayName;
  let story = $('.story-pill');
  story.hidden = !selected.story;
  story.replaceChildren(story.firstElementChild, selected.storyLabel);
  $('.classification').innerHTML = selected.classificationCopy;
  factNodes = selected.factCopies.map((text, index) => {
    let e = create('div');
    e.className = 'fact';
    e.innerHTML = text;
    e.onmouseover = () => {
      if (index <= currentFact) e.style.zIndex = 100;
    };
    e.onmouseleave = layoutFacts;
    return e;
  });
  factBox.replaceChildren(...factNodes);
  $('.learn>a').href = selected.guttmacher;
  focusStill(modal);
  let saved = readSaved().find(s => s.id === id);
  if (saved) {
    path = saved.path;
    location = cells.at(-1);
    started = true;
    game = 2;
  }
  setAttr(wallsGroup, 'href', selected.wallSrc);
  setAttr(pathGroup, 'transform', selected.mazeTransform);
  stop(animatedPath);
  renderGame();
};
const close = () => {
  selected = null;
  dialog(modal, 'open', false);
  fade(false);
  stateSelect.value = 'default';
  renderGrid();
  focusStill($('#' + selectedId));
};
$('.share>a').onclick = e => {
  e.preventDefault();
  navigator.clipboard.writeText(address.origin + address.pathname + '?state=' + selectedId).then(() => {
    cancelDelay(shareTimer);
    toggleClass(cached1, 'visible', true);
    shareTimer = delay(() => toggleClass(cached1, 'visible', false), 2000);
  }).catch(() => {});
};
const layoutFacts = () => {
  let heights = factNodes.map(e => e.getBoundingClientRect().height),
    sum = heights.reduce((a, b) => a + b, 0),
    h = factBox.clientHeight,
    last = heights.at(-1),
    above = 0,
    clientAbove = 0;
  for (let [i, e] of factNodes.entries()) {
    let top = i && (h > sum ? clientAbove - 20 : above / (sum - last) * (h - last));
    above += heights[i];
    clientAbove += e.clientHeight;
    e.style.top = top + 'px';
    e.style.zIndex = factNodes.length - Math.abs(i - currentFact);
    e.className = 'fact ' + (i < currentFact ? 'above fade visible' : i > currentFact ? 'below fade' : 'visible') + (!game ? ' disabled fade' : '');
  }
};
const [wallsGroup, pathGroup] = $('svg', maze).children,
  [circle, fullPath, animatedPath] = pathGroup.children;
// Once opened, game is always 0 (ready), 1 (playing), or 2 (finished).
const renderGame = () => {
  cached3.textContent = data.startLabels[game];
  toggleClass(cached3, 'bounce', !started && !reducedMotion.matches);
  toggleClass(overlay, 'visible', game > 1);
  $('.complete').hidden = !userSolved;
  assign($('.link'), selected.policyLink);
  if (game > 1) currentFact = factNodes.length - 1;else if (!game || path.length === 1) currentFact = 0;
  layoutFacts();
  let x = location.col,
    y = location.row,
    oldX = circle.cx.baseVal.value,
    oldY = circle.cy.baseVal.value,
    duration = game > 1 || !y && !x || reducedMotion.matches ? 0 : 100;
  setAttr(circle, 'cx', x);
  setAttr(circle, 'cy', y);
  stop(circle);
  if (duration) circle.animate({
    translate: [`${oldX - x}px ${oldY - y}px`, '0 0']
  }, {
    duration
  });
  setAttr(fullPath, 'd', 'M0 0' + path.slice(1, game > 1 ? Infinity : -1).map(p => 'L' + p.col + ' ' + p.row).join(''));
  let recent = '',
    prev = path.at(-2);
  if (prev) {
    let two = path.at(-3),
      dr = y - prev.row,
      dc = x - prev.col,
      px = prev.col,
      py = prev.row,
      double = two && two.row === y && two.col === x;
    if ((py || px) && !double) {
      px -= dc * .125;
      py -= dr * .125;
    }
    recent = `M${px} ${py}l${dc} ${dr}`;
  }
  setAttr(animatedPath, 'd', recent);
  if (recent && game === 1 && duration) {
    let length = animatedPath.getTotalLength();
    stop(animatedPath);
    animatedPath.animate({
      strokeDasharray: [length, length],
      strokeDashoffset: [...Array(201)].map((_, i) => length * (1 - i / 200) ** 5)
    }, {
      duration: 200
    });
  }
  for (let group of [wallsGroup, pathGroup]) toggleClass(group, 'fade', game !== 1);
};
const resetGame = play => {
  game = +(started = !!play);
  path = [location = cells[0]];
  userSolved = true;
  if (play) renderGame();
};
cached3.onclick = resetGame;
$('.solve').onclick = () => {
  userSolved = false;
  path = selected.mazeSolution.map(i => cells[i]);
  location = cells.at(-1);
  game = 2;
  renderGame();
};
$('.link-sm').onclick = close;
$('.close').onclick = close;
const methods = $('#methodology');
cached4.onclick = () => {
  dialog(methods, 'visible', methodsOpen = true);
  focusStill(methods);
};
const closeMethods = () => {
  dialog(methods, 'visible', methodsOpen = false);
  focusStill(cached4);
};
$('.close-methods').onclick = closeMethods;
$('h4').textContent = data.sections.Methodology.title;
$('details').insertAdjacentHTML('beforebegin', '<p>' + data.methodParagraphs.join('<p>'));
$('tbody').innerHTML = data.sources.map((s, i) => `<tr><td><span>${i + 1}</span><a href='${s.link}' target=_blank>${s.metric}</a><td>${s.lastUpdated}`).join('');
$('.activity').onclick = e => {
  if (e.target.id !== 'pdf-link') $('#pdf-link').click();
};
const trap = (e, box) => {
  if (e.key !== 'Tab') return;
  let f = all('a[href],button,summary', box).filter(n => n.checkVisibility());
  if (e.shiftKey) f.reverse();
  let active = doc.activeElement;
  if (active === f.at(-1) || active === box) {
    e.preventDefault();
    f[0]?.focus();
  }
};
doc.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (methodsOpen) closeMethods();else if (selected) close();
  }
  if (methodsOpen) trap(e, methods);else if (selected) {
    trap(e, modal);
    let direction = ['Up', 'Right', 'Down', 'Left'].findIndex(key => e.key === 'Arrow' + key);
    if (direction >= 0 && game === 1) {
      e.preventDefault();

      // The only caller already requires an open maze in the playing state.
      let index = selected.mazeMoves[location.row * dims + location.col][direction];
      if (index == null) return;
      location = cells[index];
      path.push(location);
      if (!index) path = [location];
      if (index === cells.length - 1) {
        game = 2;
        try {
          localStorage[savedKey] = JSON.stringify([...readSaved().filter(d => d.id !== selectedId), {
            id: selectedId,
            path
          }]);
        } catch {}
      } else if (path.length % (dims <= 10 ? 2 : 5) === 0 && currentFact < factNodes.length - 1) currentFact++;
      renderGame();
    }
  }
});
const observer = new ResizeObserver(layoutFacts);
observer.observe(maze);
addEventListener('pagehide', () => {
  observer.disconnect();
  cancelDelay(shareTimer);
  stop(circle);
});
sortSelect.onchange = renderGrid;
renderGrid();
let initial = new URLSearchParams(address.search).get('state');
if (initial) delay(() => open(initial), 100);