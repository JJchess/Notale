import { createNativeView } from "./native-view-host.js?v=20260830-native-view";
import { RuntimeFailure, WorkerRuntimeAdapter } from "./runtime-client.js?v=20260830-fourier";

const MONACO_BASE = "./assets/lib/monaco-editor/min/vs";
const DEFAULT_OUTPUT_HEIGHT = 138;
const MIN_OUTPUT_HEIGHT = 88;
const MAX_OUTPUT_HEIGHT = 360;
const BASE_STEP_MS = 170;
const MARKER_OWNER = "notale-code-runtime";

const elements = Object.fromEntries(
  [
    "workbench", "lessonTitle", "titleContext", "runtimeChip", "runtimeText", "fileTabs",
    "resetButton", "runButton", "runButtonIcon", "runButtonLabel", "lessonSlug",
    "breadcrumbFile", "editor", "editorLoading", "editorPane", "editorShell", "panelSash",
    "outputPanel", "outputSource", "outputContent", "clearOutputButton", "visualizationPane",
    "visualizer", "visualizerError", "previousButton", "playButton", "playButtonIcon", "nextButton",
    "frameProgress", "progressDetail", "speedSelect", "screenReaderStatus",
  ].map((id) => [id, document.querySelector(`#${id}`)]),
);

let lesson = null;
let nativeView = null;
let runtime = null;
let monacoApi = null;
let editor = null;
let editorReady = false;
let visualizerReady = false;
let activeFilename = "";
let traceSource = "";
let testsSource = "";
let lineDecorations = [];
let disposed = false;
let actionCounter = 0;
let runCounter = 0;

const files = new Map();
const models = new Map();
const modelDisposables = new Map();

const playback = {
  frames: [],
  index: -1,
  playing: false,
  timer: 0,
  speed: 1,
  currentStep: null,
};

function fallbackLesson(error) {
  return {
    id: "invalid-code-lesson",
    title: "代码课程配置错误",
    runtime: "python",
    entry: "starter.py",
    files: [],
    limits: { timeoutMs: 5000 },
    initialStep: {
      sequence: 0,
      source: { file: "lesson.js", line: 1, column: 1 },
      kind: "generic",
      state: { error: error?.message || String(error) },
      focus: [],
      changes: [],
      metrics: {},
      annotation: "lesson.js 没有导出有效课程配置。",
    },
  };
}

function validateLesson(candidate) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("lesson.js 必须导出课程对象。");
  if (!candidate.id || !candidate.title) throw new TypeError("课程必须提供 id 和 title。");
  if (!Array.isArray(candidate.files) || !candidate.files.length) throw new TypeError("课程必须至少提供一个 files 项。");
  if (!candidate.entry) throw new TypeError("课程必须提供 entry 文件名。");
  if (!candidate.initialStep || typeof candidate.initialStep !== "object") throw new TypeError("课程必须提供 initialStep。");
  return candidate;
}

