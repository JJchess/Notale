/* Prepare first, commit through Reveal second. No page/runtime source changes. */
(() => {
  const sections = [...document.querySelectorAll('.slides > section')];
  const states = new WeakMap();
  const frameOf = section => section.querySelector('.preview-frame');
  const stateFor = section => {
    if (!states.has(section)) states.set(section, {status: 'idle', visited: false});
    return states.get(section);
  };
  const notice = document.querySelector('#preview-status');
  let displayed = null, pending = null, warmTimer = null;
  const warmActive = new Set();
  const warm = new Set();
  const poster = document.querySelector('#preview-poster');
  const boundDocuments = new WeakSet();
  const editable = target => target?.closest?.('input,textarea,select,button,[contenteditable],[role="slider"],[role="textbox"],[role="combobox"],[role="spinbutton"],.monaco-editor');
  let committing = false, restoringOverview = false;
  const paintFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  function feedback(request, error = '') {
    if (pending !== request) return;
    if (error) clearTimeout(request.indicator);
    notice.hidden = false;
    notice.dataset.kind = error ? 'error' : 'loading';
    notice.querySelector('span').textContent = error
      ? `第 ${sections.indexOf(request.section) + 1} 页暂时打不开：${error}`
      : `正在准备第 ${sections.indexOf(request.section) + 1} 页…`;
    notice.querySelector('[data-retry]').hidden = !error;
    notice.querySelector('a').hidden = !error;
    notice.querySelector('a').href = frameOf(request.section).dataset.previewSrc;
  }

  function discard(section) {
    if (!section || stateFor(section).visited) return;
    warm.delete(section);
    const state = stateFor(section);
    state.cancel?.();
    const old = frameOf(section), fresh = old.cloneNode(false);
    fresh.removeAttribute('src');
    fresh.inert = true;
    old.replaceWith(fresh); // Destroys only an unvisited document and its workers.
    section.removeAttribute('data-preview-preparing');
    section.dataset.previewState = 'idle';
    section.querySelectorAll('[data-preview-fragment]').forEach(node => node.remove());
    states.delete(section);
  }

  function cancelPending(keep = null) {
    const old = pending;
    pending = null;
    clearTimeout(old?.indicator);
    clearTimeout(warmTimer);
    notice.hidden = true;
    if (poster) poster.hidden = true;
    if (old && old.section !== displayed && !warm.has(old.section) && old.section !== keep) discard(old.section);
  }

  function sync() {
    if (Reveal.isOverview()) return;
    const section = Reveal.getCurrentSlide();
    if (!section || stateFor(section).status !== 'ready') return;
    const deck = frameOf(section).contentWindow.Deck;
    const step = (Reveal.getIndices().f ?? -1) + 1;
    if (deck?.stepTo && deck.step !== step) deck.stepTo(step);
  }

  function navigation(event, fromFrame = false) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.isComposing || Reveal.isOverview()) return false;
    if (editable(event.target)) return false;
    const direction = event.key === 'ArrowRight' || event.key === 'PageDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'PageUp' ? -1 : 0;
    if (!direction || (event.shiftKey && !event.key.startsWith('Arrow'))) return false;
    if (!event.shiftKey && !fromFrame) return false;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.shiftKey) { direction > 0 ? Reveal.next() : Reveal.prev(); return true; }
    if (event.repeat) return true;
    const anchor = pending?.section || displayed || Reveal.getCurrentSlide();
    const target = sections[sections.indexOf(anchor) + direction];
    if (!target) return true;
    if (target === displayed) { cancelPending(); scheduleWarm(); return true; }
    request(target, direction < 0 ? 'last' : -1);
    return true;
  }

  function wireKeys(doc) {
    if (!doc || boundDocuments.has(doc)) return;
    boundDocuments.add(doc);
    doc.addEventListener('keydown', event => {
      if (navigation(event, true)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || editable(event.target)) return;
      if (!['o', 'O', 'f', 'F', 'Escape'].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape' && pending) cancelPending();
      else document.dispatchEvent(new KeyboardEvent('keydown', { key: event.key,
        keyCode: event.key === 'Escape' ? 27 : event.key.toUpperCase().charCodeAt(0), bubbles: true }));
    }, true);
    const child = frame => { try { wireKeys(frame.contentDocument); } catch { /* Cross-origin documents own their keys. */ } };
    doc.addEventListener('load', event => { if (event.target.tagName === 'IFRAME') child(event.target); }, true);
    doc.querySelectorAll('iframe').forEach(child);
  }

  function prepare(section, entry = -1) {
    const state = stateFor(section);
    if (state.promise) return state.promise;
    const frame = frameOf(section);
    frame.inert = true;
    state.status = section.dataset.previewState = 'loading';
    if (displayed || Reveal.isOverview()) section.dataset.previewPreparing = '';
    state.promise = new Promise((resolve, reject) => {
      let finished = false, working = false;
      const finish = error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        clearTimeout(poll);
        frame.removeEventListener('load', loaded);
        frame.removeEventListener('error', failed);
        state.cancel = null;
        state.status = section.dataset.previewState = error ? 'error' : 'ready';
        error ? reject(error) : resolve();
      };
      let poll;
      const timer = setTimeout(() => finish(new Error('准备超过 30 秒，请重试')), 30000);
      const failed = () => finish(new Error('页面加载失败'));
      state.cancel = () => finish(new Error('已取消'));
      const loaded = async () => {
        if (finished || working) return;
        try {
          if (frame.contentWindow.location.href === 'about:blank') return;
          working = true;
          const doc = frame.contentDocument, deck = frame.contentWindow.Deck;
          if (!doc.querySelector('#stage')) throw new Error('未找到页面舞台');
          const count = Math.max(0, Math.floor(Number(deck?.stepMax) || 0));
          const first = entry === 'last' ? count : entry + 1;
          if (deck?.stepTo && deck.step !== first) deck.stepTo(first);
          await doc.fonts.ready;
          await Promise.all([...doc.images].filter(image => {
            const rect = image.getBoundingClientRect();
            return rect.width && rect.height && rect.bottom > 0 && rect.top < 900;
          }).map(image => image.decode()));
          const workbench = doc.querySelector('.code-workbench-frame');
          if (workbench) {
            await new Promise(done => {
              const check = () => {
                if (finished) return;
                const state = workbench.contentWindow?.CodeLab?.getState();
                if (state?.viewReady) done();
                else poll = setTimeout(check, 25);
              };
              check();
            });
            await workbench.contentDocument.fonts.ready;
          }
          await paintFrames();
          if (finished) return;
          section.querySelectorAll('[data-preview-fragment]').forEach(node => node.remove());
          for (let i = 0; i < count; i++) {
            const fragment = document.createElement('span');
            fragment.className = 'fragment';
            fragment.dataset.previewFragment = '';
            fragment.dataset.fragmentIndex = i;
            section.appendChild(fragment);
          }
          Reveal.syncFragments(section);
          wireKeys(doc);
          finish();
        } catch (error) { finish(error); }
      };
      frame.addEventListener('load', loaded);
      frame.addEventListener('error', failed);
      frame.src = frame.dataset.previewSrc;
      // DOM ready is enough to start preparing visible evidence. Offscreen or
      // late images must not hold the entire page behind window.load.
      const probe = () => {
        if (finished || working) return;
        const win = frame.contentWindow;
        if (win?.location.href !== 'about:blank' && (win?.performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd > 0 || win?.document.readyState === 'complete')) void loaded();
        if (!finished && !working) poll = setTimeout(probe, 25);
      };
      poll = setTimeout(probe, 25);
    });
    return state.promise;
  }

  function scheduleWarm() {
    clearTimeout(warmTimer);
    if (!displayed || pending || Reveal.isOverview() || document.hidden) return;
    const ahead = sections.slice(sections.indexOf(displayed) + 1, sections.indexOf(displayed) + 4);
    for (const section of warm) if (!ahead.includes(section)) discard(section);
    if (warmActive.size >= 2) return;
    const codeActive = [...warmActive].some(section => section.hasAttribute('data-preview-code'));
    const next = ahead.find(section => !stateFor(section).visited && stateFor(section).status === 'idle' && !(codeActive && section.hasAttribute('data-preview-code')));
    if (!next) return;
    warmTimer = setTimeout(() => {
      if (pending || Reveal.isOverview() || document.hidden) return;
      warm.add(next);
      warmActive.add(next);
      prepare(next).catch(() => {}).finally(() => {
        warmActive.delete(next);
        scheduleWarm();
      });
      scheduleWarm();
    }, 0);
  }

  function shown() {
    if (Reveal.isOverview()) return;
    const section = Reveal.getCurrentSlide();
    if (stateFor(section).status !== 'ready') return;
    displayed = section;
    stateFor(section).visited = true;
    warm.delete(section);
    section.removeAttribute('data-preview-preparing');
    frameOf(section).inert = false;
    document.querySelector('#tag').textContent = `${String(sections.indexOf(section) + 1).padStart(2, '0')}/${sections.length}  ${section.dataset.name}`;
    sync();
    scheduleWarm();
  }

  function request(section, entry = -1, overview = false) {
    if (pending?.section === section && pending.entry === entry) {
      pending.overview = overview;
      return;
    }
    cancelPending(section);
    warm.delete(section);
    const intent = pending = {section, entry, overview};
    const started = performance.now();
    section.dataset.previewRequestedAt = String(started);
    if (poster && stateFor(section).status !== 'ready') {
      const image = poster.querySelector('img');
      image.onload = () => { if (pending === intent) { poster.hidden = false; section.dataset.previewVisualMs = String(performance.now() - started); } };
      image.onerror = () => { if (pending === intent) poster.hidden = true; };
      image.src = `assets/preview/thumbnails/${section.dataset.name.replace(/\.html$/, '')}${entry === 'last' ? '-last' : ''}.png`;
    }
    intent.indicator = setTimeout(() => feedback(intent), 150);
    prepare(section, entry).then(() => {
      if (pending !== intent) return;
      const count = section.querySelectorAll('[data-preview-fragment]').length;
      const f = entry === 'last' ? count - 1 : entry;
      const deck = frameOf(section).contentWindow.Deck;
      if (deck?.stepTo && deck.step !== f + 1) deck.stepTo(f + 1);
      clearTimeout(intent.indicator);
      pending = null;
      notice.hidden = true;
      if (poster) poster.hidden = true;
      section.dataset.previewInteractiveMs = String(performance.now() - started);
      section.removeAttribute('data-preview-preparing');
      frameOf(section).inert = false;
      committing = true;
      try {
        Reveal.slide(sections.indexOf(section), 0, f);
        if (intent.overview) Reveal.toggleOverview(false);
      } finally { committing = false; }
      shown();
    }).catch(error => { if (pending === intent) feedback(intent, error.message); });
  }

  notice.querySelector('[data-cancel]').addEventListener('click', () => {
    cancelPending();
    if (displayed && !Reveal.isOverview()) {
      const f = Reveal.getIndices().f;
      Reveal.slide(sections.indexOf(displayed), 0, f);
    }
    scheduleWarm();
  });
  notice.querySelector('[data-retry]').addEventListener('click', () => {
    if (!pending) return;
    const {section, entry, overview} = pending;
    cancelPending();
    request(section, entry, overview);
  });
  document.addEventListener('click', event => {
    if (!Reveal.isOverview()) return;
    const section = event.target.closest('.slides > section');
    if (!section) return;
    event.preventDefault(); event.stopImmediatePropagation();
    request(section, -1, true);
  }, true);
  document.addEventListener('keydown', event => {
    if (navigation(event)) return;
    if (event.key === 'Escape' && pending) {
      event.preventDefault(); event.stopImmediatePropagation(); cancelPending();
    }
  }, true);
  document.addEventListener('visibilitychange', scheduleWarm);
  Reveal.on('beforeslidechange', event => {
    if (committing || !displayed || Reveal.isOverview()) return;
    const target = sections[Math.max(0, Math.min(sections.length - 1, event.indexh))];
    if (!target) return;
    if (target === displayed || stateFor(target).status === 'ready') {
      cancelPending(target);
      target.removeAttribute('data-preview-preparing');
      frameOf(target).inert = false;
      return;
    }
    event.preventDefault();
    request(target, sections.indexOf(target) < sections.indexOf(displayed) ? 'last' : -1);
  });
  Reveal.on('ready', () => request(Reveal.getCurrentSlide(), Reveal.getIndices().f ?? -1));
  Reveal.on('slidechanged', shown);
  for (const name of ['fragmentshown', 'fragmenthidden']) Reveal.on(name, () => {
    if (!committing && pending) cancelPending();
    sync();
  });
  Reveal.on('overviewshown', () => {
    if (!restoringOverview) cancelPending();
    clearTimeout(warmTimer);
    document.querySelectorAll('[data-preview-thumbnail]').forEach(image => {
      if (!image.hasAttribute('src')) image.src = image.dataset.previewThumbnail;
    });
  });
  Reveal.on('overviewhidden', () => {
    if (committing) return;
    const target = Reveal.getCurrentSlide();
    if (stateFor(target).status === 'ready') { shown(); return; }
    restoringOverview = true;
    Reveal.toggleOverview(true); // Restore synchronously, before an empty frame can paint.
    restoringOverview = false;
    request(target, -1, true);
  });
  Reveal.initialize({width:1600, height:900, margin:0, minScale:0.1, maxScale:1,
    hash:true, controls:true, progress:true, slideNumber:'c/t', transition:'none',
    keyboardCondition:event => !editable(event.target), preloadIframes:false});
})();
