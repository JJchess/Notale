(() => {
  'use strict';

  const manifestNode = document.getElementById('template-manifest');
  const stateNode = document.getElementById('template-state');
  const manifest = manifestNode ? JSON.parse(manifestNode.textContent) : {};
  const slide = document.querySelector('.slide');
  const toolbar = document.getElementById('native-toolbar');
  const toast = document.getElementById('native-toast');
  const fileInput = document.getElementById('native-image-input');
  const fillInput = document.getElementById('native-fill');
  const colorInput = document.getElementById('native-color');
  const sizeInput = document.getElementById('native-font-size');
  const rotateInput = document.getElementById('native-rotate');

  if (!slide || !toolbar || !stateNode) return;

  let editMode = false;
  let selected = null;
  let history = [];
  let future = [];
  let rootHandle = null;
  let saveInFlight = false;
  const pendingAssets = new Map();
  const objectUrls = new Set();

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const editableNodes = () => [...document.querySelectorAll('[data-element-id]')];
  const canvasScale = () => {
    const rect = slide.getBoundingClientRect();
    return rect.width / number(manifest.width, slide.offsetWidth || 1);
  };

  function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.dataset.type = type;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  function readNode(node) {
    const entry = {};
    if (node.classList.contains('el')) {
      entry.geometry = {
        x: number(node.style.left, node.offsetLeft),
        y: number(node.style.top, node.offsetTop),
        width: number(node.style.width, node.offsetWidth),
        height: number(node.style.height, node.offsetHeight),
        rotate: number(node.dataset.rotate, 0),
      };
    }
    if (node.hasAttribute('data-text')) {
      const content = node.cloneNode(true);
      content.querySelectorAll('.native-handle').forEach((handle) => handle.remove());
      entry.html = content.innerHTML;
    }
    const computed = getComputedStyle(node);
    entry.style = {
      color: node.style.color || computed.color,
      backgroundColor: node.style.backgroundColor || computed.backgroundColor,
      fontSize: node.style.fontSize || computed.fontSize,
    };
    return entry;
  }

  function captureState() {
    const elements = {};
    for (const node of editableNodes()) elements[node.dataset.elementId] = readNode(node);
    return { version: 1, elements };
  }

  function applyState(state) {
    if (!state || !state.elements) return;
    for (const [id, entry] of Object.entries(state.elements)) {
      const node = document.querySelector(`[data-element-id="${CSS.escape(id)}"]`);
      if (!node) continue;
      if (entry.geometry && node.classList.contains('el')) {
        const g = entry.geometry;
        node.style.left = `${number(g.x)}px`;
        node.style.top = `${number(g.y)}px`;
        node.style.width = `${Math.max(2, number(g.width, node.offsetWidth))}px`;
        node.style.height = `${Math.max(2, number(g.height, node.offsetHeight))}px`;
        node.dataset.rotate = String(number(g.rotate));
        node.style.transform = `rotate(${number(g.rotate)}deg)`;
      }
      if (typeof entry.html === 'string' && node.hasAttribute('data-text')) node.innerHTML = entry.html;
      if (entry.style) {
        if (entry.style.color) node.style.color = entry.style.color;
        if (entry.style.backgroundColor && entry.style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
          node.style.backgroundColor = entry.style.backgroundColor;
        }
        if (entry.style.fontSize) node.style.fontSize = entry.style.fontSize;
      }
    }
    if (selected && selected.classList.contains('el') && !selected.querySelector(':scope > .native-handle')) {
      addResizeHandle(selected);
    }
    refreshSelection();
  }

  const initialState = captureState();
  try {
    const savedState = JSON.parse(stateNode.textContent || '{}');
    applyState(savedState);
  } catch (error) {
    console.warn('Template state could not be restored.', error);
  }

  function pushHistory(before) {
    history.push(before || captureState());
    if (history.length > 80) history.shift();
    future = [];
    updateToolbarButtons();
  }

  function undo() {
    if (!history.length) return;
    future.push(captureState());
    applyState(history.pop());
    updateToolbarButtons();
  }

  function redo() {
    if (!future.length) return;
    history.push(captureState());
    applyState(future.pop());
    updateToolbarButtons();
  }

  function resetPage() {
    const before = captureState();
    applyState(initialState);
    pushHistory(before);
    showToast('已恢复为初始版式');
  }

  function updateToolbarButtons() {
    const undoButton = toolbar.querySelector('[data-action="undo"]');
    const redoButton = toolbar.querySelector('[data-action="redo"]');
    if (undoButton) undoButton.disabled = !history.length;
    if (redoButton) redoButton.disabled = !future.length;
  }

  function clearSelection() {
    if (selected) {
      selected.classList.remove('native-selected');
      selected.querySelectorAll(':scope > .native-handle').forEach((node) => node.remove());
    }
    selected = null;
    toolbar.dataset.hasSelection = 'false';
  }

  function addResizeHandle(node) {
    if (!node.classList.contains('el') || node.querySelector(':scope > .native-handle')) return;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'native-handle';
    handle.title = '拖动缩放';
    handle.setAttribute('aria-label', '拖动缩放元素');
    handle.addEventListener('pointerdown', beginResize);
    node.appendChild(handle);
  }

  function selectNode(node) {
    if (!node || !editMode) return;
    if (selected === node) return;
    clearSelection();
    selected = node;
    selected.classList.add('native-selected');
    addResizeHandle(selected);
    toolbar.dataset.hasSelection = 'true';
    refreshSelection();
  }

  function refreshSelection() {
    if (!selected) return;
    const style = getComputedStyle(selected);
    const bg = rgbToHex(style.backgroundColor);
    const color = rgbToHex(style.color);
    if (bg) fillInput.value = bg;
    if (color) colorInput.value = color;
    sizeInput.value = String(Math.round(parseFloat(style.fontSize) || 16));
    rotateInput.value = String(number(selected.dataset.rotate, 0));
  }

  function rgbToHex(value) {
    const match = value && value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    return `#${[match[1], match[2], match[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
  }

  function toggleEdit(force) {
    editMode = typeof force === 'boolean' ? force : !editMode;
    document.documentElement.dataset.editMode = String(editMode);
    toolbar.hidden = !editMode;
    if (!editMode) {
      document.querySelectorAll('[contenteditable="true"]').forEach((node) => node.removeAttribute('contenteditable'));
      clearSelection();
    }
    showToast(editMode ? '编辑模式：双击文字编辑，拖动元素移动' : '已回到预览模式');
  }

  function beginMove(event, node) {
    if (!editMode || !node.classList.contains('el')) return;
    if (event.target.closest('.native-handle,button,input,[contenteditable="true"]')) return;
    event.preventDefault();
    selectNode(node);
    const before = captureState();
    const scale = canvasScale();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = number(node.style.left, node.offsetLeft);
    const originY = number(node.style.top, node.offsetTop);
    node.setPointerCapture(event.pointerId);

    const move = (e) => {
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      node.style.left = `${Math.round((originX + dx) * 10) / 10}px`;
      node.style.top = `${Math.round((originY + dy) * 10) / 10}px`;
    };
    const end = () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
      pushHistory(before);
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }

  function beginResize(event) {
    if (!selected) return;
    event.preventDefault();
    event.stopPropagation();
    const node = selected;
    const before = captureState();
    const scale = canvasScale();
    const startX = event.clientX;
    const startY = event.clientY;
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = event.currentTarget;
    const move = (e) => {
      node.style.width = `${Math.max(12, Math.round((width + (e.clientX - startX) / scale) * 10) / 10)}px`;
      node.style.height = `${Math.max(12, Math.round((height + (e.clientY - startY) / scale) * 10) / 10)}px`;
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      pushHistory(before);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function beginTextEdit(node) {
    if (!editMode || !node.hasAttribute('data-text')) return;
    const before = captureState();
    node.querySelectorAll(':scope > .native-handle').forEach((handle) => handle.remove());
    node.setAttribute('contenteditable', 'true');
    node.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    node.addEventListener('blur', () => {
      node.removeAttribute('contenteditable');
      if (selected === node) addResizeHandle(node);
      pushHistory(before);
    }, { once: true });
  }

  async function fileToPng(file) {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('图片转换失败')), 'image/png'));
  }

  async function replaceSelectedImage(file) {
    if (!selected || !selected.classList.contains('photo') || !file) return;
    const asset = selected.dataset.asset;
    if (!asset) return showToast('这个图片框没有可写回的素材路径', 'error');
    const before = captureState();
    try {
      const blob = await fileToPng(file);
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      const image = selected.matches('img') ? selected : selected.querySelector('img');
      if (image) image.src = url;
      pendingAssets.set(asset, blob);
      pushHistory(before);
      showToast('图片已替换，点击“保存到文件”写回素材');
    } catch (error) {
      showToast(error.message || '图片替换失败', 'error');
    }
  }

  function openImagePicker() {
    if (!selected || !selected.classList.contains('photo')) return showToast('请先选择一个图片框');
    fileInput.value = '';
    fileInput.click();
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('notale-native-template-editor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readStoredHandle() {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const request = db.transaction('handles').objectStore('handles').get('organized-root');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch {
      return null;
    }
  }

  async function storeHandle(handle) {
    try {
      const db = await openDatabase();
      await new Promise((resolve, reject) => {
        const request = db.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'organized-root');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('Directory handle could not be cached.', error);
    }
  }

  async function ensureRootHandle() {
    if (!('showDirectoryPicker' in window)) throw new Error('当前浏览器不支持文件系统写回，请使用 Chromium/Edge 并通过 localhost 打开');
    let handle = rootHandle || await readStoredHandle();
    if (handle) {
      let permission = await handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') permission = await handle.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        rootHandle = handle;
        return handle;
      }
    }
    handle = await window.showDirectoryPicker({ id: 'notale-template-root', mode: 'readwrite' });
    const permission = await handle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('没有获得目录写入权限');
    rootHandle = handle;
    await storeHandle(handle);
    return handle;
  }

  async function getDirectory(root, segments, create = false) {
    let current = root;
    for (const segment of segments) current = await current.getDirectoryHandle(segment, { create });
    return current;
  }

  async function validateAndOpenPageDirectory(root) {
    await root.getFileHandle('INDEX.md');
    const segments = String(manifest.relativePath || '').split('/').filter(Boolean);
    if (segments.length < 2) throw new Error('模板相对路径无效');
    const fileName = segments.pop();
    const directory = await getDirectory(root, segments, false);
    await directory.getFileHandle(fileName);
    return { directory, fileName };
  }

  async function writeHandle(fileHandle, data) {
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
  }

  function serializeCurrentPage(state) {
    const clone = document.documentElement.cloneNode(true);
    clone.dataset.editMode = 'false';
    clone.querySelectorAll('.native-selected').forEach((node) => node.classList.remove('native-selected'));
    clone.querySelectorAll('.native-handle').forEach((node) => node.remove());
    clone.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
    clone.querySelectorAll('.photo[data-asset]').forEach((node) => {
      const image = node.matches('img') ? node : node.querySelector('img');
      if (image) image.setAttribute('src', node.dataset.asset);
    });
    const clonedState = clone.querySelector('#template-state');
    clonedState.textContent = JSON.stringify(state).replace(/</g, '\\u003c');
    const clonedToolbar = clone.querySelector('#native-toolbar');
    if (clonedToolbar) clonedToolbar.hidden = true;
    const clonedToast = clone.querySelector('#native-toast');
    if (clonedToast) clonedToast.hidden = true;
    return `<!doctype html>\n${clone.outerHTML}`;
  }

  async function saveToFileSystem() {
    if (saveInFlight) return;
    saveInFlight = true;
    const button = toolbar.querySelector('[data-action="save"]');
    if (button) button.disabled = true;
    try {
      const root = await ensureRootHandle();
      const { directory, fileName } = await validateAndOpenPageDirectory(root);
      for (const [asset, blob] of pendingAssets) {
        const segments = asset.replace(/^\.\//, '').split('/').filter(Boolean);
        const name = segments.pop();
        const assetDirectory = await getDirectory(directory, segments, true);
        const assetHandle = await assetDirectory.getFileHandle(name, { create: true });
        await writeHandle(assetHandle, blob);
      }
      const state = captureState();
      const html = serializeCurrentPage(state);
      const htmlHandle = await directory.getFileHandle(fileName);
      await writeHandle(htmlHandle, html);
      pendingAssets.clear();
      showToast(`已写回 ${fileName}`, 'success');
    } catch (error) {
      if (error && error.name === 'AbortError') showToast('已取消目录授权，文件未改动', 'error');
      else showToast(error.message || '保存失败', 'error');
    } finally {
      saveInFlight = false;
      if (button) button.disabled = false;
    }
  }

  document.addEventListener('pointerdown', (event) => {
    if (!editMode || event.target.closest('#native-toolbar')) return;
    const node = event.target.closest('[data-element-id]');
    if (!node) return clearSelection();
    beginMove(event, node);
  });

  document.addEventListener('dblclick', (event) => {
    if (!editMode) return;
    const node = event.target.closest('[data-element-id]');
    if (!node) return;
    selectNode(node);
    if (node.classList.contains('photo')) openImagePicker();
    else beginTextEdit(node);
  });

  toolbar.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'preview') toggleEdit(false);
    if (action === 'undo') undo();
    if (action === 'redo') redo();
    if (action === 'reset') resetPage();
    if (action === 'replace') openImagePicker();
    if (action === 'save') saveToFileSystem();
  });

  fillInput.addEventListener('change', () => {
    if (!selected) return;
    const before = captureState();
    selected.style.backgroundColor = fillInput.value;
    pushHistory(before);
  });
  colorInput.addEventListener('change', () => {
    if (!selected) return;
    const before = captureState();
    selected.style.color = colorInput.value;
    pushHistory(before);
  });
  sizeInput.addEventListener('change', () => {
    if (!selected) return;
    const before = captureState();
    selected.style.fontSize = `${clamp(number(sizeInput.value, 16), 6, 160)}px`;
    pushHistory(before);
  });
  rotateInput.addEventListener('change', () => {
    if (!selected || !selected.classList.contains('el')) return;
    const before = captureState();
    const value = clamp(number(rotateInput.value, 0), -180, 180);
    selected.dataset.rotate = String(value);
    selected.style.transform = `rotate(${value}deg)`;
    pushHistory(before);
  });
  fileInput.addEventListener('change', () => replaceSelectedImage(fileInput.files?.[0]));

  document.addEventListener('keydown', (event) => {
    const editingText = document.activeElement?.hasAttribute('contenteditable');
    if (!editingText && event.key.toLowerCase() === 'e' && !event.ctrlKey && !event.metaKey && !event.altKey) toggleEdit();
    if (event.key === 'Escape' && editMode) toggleEdit(false);
    if (editMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveToFileSystem();
    }
    if (editMode && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
  });

  if (new URLSearchParams(location.search).get('edit') === '1') toggleEdit(true);
  updateToolbarButtons();
  addEventListener('beforeunload', () => objectUrls.forEach((url) => URL.revokeObjectURL(url)));
})();