async function fetchText(url, label) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} 载入失败（HTTP ${response.status}）。`);
  return response.text();
}

function setRuntimeStatus(kind, message) {
  elements.runtimeChip.dataset.kind = kind;
  elements.runtimeText.textContent = message;
}

function setOutput(kind, text) {
  elements.outputPanel.dataset.kind = kind;
  elements.outputContent.textContent = text;
}

function updateRunAvailability() {
  const ready = Boolean(editorReady && runtime?.ready && !runtime?.getState().running && files.size);
  elements.runButton.disabled = !ready;
  elements.runButtonIcon.className = ready ? "codicon codicon-run-all" : "codicon codicon-loading codicon-modifier-spin";
  elements.runButtonLabel.textContent = ready ? "运行代码" : "准备 Python";
}

function configureCopy() {
  document.title = lesson.title;
  elements.lessonTitle.textContent = lesson.title;
  elements.titleContext.textContent = lesson.entry;
  elements.lessonSlug.textContent = lesson.id;
}

function currentEntry() {
  if (lesson.entryMode === "active" && activeFilename && files.has(activeFilename)) return activeFilename;
  return lesson.entry;
}

function initialStepFor(filename = activeFilename) {
  return files.get(filename)?.initialStep || lesson.initialSteps?.[filename] || lesson.initialStep;
}

function normalizeStep(step, index = 0) {
  const source = step?.source && typeof step.source === "object" ? step.source : {};
  return {
    sequence: Number.isFinite(Number(step?.sequence)) ? Number(step.sequence) : index,
    source: {
      file: String(source.file || currentEntry()),
      line: Math.max(1, Number(source.line) || 1),
      column: Math.max(1, Number(source.column) || 1),
    },
    kind: String(step?.kind || "generic"),
    state: step?.state && typeof step.state === "object" ? step.state : {},
    focus: Array.isArray(step?.focus) ? step.focus : [],
    changes: Array.isArray(step?.changes) ? step.changes : [],
    metrics: step?.metrics && typeof step.metrics === "object" ? step.metrics : {},
    annotation: step?.annotation ? String(step.annotation) : "",
  };
}

function describeStep(step) {
  const parts = [];
  if (step.annotation) parts.push(step.annotation);
  const metrics = Object.entries(step.metrics || {})
    .slice(0, 4)
    .map(([key, value]) => `${key} ${value}`)
    .join("，");
  if (metrics) parts.push(metrics);
  if (!parts.length && Array.isArray(step.state?.items)) parts.push(`当前序列包含 ${step.state.items.length} 项`);
  if (!parts.length && Array.isArray(step.state?.nodes)) parts.push(`当前图包含 ${step.state.nodes.length} 个节点`);
  return `${parts.join("。")}。`.replace("。。", "。");
}

function clearLineDecoration() {
  if (!editor || !monacoApi) return;
  lineDecorations = editor.deltaDecorations(lineDecorations, []);
}

function decorateSource(source) {
  clearLineDecoration();
  if (!source || !models.has(source.file)) return;
  if (activeFilename !== source.file) switchFile(source.file, { focus: false, renderInitial: false });
  const model = models.get(source.file);
  const line = Math.min(Math.max(1, source.line), model.getLineCount());
  lineDecorations = editor.deltaDecorations([], [{
    range: new monacoApi.Range(line, 1, line, 1),
    options: {
      isWholeLine: true,
      className: "trace-current-line",
      linesDecorationsClassName: "trace-current-glyph",
    },
  }]);
  editor.revealLineInCenterIfOutsideViewport(line, monacoApi.editor.ScrollType.Smooth);
}

function renderStep(rawStep, options = {}) {
  const step = normalizeStep(rawStep);
  const previous = options.reset ? null : playback.currentStep;
  playback.currentStep = step;
  elements.visualizerError.hidden = true;
  try {
    nativeView?.render({
      step,
      previousStep: previous,
      playback: {
        index: playback.index,
        count: playback.frames.length,
        playing: playback.playing,
        speed: playback.speed,
        reason: options.reason || (options.reset ? "reset" : "frame"),
      },
      environment: viewEnvironment(),
    });
  } catch (error) {
    elements.visualizerError.hidden = false;
    elements.visualizerError.textContent = `可视化错误：${error?.message || String(error)}`;
  }
  const source = step.source;
  const description = describeStep(step);
  elements.visualizer.setAttribute("aria-label", description);
  elements.screenReaderStatus.textContent = description;
  if (options.decorate !== false) decorateSource(source);
}

function viewEnvironment() {
  return {
    reducedMotion: window.Deck?.reduced?.() ?? window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

function syncPlaybackPacket() {
  if (!playback.currentStep) return;
  nativeView?.render({
    step: playback.currentStep,
    previousStep: playback.currentStep,
    playback: {
      index: playback.index,
      count: playback.frames.length,
      playing: playback.playing,
      speed: playback.speed,
      reason: "frame",
    },
    environment: viewEnvironment(),
  });
}

function updatePlaybackControls() {
  const count = playback.frames.length;
  elements.previousButton.disabled = !count || playback.index <= 0;
  elements.nextButton.disabled = !count || playback.index >= count - 1;
  elements.playButton.disabled = count < 2;
  elements.playButton.dataset.playing = String(playback.playing);
  elements.playButton.setAttribute("aria-label", playback.playing ? "暂停" : "播放");
  elements.playButton.title = playback.playing ? "暂停" : "播放";
  elements.playButtonIcon.className = playback.playing ? "codicon codicon-debug-pause" : "codicon codicon-play";
}

function showFrame(index, announce = false) {
  if (!playback.frames.length) return;
  playback.index = Math.max(0, Math.min(index, playback.frames.length - 1));
  const step = playback.frames[playback.index];
  renderStep(step);
  elements.frameProgress.textContent = `第 ${playback.index + 1} / ${playback.frames.length} 帧`;
  elements.progressDetail.textContent = `${step.source.file}:${step.source.line}`;
  if (announce) elements.screenReaderStatus.textContent = `已到第 ${playback.index + 1} 帧。${describeStep(step)}`;
  updatePlaybackControls();
}

function pause(options = {}) {
  const changed = playback.playing;
  window.clearTimeout(playback.timer);
  playback.timer = 0;
  playback.playing = false;
  updatePlaybackControls();
  if (changed && options.sync !== false) syncPlaybackPacket();
}

function scheduleNextFrame() {
  window.clearTimeout(playback.timer);
  if (!playback.playing) return;
  if (playback.index >= playback.frames.length - 1) {
    pause();
    return;
  }
  const delay = window.Deck?.reduced?.() ? 0 : BASE_STEP_MS / playback.speed;
  playback.timer = window.setTimeout(() => {
    showFrame(playback.index + 1);
    scheduleNextFrame();
  }, delay);
}

function play() {
  if (playback.frames.length < 2) return;
  playback.playing = true;
  if (playback.index >= playback.frames.length - 1) showFrame(0);
  else syncPlaybackPacket();
  updatePlaybackControls();
  scheduleNextFrame();
}

function startRunPlayback(hasRuntimeError) {
  if (!playback.frames.length) return;
  const reducedMotion = viewEnvironment().reducedMotion;
  if (hasRuntimeError || reducedMotion || playback.frames.length < 2) {
    const index = hasRuntimeError || reducedMotion ? playback.frames.length - 1 : 0;
    showFrame(index, true);
    return;
  }
  showFrame(0, true);
  play();
}

function resetPlayback(options = {}) {
  pause({ sync: false });
  playback.frames = [];
  playback.index = -1;
  playback.currentStep = null;
  elements.frameProgress.textContent = "初始状态";
  elements.progressDetail.textContent = "";
  clearLineDecoration();
  renderStep(initialStepFor(), { reset: true, reason: "reset", decorate: false });
  updatePlaybackControls();
  if (!options.keepOutput) setOutput("idle", "运行结果、测试与错误会显示在这里。");
}

function setMarkers(error) {
  if (!monacoApi || !error?.source || !models.has(error.source.file)) return;
  const model = models.get(error.source.file);
  const line = Math.min(Math.max(1, Number(error.source.line) || 1), model.getLineCount());
  const column = Math.min(Math.max(1, Number(error.source.column) || 1), model.getLineMaxColumn(line));
  monacoApi.editor.setModelMarkers(model, MARKER_OWNER, [{
    severity: monacoApi.MarkerSeverity.Error,
    message: error.message || "运行失败",
    startLineNumber: line,
    startColumn: column,
    endLineNumber: line,
    endColumn: Math.min(column + 1, model.getLineMaxColumn(line)),
  }]);
}

function clearMarkers() {
  if (!monacoApi) return;
  for (const model of models.values()) monacoApi.editor.setModelMarkers(model, MARKER_OWNER, []);
}

function formatValue(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

function formatResult(data) {
  const sections = [];
  const output = [data.stdout, data.stderr].filter((text) => String(text || "").trim()).join("\n");
  if (output) sections.push(output.trim());
  if (data.outputTruncated) sections.push("[输出已达到长度上限并被截断]");
  if (data.error) {
    sections.push(`${data.error.message}${data.error.source ? `\n位置：${data.error.source.file}:${data.error.source.line}` : ""}`);
  }
  if (Array.isArray(data.tests) && data.tests.length) {
    const lines = ["测试"];
    for (const test of data.tests) {
      lines.push(`${test.passed ? "✓" : "✗"} ${test.name}${test.message ? ` — ${test.message}` : ""}`);
      if (!test.passed && test.expected !== undefined) lines.push(`  期望：${formatValue(test.expected)}`);
      if (!test.passed && test.observed !== undefined) lines.push(`  实际：${formatValue(test.observed)}`);
    }
    sections.push(lines.join("\n"));
  }
  if (!sections.length) sections.push(`运行完成，共捕获 ${data.frames?.length || 0} 个执行帧。`);
  return sections.join("\n\n");
}

async function runCode() {
  if (!runtime?.ready || runtime.getState().running || !editorReady) return;
  pause();
  clearMarkers();
  actionCounter += 1;
  runCounter += 1;
  setOutput("idle", "正在运行并捕获语义轨迹…");
  updateRunAvailability();
  const request = {
    files: [...files.values()].map((file) => ({ filename: file.filename, source: models.get(file.filename)?.getValue() ?? file.originalSource })),
    entry: currentEntry(),
    traceSource,
    testsSource,
    limits: lesson.limits || {},
    seed: lesson.seed || 0,
  };

  try {
    const data = await runtime.run(request);
    playback.frames = (Array.isArray(data.frames) ? data.frames : []).map(normalizeStep);
    playback.index = -1;
    playback.currentStep = null;
    if (playback.frames.length) startRunPlayback(Boolean(data.error));
    else resetPlayback({ keepOutput: true });
    if (data.error) {
      setMarkers(data.error);
      setOutput("error", formatResult(data));
    } else {
      const failed = (data.tests || []).some((test) => !test.passed);
      setOutput(failed ? "warning" : "success", formatResult(data));
    }
  } catch (error) {
    const failure = error instanceof RuntimeFailure ? error : new RuntimeFailure("client", error?.message || String(error));
    setOutput("error", failure.message);
    resetPlayback({ keepOutput: true });
  } finally {
    updateRunAvailability();
  }
}

function createTabs() {
  elements.fileTabs.replaceChildren();
  for (const file of files.values()) {
    const tab = document.createElement("button");
    tab.className = "file-tab";
    tab.type = "button";
    tab.role = "tab";
    tab.dataset.filename = file.filename;
    tab.setAttribute("aria-selected", "false");
    tab.tabIndex = -1;
    const icon = document.createElement("span");
    icon.className = "codicon codicon-python";
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = file.label || file.filename;
    tab.append(icon, label);
    tab.addEventListener("click", () => switchFile(file.filename));
    elements.fileTabs.append(tab);
    file.tab = tab;
  }
}

function switchFile(filename, options = {}) {
  if (!models.has(filename) || !editor) return;
  activeFilename = filename;
  editor.setModel(models.get(filename));
  for (const file of files.values()) {
    const active = file.filename === filename;
    file.tab?.classList.toggle("is-active", active);
    file.tab?.setAttribute("aria-selected", String(active));
    if (file.tab) file.tab.tabIndex = active ? 0 : -1;
  }
  elements.breadcrumbFile.textContent = filename;
  elements.outputSource.textContent = filename;
  elements.titleContext.textContent = filename;
  if (lesson.entryMode === "active" && options.renderInitial !== false) {
    pause();
    playback.frames = [];
    playback.index = -1;
    playback.currentStep = null;
    clearLineDecoration();
    renderStep(initialStepFor(filename), { reset: true, reason: "reset", decorate: false });
    elements.frameProgress.textContent = "初始状态";
    elements.progressDetail.textContent = "";
    setOutput("idle", `点击运行查看 ${filename} 的实际执行轨迹。`);
    updatePlaybackControls();
  }
  if (options.focus !== false) editor.focus();
}

function markDirty(filename) {
  const file = files.get(filename);
  const model = models.get(filename);
  if (!file || !model) return;
  const dirty = model.getValue() !== file.originalSource;
  file.tab?.setAttribute("data-dirty", String(dirty));
  if (playback.frames.length) {
    pause();
    playback.frames = [];
    playback.index = -1;
    elements.frameProgress.textContent = "代码已修改";
    elements.progressDetail.textContent = "重新运行以更新轨迹";
    updatePlaybackControls();
  }
}

function defineTheme() {
  if (window.NotaleCodeTheme) {
    monacoApi.editor.defineTheme("notale-code-runtime-dark", window.NotaleCodeTheme.monaco);
    return;
  }
  monacoApi.editor.defineTheme("notale-code-runtime-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6A9955" },
      { token: "keyword", foreground: "C586C0" },
      { token: "number", foreground: "B5CEA8" },
      { token: "string", foreground: "CE9178" },
      { token: "identifier", foreground: "D4D4D4" },
    ],
    colors: {
      "editor.background": "#1F1F1F",
      "editor.foreground": "#CCCCCC",
      "editorLineNumber.foreground": "#6E7681",
      "editorLineNumber.activeForeground": "#C6C6C6",
      "editorCursor.foreground": "#AEAFAD",
      "editor.selectionBackground": "#264F78",
      "editor.inactiveSelectionBackground": "#3A3D41",
      "editor.lineHighlightBackground": "#252526",
      "editorIndentGuide.background1": "#333333",
      "editorIndentGuide.activeBackground1": "#555555",
      "editorGutter.background": "#1F1F1F",
      "editorError.foreground": "#F48771",
      "editorWarning.foreground": "#CCA700",
      "scrollbarSlider.background": "#79797966",
      "scrollbarSlider.hoverBackground": "#646464B3",
      "scrollbarSlider.activeBackground": "#BFBFBF66",
    },
  });
}

function initMonaco() {
  return new Promise((resolve, reject) => {
    if (!window.require?.config) {
      reject(new Error("Monaco 离线资源未能载入。"));
      return;
    }
    window.require.config({ paths: { vs: MONACO_BASE } });
    window.require(["vs/editor/editor.main"], () => {
      try {
        monacoApi = window.monaco;
        defineTheme();
        for (const file of files.values()) {
          const uri = monacoApi.Uri.parse(`inmemory://${lesson.id}/${file.filename}`);
          const model = monacoApi.editor.createModel(file.originalSource, file.language || "python", uri);
          models.set(file.filename, model);
          modelDisposables.set(file.filename, model.onDidChangeContent(() => markDirty(file.filename)));
        }
        editor = monacoApi.editor.create(elements.editor, {
          model: models.get(lesson.entry) || models.values().next().value,
          theme: "notale-code-runtime-dark",
          ariaLabel: `${lesson.title} Python 编辑器`,
          automaticLayout: true,
          fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace',
          fontLigatures: false,
          fontSize: 14,
          lineHeight: 22,
          lineNumbersMinChars: 3,
          glyphMargin: true,
          folding: true,
          showFoldingControls: "mouseover",
          minimap: { enabled: true, side: "right", showSlider: "mouseover", renderCharacters: true, maxColumn: 80 },
          overviewRulerLanes: 2,
          renderLineHighlight: "all",
          renderWhitespace: "selection",
          roundedSelection: false,
          scrollBeyondLastLine: false,
          smoothScrolling: false,
          cursorSmoothCaretAnimation: "off",
          padding: { top: 8, bottom: 8 },
          tabSize: 4,
          insertSpaces: true,
          wordWrap: "off",
          contextmenu: true,
          bracketPairColorization: { enabled: true },
          guides: { indentation: true, highlightActiveIndentation: true, bracketPairs: true },
          matchBrackets: "always",
          quickSuggestions: { other: true, comments: false, strings: false },
          suggestOnTriggerCharacters: true,
          wordBasedSuggestions: "currentDocument",
          parameterHints: { enabled: true },
          stickyScroll: { enabled: true, maxLineCount: 3 },
        });
        editor.addAction({
          id: "notale-code-runtime.run",
          label: "运行代码",
          keybindings: [monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.Enter],
          run: runCode,
        });
        editorReady = true;
        elements.editorLoading.hidden = true;
        elements.workbench.dataset.editorReady = "true";
        switchFile(lesson.entry, { focus: false });
        updateRunAvailability();
        resolve();
      } catch (error) { reject(error); }
    }, reject);
  });
}

function setOutputHeight(height) {
  const value = Math.max(MIN_OUTPUT_HEIGHT, Math.min(MAX_OUTPUT_HEIGHT, Math.round(height)));
  elements.editorPane.style.setProperty("--output-panel-height", `${value}px`);
  elements.panelSash.setAttribute("aria-valuenow", String(value));
  editor?.layout();
  return value;
}

function initOutputSash() {
  let drag = null;
  setOutputHeight(DEFAULT_OUTPUT_HEIGHT);
  elements.panelSash.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      y: event.clientY,
      height: Number(elements.panelSash.getAttribute("aria-valuenow")) || DEFAULT_OUTPUT_HEIGHT,
    };
    elements.panelSash.setPointerCapture(event.pointerId);
    elements.panelSash.dataset.dragging = "true";
    document.body.classList.add("is-resizing-output");
  });
  elements.panelSash.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const scale = window.Deck?.s || 1;
    setOutputHeight(drag.height + (drag.y - event.clientY) / scale);
  });
  const end = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (elements.panelSash.hasPointerCapture(event.pointerId)) elements.panelSash.releasePointerCapture(event.pointerId);
    drag = null;
    elements.panelSash.dataset.dragging = "false";
    document.body.classList.remove("is-resizing-output");
  };
  elements.panelSash.addEventListener("pointerup", end);
  elements.panelSash.addEventListener("pointercancel", end);
  elements.panelSash.addEventListener("dblclick", () => setOutputHeight(DEFAULT_OUTPUT_HEIGHT));
  elements.panelSash.addEventListener("keydown", (event) => {
    let current = Number(elements.panelSash.getAttribute("aria-valuenow")) || DEFAULT_OUTPUT_HEIGHT;
    if (event.key === "ArrowUp") current += event.shiftKey ? 32 : 8;
    else if (event.key === "ArrowDown") current -= event.shiftKey ? 32 : 8;
    else if (event.key === "Home") current = MIN_OUTPUT_HEIGHT;
    else if (event.key === "End") current = MAX_OUTPUT_HEIGHT;
    else return;
    event.preventDefault();
    setOutputHeight(current);
  });
}

function bindEvents() {
  elements.runButton.addEventListener("click", runCode);
  elements.resetButton.addEventListener("click", () => resetAll({ focus: true }));
  elements.clearOutputButton.addEventListener("click", () => setOutput("idle", ""));
  elements.previousButton.addEventListener("click", () => { pause(); showFrame(playback.index - 1, true); });
  elements.nextButton.addEventListener("click", () => { pause(); showFrame(playback.index + 1, true); });
  elements.playButton.addEventListener("click", () => playback.playing ? pause() : play());
  elements.speedSelect.addEventListener("change", () => {
    playback.speed = Number(elements.speedSelect.value) || 1;
    if (playback.playing) scheduleNextFrame();
    syncPlaybackPacket();
  });
  elements.fileTabs.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const names = [...files.keys()];
    if (!names.length) return;
    let index = Math.max(0, names.indexOf(activeFilename));
    if (event.key === "ArrowLeft") index = (index - 1 + names.length) % names.length;
    if (event.key === "ArrowRight") index = (index + 1) % names.length;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = names.length - 1;
    event.preventDefault();
    switchFile(names[index], { focus: false });
    files.get(names[index])?.tab?.focus();
  });
}

function resetAll(options = {}) {
  runtime?.cancel();
  pause();
  clearMarkers();
  for (const file of files.values()) {
    const model = models.get(file.filename);
    if (model && model.getValue() !== file.originalSource) model.setValue(file.originalSource);
    file.tab?.setAttribute("data-dirty", "false");
  }
  playback.speed = 1;
  elements.speedSelect.value = "1";
  actionCounter = 0;
  runCounter = 0;
  setOutputHeight(DEFAULT_OUTPUT_HEIGHT);
  resetPlayback();
  const resetEntry = lesson.entryMode === "active" ? (lesson.files[0]?.filename || lesson.entry) : lesson.entry;
  if (models.has(resetEntry)) switchFile(resetEntry, { focus: options.focus !== false });
  updateRunAvailability();
}

function installPublicApi() {
  window.CodeLab = {
    run: runCode,
    reset: resetAll,
    switchFile,
    previewStep(step) {
      pause({ sync: false });
      actionCounter += 1;
      renderStep(normalizeStep(step), { reason: "preview", decorate: false });
      return "native-html";
    },
    getEditor() { return editor; },
    getModel(filename = activeFilename) { return models.get(filename) || null; },
    getLesson() { return lesson; },
    getState() {
      return {
        editorReady,
        runtimeReady: Boolean(runtime?.ready),
        running: Boolean(runtime?.getState().running),
        runtimeGeneration: runtime?.generation || 0,
        activeFile: activeFilename,
        entry: currentEntry(),
        frameIndex: playback.index,
        frameCount: playback.frames.length,
        playing: playback.playing,
        currentStep: playback.currentStep,
        viewMode: "native-html",
        viewReady: visualizerReady,
        output: elements.outputContent.textContent,
        outputKind: elements.outputPanel.dataset.kind,
        outputHeight: Number(elements.panelSash.getAttribute("aria-valuenow")) || DEFAULT_OUTPUT_HEIGHT,
        actionCounter,
        runCounter,
      };
    },
    dispose,
  };
  window.__skillLab = {
    snapshot() {
      return {
        activeFile: activeFilename,
        sources: Object.fromEntries([...models.entries()].map(([name, model]) => [name, model.getValue()])),
        frameIndex: playback.index,
        frameCount: playback.frames.length,
        currentStep: playback.currentStep,
        actionCounter,
      };
    },
    act() {
      actionCounter += 1;
      if (playback.frames.length && playback.index < playback.frames.length - 1) showFrame(playback.index + 1);
      else void runCode();
    },
    reset() { resetAll({ focus: false }); },
  };
}

async function loadCourseFiles() {
  const fileRows = await Promise.all(lesson.files.map(async (spec) => {
    const source = spec.source ?? await fetchText(spec.sourceUrl, spec.filename);
    return { ...spec, originalSource: String(source) };
  }));
  for (const file of fileRows) {
    if (!file.filename || files.has(file.filename)) throw new Error(`课程文件名无效或重复：${file.filename || "<empty>"}`);
    files.set(file.filename, file);
  }
  if (!files.has(lesson.entry)) throw new Error(`入口文件不在 files 中：${lesson.entry}`);
  [traceSource, testsSource] = await Promise.all([
    fetchText(lesson.traceUrl || "./lesson/trace.py", "trace.py"),
    lesson.testsUrl === null ? Promise.resolve("") : fetchText(lesson.testsUrl || "./lesson/tests.py", "tests.py"),
  ]);
}

function dispose() {
  if (disposed) return;
  disposed = true;
  pause();
  runtime?.dispose();
  nativeView?.dispose();
  editor?.dispose();
  for (const disposable of modelDisposables.values()) disposable.dispose();
  for (const model of models.values()) model.dispose();
  modelDisposables.clear();
  models.clear();
}

async function initialize() {
  window.Deck?.init?.({ title: "代码学习工作台", keys: false });
  bindEvents();
  initOutputSash();

  let lessonError = null;
  try {
    const module = await import("../lesson/lesson.js?v=20260830-fourier");
    lesson = validateLesson(module.default || module.lesson);
  } catch (error) {
    lessonError = error;
    lesson = fallbackLesson(error);
  }
  configureCopy();

  nativeView = createNativeView(elements.visualizer, {
    onReady() { visualizerReady = true; },
    onRendered() { visualizerReady = true; },
    onError(error) {
      elements.visualizerError.hidden = false;
      elements.visualizerError.textContent = `可视化错误：${error?.message || String(error)}`;
    },
  });
  try {
    await nativeView.mount();
    renderStep(lesson.initialStep, { reset: true, reason: "initial", decorate: false });
  } catch (error) {
    visualizerReady = false;
    elements.visualizerError.hidden = false;
    elements.visualizerError.textContent = `原生视图载入失败：${error?.message || String(error)}`;
  }
  installPublicApi();

  if (lessonError) {
    elements.editorLoading.textContent = `课程配置错误：${lessonError.message}`;
    setRuntimeStatus("error", "课程配置错误");
    setOutput("error", lessonError.stack || lessonError.message);
    return;
  }

  try {
    await loadCourseFiles();
    createTabs();
  } catch (error) {
    elements.editorLoading.textContent = "课程文件载入失败。";
    setRuntimeStatus("error", "课程文件错误");
    setOutput("error", error?.stack || error?.message || String(error));
    return;
  }

  runtime = new WorkerRuntimeAdapter({
    workerUrl: "./runtime/python-worker.js",
    timeoutMs: Number(lesson.limits?.timeoutMs) || 5000,
    onStatus(status) {
      setRuntimeStatus(status.kind, status.message);
      updateRunAvailability();
    },
  });
  runtime.start().catch((error) => {
    setRuntimeStatus("error", "Python 无法启动");
    setOutput("error", error?.message || String(error));
  });
  initMonaco().catch((error) => {
    elements.editorLoading.textContent = "Monaco 编辑器加载失败。";
    setRuntimeStatus("error", "编辑器载入失败");
    setOutput("error", error?.stack || error?.message || String(error));
  });
}

window.addEventListener("beforeunload", dispose, { once: true });
initialize().catch((error) => {
  setRuntimeStatus("error", "工作台初始化失败");
  setOutput("error", error?.stack || error?.message || String(error));
});
