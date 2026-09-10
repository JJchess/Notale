<sample id="code-core-bundle" category="code" variant="full">
  <file path="samples/code/edit-distance/lesson/edit_distance.py">
```python
source = "KITTEN"
target = "SITTING"


def edit_distance(source, target):
    dp = [[None] * (len(target) + 1) for _ in range(len(source) + 1)]
    for i in range(len(source) + 1):
        dp[i][0] = i
    for j in range(len(target) + 1):
        dp[0][j] = j

    for i in range(1, len(source) + 1):
        for j in range(1, len(target) + 1):
            cost = 0 if source[i - 1] == target[j - 1] else 1
            dp[i][j] = min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
            )
    return dp[-1][-1], dp


result, matrix = edit_distance(source, target)
```
  </file>
  <file path="samples/code/edit-distance/lesson/lesson.js">
```javascript
const source = "KITTEN";
const target = "SITTING";
const initialTable = Array.from({ length: source.length + 1 }, (_, row) =>
  Array.from({ length: target.length + 1 }, (_, column) => row === 0 ? column : column === 0 ? row : null)
);

export const lesson = {
  id: "edit-distance",
  title: "编辑距离动态规划",
  learningTarget: "逐格检查插入、删除和替换三个来源，理解最优子结构如何填满编辑距离表。",
  runtime: "python",
  entry: "edit_distance.py",
  entryMode: "fixed",
  files: [{
    id: "edit-distance",
    filename: "edit_distance.py",
    label: "edit_distance.py",
    language: "python",
    sourceUrl: "./lesson/edit_distance.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 31,
  limits: {
    timeoutMs: 5000, maxFrames: 1800, maxPayloadBytes: 5_000_000,
    maxOutputChars: 40_000, maxSourceChars: 120_000,
    maxItems: 180, maxDepth: 9, maxString: 900,
  },
  initialStep: {
    sequence: 0,
    source: { file: "edit_distance.py", line: 7, column: 1 },
    kind: "table",
    state: {
      source, target, table: initialTable, active: [0, 0], dependencies: [],
      operation: "边界初始化", complete: false,
    },
    focus: [{ id: "0-0", role: "current" }],
    changes: [],
    metrics: { "已求单元": source.length + target.length + 1, "总单元": 56, "当前值": 0 },
    annotation: "空前缀只能通过连续插入或删除得到。",
  },
};

export default lesson;
```
  </file>
  <file path="samples/code/edit-distance/lesson/tests.py">
```python
def run_tests(namespace):
    edit_distance = namespace.get("edit_distance")
    result = namespace.get("result")
    matrix = namespace.get("matrix", [])
    first_row_initialized = bool(matrix) and matrix[0] == list(range(len(matrix[0])))
    first_column_initialized = bool(matrix) and [row[0] for row in matrix] == list(range(len(matrix)))
    boundary_ok = first_row_initialized and first_column_initialized
    small_cases = (
        edit_distance("", "abc")[0] == 3
        and edit_distance("same", "same")[0] == 0
        and edit_distance("ab", "ba")[0] == 2
    ) if callable(edit_distance) else False
    return [
        {
            "name": "KITTEN → SITTING 的距离为 3",
            "passed": result == 3,
            "message": "一次替换、一次替换和一次插入即可完成转换。",
            "expected": 3,
            "observed": result,
        },
        {
            "name": "空前缀边界按长度初始化",
            "passed": boundary_ok,
            "message": "空串变为长度 j 的前缀需要 j 次插入，反向同理。",
        },
        {
            "name": "递推适用于边界与相同字符",
            "passed": small_cases,
            "message": "实现应处理空串、完全相同和交叉字符，而非记住一个答案。",
        },
    ]
```
  </file>
  <file path="samples/code/edit-distance/lesson/trace.py">
```python
def _copy_table(value):
    if not isinstance(value, list):
        return []
    return [list(row) if isinstance(row, list) else [] for row in value]


def _changed_cells(previous, current):
    changes = []
    for row, values in enumerate(current):
        for column, value in enumerate(values):
            old = previous[row][column] if row < len(previous) and column < len(previous[row]) else None
            if value != old:
                changes.append({"id": f"{row}-{column}", "role": "write"})
    return changes


def _step(source, target, table, active, cost, previous_state, complete=False):
    previous_table = _copy_table((previous_state or {}).get("table", []))
    row = active[0] if active else None
    column = active[1] if active else None
    dependencies = []
    if isinstance(row, int) and isinstance(column, int) and row > 0 and column > 0:
        dependencies = [[row - 1, column - 1], [row - 1, column], [row, column - 1]]
    focus = [
        {"id": f"{dependency[0]}-{dependency[1]}", "role": role}
        for dependency, role in zip(dependencies, ("diagonal", "delete", "insert"))
    ]
    if active:
        focus.append({"id": f"{row}-{column}", "role": "current"})

    if complete:
        operation = "完成"
        annotation = f"右下角汇总所有前缀问题；最少需要 {table[-1][-1]} 次编辑。"
    elif not active or row == 0 or column == 0:
        operation = "边界初始化"
        annotation = "空前缀只能通过连续插入或删除得到。"
    elif cost == 0:
        operation = "字符相同 · 沿对角线"
        annotation = f"{source[row - 1]} 与 {target[column - 1]} 相同，对角值无需增加代价。"
    else:
        operation = "取插入 / 删除 / 替换的最小值"
        annotation = f"{source[row - 1]} 与 {target[column - 1]} 不同，比较三个前缀子问题。"

    computed = sum(value is not None for values in table for value in values)
    return {
        "kind": "table",
        "state": {
            "source": source,
            "target": target,
            "table": table,
            "active": list(active) if active else None,
            "dependencies": dependencies,
            "operation": operation,
            "complete": complete,
        },
        "focus": focus,
        "changes": _changed_cells(previous_table, table),
        "metrics": {
            "已求单元": computed,
            "总单元": (len(source) + 1) * (len(target) + 1),
            "当前值": table[row][column] if active and table[row][column] is not None else "—",
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    if frame.f_code.co_name != "edit_distance" or not frame.f_code.co_filename.endswith("edit_distance.py"):
        return None
    values = frame.f_locals
    table = _copy_table(values.get("dp"))
    if not table:
        return None
    source = values.get("source", "")
    target = values.get("target", "")
    i = values.get("i")
    j = values.get("j")
    active = [i, j] if isinstance(i, int) and isinstance(j, int) and i < len(table) and j < len(table[i]) else None
    return _step(source, target, table, active, values.get("cost"), previous_state)


def finalize(namespace, previous_state):
    source = namespace.get("source", "")
    target = namespace.get("target", "")
    table = _copy_table(namespace.get("matrix"))
    active = [len(source), len(target)] if table else None
    return _step(source, target, table, active, None, previous_state, complete=True)
```
  </file>
  <file path="samples/code/edit-distance/lesson/view/index.html">
```html
<main class="dp-study">
  <header class="proof-heading">
    <p>LEVENSHTEIN / PREFIX ALIGNMENT</p>
    <strong id="resultReadout">D[0,0] = 0</strong>
  </header>

  <section id="matrixStage" class="matrix-stage" aria-label="编辑距离动态规划表">
    <div id="columnLabels" class="column-labels" aria-hidden="true"></div>
    <div id="rowLabels" class="row-labels" aria-hidden="true"></div>
    <div id="matrix" class="matrix"></div>
    <svg id="dependencyLayer" class="dependency-layer" aria-hidden="true">
      <defs>
        <marker id="arrowHead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z"></path>
        </marker>
      </defs>
      <g id="dependencyLines"></g>
    </svg>
  </section>

  <section class="recurrence" aria-label="当前递推关系">
    <code id="operation">边界初始化</code>
    <span id="formula">D[i,j] = min(↖ + cost, ↑ + 1, ← + 1)</span>
  </section>

  <p id="viewAnnotation" class="annotation" aria-live="polite">空前缀只能通过连续插入或删除得到。</p>
</main>
```
  </file>
  <file path="samples/code/edit-distance/lesson/view/render.js">
```javascript
const SVG_NS = "http://www.w3.org/2000/svg";
const cells = new Map();
const columnLabels = new Map();
const rowLabels = new Map();
const dependencyLines = new Map();

const matrixStage = document.querySelector("#matrixStage");
const matrix = document.querySelector("#matrix");
const columnHost = document.querySelector("#columnLabels");
const rowHost = document.querySelector("#rowLabels");
const dependencyLayer = document.querySelector("#dependencyLayer");
const dependencyHost = document.querySelector("#dependencyLines");
const operation = document.querySelector("#operation");
const formula = document.querySelector("#formula");
const annotation = document.querySelector("#viewAnnotation");
const resultReadout = document.querySelector("#resultReadout");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cellId(row, column) {
  return `${row}-${column}`;
}

function ensureCell(id) {
  if (cells.has(id)) return cells.get(id);
  const cell = document.createElement("span");
  cell.className = "dp-cell";
  cell.dataset.entityId = id;
  matrix.append(cell);
  cells.set(id, cell);
  return cell;
}

function syncLabels(host, records, values) {
  const active = new Set();
  values.forEach((value, index) => {
    const key = String(index);
    active.add(key);
    let label = records.get(key);
    if (!label) {
      label = document.createElement("span");
      records.set(key, label);
      host.append(label);
    }
    label.textContent = value;
    label.className = index === 0 ? "axis-empty" : "";
  });
  for (const [key, label] of records) {
    if (active.has(key)) continue;
    label.remove();
    records.delete(key);
  }
}

function ensureDependency(key) {
  if (dependencyLines.has(key)) return dependencyLines.get(key);
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("class", "dependency-line");
  dependencyHost.append(line);
  dependencyLines.set(key, line);
  return line;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const table = list(state.table).map(list);
  const rows = Math.max(1, table.length);
  const columns = Math.max(1, ...table.map((row) => row.length));
  matrixStage.style.setProperty("--rows", String(rows));
  matrixStage.style.setProperty("--columns", String(columns));
  dependencyLayer.setAttribute("viewBox", `0 0 ${columns} ${rows}`);

  syncLabels(columnHost, columnLabels, ["∅", ...Array.from(String(state.target || ""))]);
  syncLabels(rowHost, rowLabels, ["∅", ...Array.from(String(state.source || ""))]);

  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const activeCells = new Set();
  table.forEach((values, row) => {
    values.forEach((value, column) => {
      const id = cellId(row, column);
      activeCells.add(id);
      const cell = ensureCell(id);
      cell.style.gridRow = String(row + 1);
      cell.style.gridColumn = String(column + 1);
      cell.textContent = value === null || value === undefined ? "·" : String(value);
      cell.dataset.computed = String(value !== null && value !== undefined);
      cell.dataset.changed = String(changed.has(id));
      cell.dataset.final = String(Boolean(state.complete) && row === rows - 1 && column === columns - 1);
      if (focus.has(id)) cell.dataset.focus = focus.get(id);
      else delete cell.dataset.focus;
      const rowPrefix = String(state.source || "").slice(0, row) || "空串";
      const columnPrefix = String(state.target || "").slice(0, column) || "空串";
      cell.setAttribute("aria-label", `${rowPrefix} 到 ${columnPrefix} 的距离：${value ?? "尚未计算"}`);
    });
  });
  for (const [id, cell] of cells) {
    if (activeCells.has(id)) continue;
    cell.remove();
    cells.delete(id);
  }

  const active = list(state.active);
  const dependencies = list(state.dependencies);
  const activeLines = new Set();
  if (active.length === 2) {
    dependencies.forEach((dependency, index) => {
      if (!Array.isArray(dependency) || dependency.length !== 2) return;
      const key = `${dependency[0]}-${dependency[1]}:${index}`;
      activeLines.add(key);
      const line = ensureDependency(key);
      line.setAttribute("x1", String(dependency[1] + 0.5));
      line.setAttribute("y1", String(dependency[0] + 0.5));
      line.setAttribute("x2", String(active[1] + 0.45));
      line.setAttribute("y2", String(active[0] + 0.45));
    });
  }
  for (const [key, line] of dependencyLines) {
    if (activeLines.has(key)) continue;
    line.remove();
    dependencyLines.delete(key);
  }

  const activeValue = active.length === 2 ? table[active[0]]?.[active[1]] : null;
  resultReadout.textContent = state.complete
    ? `DISTANCE = ${table[rows - 1]?.[columns - 1] ?? "—"}`
    : `D[${active[0] ?? "i"},${active[1] ?? "j"}] = ${activeValue ?? "?"}`;
  operation.textContent = state.operation || "等待递推";
  formula.textContent = active[0] > 0 && active[1] > 0
    ? "D[i,j] = min(↖ + cost, ↑ + 1, ← + 1)"
    : "D[i,0] = i · D[0,j] = j";
  annotation.textContent = step?.annotation || "观察当前单元格与三个前缀子问题。";
};
```
  </file>
  <file path="samples/code/euclid-recursion/lesson/euclid.py">
```python
def gcd(a, b):
    if b == 0:
        return a
    return gcd(b, a % b)


initial_a = 1071
initial_b = 462
result = gcd(initial_a, initial_b)
```
  </file>
  <file path="samples/code/euclid-recursion/lesson/lesson.js">
```javascript
const firstFrame = {
  id: "call-0", depth: 0, a: 1071, b: 462, quotient: 2, remainder: 147,
};

export const lesson = {
  id: "euclid-recursion",
  title: "欧几里得递归",
  learningTarget: "沿调用栈检查 gcd(a,b)=gcd(b,a mod b)，并识别余数为零的基例。",
  runtime: "python",
  entry: "euclid.py",
  entryMode: "fixed",
  files: [{
    id: "euclid",
    filename: "euclid.py",
    label: "euclid.py",
    language: "python",
    sourceUrl: "./lesson/euclid.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 41,
  limits: {
    timeoutMs: 5000, maxFrames: 800, maxPayloadBytes: 2_000_000,
    maxOutputChars: 30_000, maxSourceChars: 80_000,
    maxItems: 80, maxDepth: 10, maxString: 700,
  },
  initialStep: {
    sequence: 0,
    source: { file: "euclid.py", line: 1, column: 1 },
    kind: "call-stack",
    state: { frames: [firstFrame], phase: "line", result: null, complete: false },
    focus: [{ id: "call-0", role: "current" }],
    changes: [],
    metrics: { "递归深度": 1, "当前余数": 147, "结果": "—" },
    annotation: "1071 = 2 × 462 + 147，下一层只保留除数与余数。",
  },
};

export default lesson;
```
  </file>
  <file path="samples/code/euclid-recursion/lesson/tests.py">
```python
def run_tests(namespace):
    gcd = namespace.get("gcd")
    result = namespace.get("result")
    callable_gcd = callable(gcd)
    return [
        {
            "name": "1071 与 462 的最大公约数为 21",
            "passed": result == 21,
            "message": "余数序列应为 147、21、0。",
            "expected": 21,
            "observed": result,
        },
        {
            "name": "零参数触发递归基例",
            "passed": callable_gcd and gcd(9, 0) == 9,
            "message": "当 b 为 0 时应直接返回 a。",
        },
        {
            "name": "交换输入不改变最大公约数",
            "passed": callable_gcd and gcd(48, 18) == gcd(18, 48) == 6,
            "message": "算法依赖整除关系，而不是参数书写顺序。",
        },
    ]
```
  </file>
  <file path="samples/code/euclid-recursion/lesson/trace.py">
```python
def _stack(frame):
    frames = []
    current = frame
    while current is not None:
        if current.f_code.co_name == "gcd" and current.f_code.co_filename.endswith("euclid.py"):
            a = current.f_locals.get("a")
            b = current.f_locals.get("b")
            if isinstance(a, int) and isinstance(b, int):
                frames.append((a, b))
        current = current.f_back
    frames.reverse()
    return frames


def _records(values):
    return [
        {
            "id": f"call-{depth}",
            "depth": depth,
            "a": a,
            "b": b,
            "quotient": a // b if b else None,
            "remainder": a % b if b else 0,
        }
        for depth, (a, b) in enumerate(values)
    ]


def _full_sequence(a, b):
    values = []
    while isinstance(a, int) and isinstance(b, int):
        values.append((a, b))
        if b == 0:
            break
        a, b = b, a % b
    return values


def _step(values, previous_state, event="line", complete=False, result=None):
    frames = _records(values)
    previous_ids = {row.get("id") for row in (previous_state or {}).get("frames", [])}
    additions = [row for row in frames if row["id"] not in previous_ids]
    current = frames[-1] if frames else None

    if complete:
        annotation = f"余数降到 0；最后一个非零除数 {result} 就是最大公约数。"
    elif current and current["b"] == 0:
        annotation = f"到达基例 gcd({current['a']}, 0)，开始把 {current['a']} 返回给上层。"
    elif event == "return" and current:
        annotation = f"当前递归帧求值完成，结果将沿调用栈向上返回。"
    elif current:
        annotation = f"{current['a']} = {current['quotient']} × {current['b']} + {current['remainder']}，下一层只保留除数与余数。"
    else:
        annotation = "每一层把问题缩成 gcd(b, a mod b)。"

    return {
        "kind": "call-stack",
        "state": {
            "frames": frames,
            "phase": "complete" if complete else event,
            "result": result,
            "complete": complete,
        },
        "focus": [{"id": current["id"], "role": "current"}] if current else [],
        "changes": [{"id": row["id"], "role": "call"} for row in additions],
        "metrics": {
            "递归深度": len(frames),
            "当前余数": current["remainder"] if current else 0,
            "结果": result if result is not None else "—",
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    values = _stack(frame)
    if not values:
        return None
    return _step(values, previous_state, event=event)


def finalize(namespace, previous_state):
    values = _full_sequence(namespace.get("initial_a"), namespace.get("initial_b"))
    return _step(values, previous_state, complete=True, result=namespace.get("result"))
```
  </file>
  <file path="samples/code/euclid-recursion/lesson/view/index.html">
```html
<main class="euclid-study">
  <header class="measure-heading">
    <p>EUCLIDEAN DESCENT / a = q × b + r</p>
    <strong id="resultReadout">gcd(1071, 462)</strong>
  </header>

  <svg id="ladderCanvas" class="ladder-canvas" viewBox="0 0 800 500"
    role="img" aria-labelledby="ladderTitle ladderDescription">
    <title id="ladderTitle">欧几里得算法递归余数阶梯</title>
    <desc id="ladderDescription">每一行是一层递归调用，刻度长度随着余数收窄。</desc>
    <g id="connectorLayer" class="connector-layer"></g>
    <g id="callLayer" class="call-layer"></g>
  </svg>

  <section class="invariant" aria-label="递归不变量">
    <span>INVARIANT</span>
    <code>gcd(a, b) = gcd(b, a mod b)</code>
  </section>

  <p id="viewAnnotation" class="annotation" aria-live="polite">每一层把问题缩成 gcd(b, a mod b)。</p>
</main>
```
  </file>
  <file path="samples/code/euclid-recursion/lesson/view/render.js">
```javascript
const SVG_NS = "http://www.w3.org/2000/svg";
const calls = new Map();
const connectors = new Map();

const callLayer = document.querySelector("#callLayer");
const connectorLayer = document.querySelector("#connectorLayer");
const annotation = document.querySelector("#viewAnnotation");
const resultReadout = document.querySelector("#resultReadout");
const ladderDescription = document.querySelector("#ladderDescription");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function ensureCall(id) {
  if (calls.has(id)) return calls.get(id);
  const root = svgElement("g", { class: "call-row" });
  root.dataset.entityId = id;
  const depth = svgElement("text", { class: "depth-label", x: "34", y: "4" });
  const equation = svgElement("text", { class: "equation-label", x: "118", y: "4" });
  const segments = svgElement("g", { class: "segments" });
  const remainder = svgElement("rect", { class: "remainder-segment", y: "22", height: "9" });
  const remainderLabel = svgElement("text", { class: "remainder-label", y: "47" });
  root.append(depth, equation, segments, remainder, remainderLabel);
  callLayer.append(root);
  const record = { root, depth, equation, segments, remainder, remainderLabel, segmentRows: new Map() };
  calls.set(id, record);
  return record;
}

function syncSegments(record, count, width, startX) {
  const active = new Set();
  for (let index = 0; index < count; index += 1) {
    const key = String(index);
    active.add(key);
    let segment = record.segmentRows.get(key);
    if (!segment) {
      segment = svgElement("rect", { class: "quotient-segment", y: "22", height: "9" });
      record.segments.append(segment);
      record.segmentRows.set(key, segment);
    }
    segment.setAttribute("x", String(startX + index * width));
    segment.setAttribute("width", String(Math.max(1, width - 1)));
  }
  for (const [key, segment] of record.segmentRows) {
    if (active.has(key)) continue;
    segment.remove();
    record.segmentRows.delete(key);
  }
}

function ensureConnector(id) {
  if (connectors.has(id)) return connectors.get(id);
  const path = svgElement("path", { class: "descent-connector" });
  connectorLayer.append(path);
  connectors.set(id, path);
  return path;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const frames = list(state.frames);
  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const activeCalls = new Set();
  const maxA = Math.max(1, ...frames.map((frame) => Math.abs(Number(frame.a) || 0)));
  const spacing = frames.length > 1 ? Math.min(102, 390 / (frames.length - 1)) : 102;
  const startY = frames.length > 3 ? 38 : 82;
  const startX = 118;
  const scale = 570 / maxA;

  frames.forEach((frame, index) => {
    const id = String(frame.id || `call-${index}`);
    activeCalls.add(id);
    const record = ensureCall(id);
    const y = startY + index * spacing;
    record.root.setAttribute("transform", `translate(0 ${y})`);
    record.root.dataset.changed = String(changed.has(id));
    record.root.dataset.complete = String(Boolean(state.complete) && index === frames.length - 1);
    if (focus.has(id)) record.root.dataset.focus = focus.get(id);
    else delete record.root.dataset.focus;

    const a = Number(frame.a) || 0;
    const b = Number(frame.b) || 0;
    const quotient = Number.isInteger(frame.quotient) ? frame.quotient : 0;
    const remainder = Number(frame.remainder) || 0;
    const bWidth = Math.max(0, Math.abs(b) * scale);
    const remainderWidth = Math.max(b === 0 ? Math.abs(a) * scale : 0, Math.abs(remainder) * scale);
    syncSegments(record, quotient || (b === 0 ? 0 : 1), bWidth, startX);
    record.remainder.setAttribute("x", String(startX + quotient * bWidth));
    record.remainder.setAttribute("width", String(Math.max(2, remainderWidth)));
    record.depth.textContent = `DEPTH ${String(frame.depth ?? index).padStart(2, "0")}`;
    record.equation.textContent = b === 0 ? `gcd(${a}, 0) → ${a}` : `${a} = ${quotient} × ${b} + ${remainder}`;
    const remainderEnd = startX + quotient * bWidth + Math.max(2, remainderWidth);
    record.remainderLabel.setAttribute("x", String(Math.min(748, remainderEnd)));
    record.remainderLabel.textContent = b === 0 ? `GCD ${a}` : `r ${remainder}`;
    const callDescription = b === 0
      ? `递归深度 ${index}，基例返回 ${a}`
      : `递归深度 ${index}，${a} 除以 ${b}，余数 ${remainder}`;
    record.root.setAttribute("aria-label", callDescription);
  });
  for (const [id, record] of calls) {
    if (activeCalls.has(id)) continue;
    record.root.remove();
    calls.delete(id);
  }

  const activeConnectors = new Set();
  for (let index = 0; index < frames.length - 1; index += 1) {
    const id = `${frames[index].id}--${frames[index + 1].id}`;
    activeConnectors.add(id);
    const current = frames[index];
    const y = startY + index * spacing;
    const nextY = startY + (index + 1) * spacing;
    const bWidth = Math.abs(Number(current.b) || 0) * scale;
    const path = ensureConnector(id);
    const curve = `M ${startX + bWidth} ${y + 31} C ${startX + bWidth} ${y + 55}, `
      + `${startX} ${nextY - 18}, ${startX} ${nextY + 22}`;
    path.setAttribute("d", curve);
  }
  for (const [id, path] of connectors) {
    if (activeConnectors.has(id)) continue;
    path.remove();
    connectors.delete(id);
  }

  resultReadout.textContent = state.complete
    ? `GCD = ${state.result}`
    : frames.length ? `gcd(${frames[0].a}, ${frames[0].b})` : "gcd(a, b)";
  annotation.textContent = step?.annotation || "观察参数如何沿调用栈收敛。";
  const depthSummary = state.complete
    ? `最大公约数为 ${state.result}`
    : `最深层余数为 ${frames.at(-1)?.remainder ?? "未知"}`;
  ladderDescription.textContent = `当前有 ${frames.length} 层递归；${depthSummary}。`;
};
```
  </file>
  <file path="samples/code/grid-bfs/lesson/bfs.py">
```python
from collections import deque


grid = [
    "#########",
    "#S..#...#",
    "#.#.#.#.#",
    "#.#...#.#",
    "#.#####.#",
    "#......G#",
    "#########",
]
start = (1, 1)
goal = (5, 7)
queue = deque([start])
visited = {start}
parent = {start: None}
directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]

while queue:
    current = queue.popleft()
    if current == goal:
        break
    for dr, dc in directions:
        candidate = (current[0] + dr, current[1] + dc)
        row, column = candidate
        if grid[row][column] != "#" and candidate not in visited:
            visited.add(candidate)
            parent[candidate] = current
            queue.append(candidate)

path = []
cursor = goal if goal in parent else None
while cursor is not None:
    path.append(cursor)
    cursor = parent[cursor]
path.reverse()
result = path
```
  </file>
  <file path="samples/code/grid-bfs/lesson/lesson.js">
```javascript
const initialGrid = [
  "#########",
  "#S..#...#",
  "#.#.#.#.#",
  "#.#...#.#",
  "#.#####.#",
  "#......G#",
  "#########",
];

export const lesson = {
  id: "grid-bfs",
  title: "网格 BFS 最短路",
  learningTarget: "观察队列如何保持距离层次，并用路径长度验证第一次抵达即为最短。",
  runtime: "python",
  entry: "bfs.py",
  entryMode: "fixed",
  files: [{
    id: "bfs",
    filename: "bfs.py",
    label: "bfs.py",
    language: "python",
    sourceUrl: "./lesson/bfs.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 23,
  limits: {
    timeoutMs: 5000, maxFrames: 1600, maxPayloadBytes: 4_000_000,
    maxOutputChars: 40_000, maxSourceChars: 120_000,
    maxItems: 180, maxDepth: 8, maxString: 900,
  },
  initialStep: {
    sequence: 0,
    source: { file: "bfs.py", line: 17, column: 1 },
    kind: "grid",
    state: {
      grid: initialGrid,
      start: [1, 1], goal: [5, 7],
      visited: [[1, 1]], queue: [[1, 1]], current: null, candidate: null,
      distances: { "1-1": 0 }, path: [], complete: false,
    },
    focus: [{ id: "1-1", role: "frontier" }],
    changes: [],
    metrics: { "已发现": 1, "队列长度": 1, "当前距离": 0 },
    annotation: "从 S 开始，让波前按距离逐层扩散。",
  },
};

export default lesson;
```
  </file>
  <file path="samples/code/grid-bfs/lesson/tests.py">
```python
from collections import deque


def _shortest_length(grid, start, goal):
    queue = deque([(start, 0)])
    seen = {start}
    while queue:
        (row, column), distance = queue.popleft()
        if (row, column) == goal:
            return distance
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            candidate = (row + dr, column + dc)
            r, c = candidate
            if grid[r][c] != "#" and candidate not in seen:
                seen.add(candidate)
                queue.append((candidate, distance + 1))
    return None


def run_tests(namespace):
    grid = namespace.get("grid", [])
    start = namespace.get("start")
    goal = namespace.get("goal")
    path = namespace.get("result", [])
    connected = all(
        abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1
        for a, b in zip(path, path[1:])
    )
    open_cells = all(grid[row][column] != "#" for row, column in path) if path else False
    shortest = _shortest_length(grid, start, goal)
    return [
        {
            "name": "路径连接起点与终点",
            "passed": bool(path) and path[0] == start and path[-1] == goal,
            "message": "结果路径必须从 S 开始并在 G 结束。",
            "expected": [start, "…", goal],
            "observed": path,
        },
        {
            "name": "每一步只走到相邻开放格",
            "passed": connected and open_cells,
            "message": "路径不能穿墙，也不能跨越格子。",
        },
        {
            "name": "BFS 给出最短步数",
            "passed": shortest is not None and len(path) - 1 == shortest,
            "message": "第一次抵达目标时的层数就是无权图最短距离。",
            "expected": shortest,
            "observed": len(path) - 1 if path else None,
        },
    ]
```
  </file>
  <file path="samples/code/grid-bfs/lesson/trace.py">
```python
def _coord(value):
    if isinstance(value, tuple) and len(value) == 2:
        return [value[0], value[1]]
    return None


def _cell_id(value):
    return f"{value[0]}-{value[1]}"


def _path_to(node, parent):
    if node not in parent:
        return []
    path = []
    cursor = node
    while cursor is not None and len(path) <= len(parent):
        path.append(cursor)
        cursor = parent.get(cursor)
    path.reverse()
    return path


def _distances(parent):
    values = {}
    for node in parent:
        path = _path_to(node, parent)
        values[_cell_id(node)] = max(0, len(path) - 1)
    return values


def _step(grid, start, goal, queue, visited, parent, current, candidate, path, previous_state, complete=False):
    previous_ids = {
        f"{row}-{column}"
        for row, column in (previous_state or {}).get("visited", [])
    }
    additions = [node for node in sorted(visited) if _cell_id(node) not in previous_ids]
    focus = []
    if current is not None:
        focus.append({"id": _cell_id(current), "role": "current"})
    if candidate is not None:
        focus.append({"id": _cell_id(candidate), "role": "candidate"})
    focus.extend({"id": _cell_id(node), "role": "frontier"} for node in queue)

    visible_path = list(path or _path_to(current, parent))
    if complete and visible_path:
        annotation = f"目标首次出队；沿 parent 回溯得到 {len(visible_path) - 1} 步最短路。"
    elif additions:
        annotation = f"首次发现格点 {additions[-1]}，记录前驱并压入队尾。"
    elif current is not None:
        annotation = f"展开 {current}；队列中的格点属于当前或下一距离层。"
    else:
        annotation = "从 S 开始，让波前按距离逐层扩散。"

    return {
        "kind": "grid",
        "state": {
            "grid": list(grid),
            "start": _coord(start),
            "goal": _coord(goal),
            "visited": [_coord(node) for node in sorted(visited)],
            "queue": [_coord(node) for node in queue],
            "current": _coord(current),
            "candidate": _coord(candidate),
            "distances": _distances(parent),
            "path": [_coord(node) for node in visible_path],
            "complete": complete,
        },
        "focus": focus,
        "changes": [{"id": _cell_id(node), "role": "discover"} for node in additions],
        "metrics": {
            "已发现": len(visited),
            "队列长度": len(queue),
            "当前距离": max(0, len(_path_to(current, parent)) - 1) if current is not None else 0,
        },
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    values = frame.f_globals
    grid = values.get("grid")
    queue = values.get("queue")
    visited = values.get("visited")
    parent = values.get("parent")
    if not isinstance(grid, list) or queue is None or not isinstance(visited, set) or not isinstance(parent, dict):
        return None
    return _step(
        grid,
        values.get("start"),
        values.get("goal"),
        list(queue),
        set(visited),
        dict(parent),
        values.get("current"),
        values.get("candidate"),
        values.get("path", []),
        previous_state,
    )


def finalize(namespace, previous_state):
    return _step(
        namespace.get("grid", []),
        namespace.get("start"),
        namespace.get("goal"),
        list(namespace.get("queue", [])),
        set(namespace.get("visited", set())),
        dict(namespace.get("parent", {})),
        namespace.get("current"),
        namespace.get("candidate"),
        namespace.get("path", []),
        previous_state,
        complete=True,
    )
```
  </file>
  <file path="samples/code/grid-bfs/lesson/view/index.html">
```html
<main class="grid-study">
  <header class="map-heading">
    <p>WAVEFRONT / UNIT EDGE COST</p>
    <strong id="distanceReadout">d = 0</strong>
  </header>

  <svg id="gridCanvas" class="grid-canvas" viewBox="0 0 900 700" role="img" aria-labelledby="gridTitle gridDescription">
    <title id="gridTitle">网格广度优先搜索</title>
    <desc id="gridDescription">从起点逐层扩散的搜索波前。</desc>
    <defs>
      <pattern id="wallHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="12" height="12" fill="#0a0e14"></rect>
        <line x1="0" y1="0" x2="0" y2="12" stroke="#333c47" stroke-width="3"></line>
      </pattern>
    </defs>
    <g id="cellLayer"></g>
    <polyline id="pathLine" class="path-line" points=""></polyline>
    <g id="sonar" class="sonar" hidden>
      <circle r="24"></circle><circle r="39"></circle><circle r="55"></circle>
    </g>
  </svg>

  <section class="queue-line" aria-label="BFS 队列">
    <span class="queue-label">QUEUE / HEAD</span>
    <ol id="queueItems" class="queue-items"></ol>
  </section>

  <p id="viewAnnotation" class="annotation" aria-live="polite">从 S 开始，让波前按距离逐层扩散。</p>
</main>
```
  </file>
  <file path="samples/code/grid-bfs/lesson/view/render.js">
```javascript
const SVG_NS = "http://www.w3.org/2000/svg";
const cells = new Map();
const queueRows = new Map();

const cellLayer = document.querySelector("#cellLayer");
const pathLine = document.querySelector("#pathLine");
const sonar = document.querySelector("#sonar");
const queueItems = document.querySelector("#queueItems");
const annotation = document.querySelector("#viewAnnotation");
const distanceReadout = document.querySelector("#distanceReadout");
const gridDescription = document.querySelector("#gridDescription");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function cellId(row, column) {
  return `${row}-${column}`;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function ensureCell(id) {
  if (cells.has(id)) return cells.get(id);
  const root = svgElement("g", { class: "grid-cell" });
  root.dataset.entityId = id;
  const base = svgElement("rect", { class: "cell-base", x: "6", y: "6", width: "88", height: "88", rx: "3" });
  const contour = svgElement("circle", { class: "cell-contour", cx: "50", cy: "50", r: "25" });
  const distance = svgElement("text", { class: "cell-distance", x: "50", y: "56" });
  const marker = svgElement("text", { class: "cell-marker", x: "50", y: "57" });
  root.append(base, contour, distance, marker);
  cellLayer.append(root);
  const record = { root, distance, marker };
  cells.set(id, record);
  return record;
}

function queueKey(value, index) {
  return `${index}:${value[0]}-${value[1]}`;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const grid = list(state.grid);
  const visited = new Set(list(state.visited).map(([row, column]) => cellId(row, column)));
  const path = list(state.path);
  const pathIds = new Set(path.map(([row, column]) => cellId(row, column)));
  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const active = new Set();
  const distances = state.distances || {};

  grid.forEach((rowValue, row) => {
    Array.from(String(rowValue)).forEach((value, column) => {
      const id = cellId(row, column);
      active.add(id);
      const record = ensureCell(id);
      record.root.setAttribute("transform", `translate(${column * 100} ${row * 100})`);
      record.root.dataset.type = value === "#" ? "wall" : "open";
      record.root.dataset.visited = String(visited.has(id));
      record.root.dataset.changed = String(changed.has(id));
      record.root.dataset.onPath = String(pathIds.has(id));
      if (focus.has(id)) record.root.dataset.focus = focus.get(id);
      else delete record.root.dataset.focus;
      record.marker.textContent = value === "S" || value === "G" ? value : "";
      record.distance.textContent =
        value !== "#" && value !== "S" && value !== "G" && id in distances
          ? String(distances[id]) : "";
      const status = value === "#" ? "墙"
        : pathIds.has(id) ? "最短路径"
        : visited.has(id) ? `已发现，距离 ${distances[id]}` : "未发现";
      const cellRole = value === "S" ? "起点" : value === "G" ? "终点" : status;
      record.root.setAttribute("aria-label", `第 ${row} 行第 ${column} 列，${cellRole}`);
    });
  });
  for (const [id, record] of cells) {
    if (active.has(id)) continue;
    record.root.remove();
    cells.delete(id);
  }

  pathLine.setAttribute("points", path.map(([row, column]) => `${column * 100 + 50},${row * 100 + 50}`).join(" "));

  const current = list(state.current);
  if (current.length === 2) {
    sonar.hidden = false;
    sonar.setAttribute("transform", `translate(${current[1] * 100 + 50} ${current[0] * 100 + 50})`);
  } else {
    sonar.hidden = true;
  }

  const queue = list(state.queue);
  const activeQueue = new Set();
  queue.slice(0, 10).forEach((value, index) => {
    const key = queueKey(value, index);
    activeQueue.add(key);
    let item = queueRows.get(key);
    if (!item) {
      item = document.createElement("li");
      queueRows.set(key, item);
      queueItems.append(item);
    }
    item.textContent = `(${value[0]},${value[1]})`;
  });
  for (const [key, item] of queueRows) {
    if (activeQueue.has(key)) continue;
    item.remove();
    queueRows.delete(key);
  }

  const currentDistance = current.length === 2 ? distances[cellId(current[0], current[1])] ?? 0 : 0;
  distanceReadout.textContent = state.complete
    ? `SHORTEST = ${Math.max(0, path.length - 1)}` : `d = ${currentDistance}`;
  annotation.textContent = step?.annotation || "观察搜索波前如何逐层扩散。";
  const pathSummary = path.length ? `当前路径长 ${path.length - 1} 步` : "尚未形成完整路径";
  gridDescription.textContent =
    `已经发现 ${visited.size} 个开放格；队列中有 ${queue.length} 个格点；${pathSummary}。`;
};
```
  </file>
  <file path="samples/code/tree-traversal/lesson/inorder.py">
```python
class Node:
    def __init__(self, value, left=None, right=None):
        self.value = value
        self.left = left
        self.right = right


root = Node(
    4,
    Node(2, Node(1), Node(3)),
    Node(6, Node(5), Node(7)),
)
visited = []


def inorder(node):
    if node is None:
        return
    inorder(node.left)
    visited.append(node.value)
    inorder(node.right)


inorder(root)
result = visited.copy()
```
  </file>
  <file path="samples/code/tree-traversal/lesson/lesson.js">
```javascript
const nodeRows = [
  ["4", 4, 400, 82], ["2", 2, 230, 214], ["6", 6, 570, 214],
  ["1", 1, 130, 360], ["3", 3, 330, 360], ["5", 5, 470, 360], ["7", 7, 670, 360],
];

const initialStep = {
  sequence: 0,
  source: { file: "inorder.py", line: 15, column: 1 },
  kind: "tree",
  state: {
    nodes: nodeRows.map(([id, label, x, y]) => ({ id, label, x, y, status: "pending" })),
    edges: [["4", "2"], ["4", "6"], ["2", "1"], ["2", "3"], ["6", "5"], ["6", "7"]]
      .map(([source, target]) => ({ id: `${source}--${target}`, source, target })),
    visited: [],
    stack: ["4"],
    complete: false,
  },
  focus: [{ id: "4", role: "current" }],
  changes: [],
  metrics: { "已访问": 0, "递归深度": 1 },
  annotation: "从根节点 4 开始，先沿左边下降。",
};

export const lesson = {
  id: "tree-traversal",
  title: "BST 中序遍历",
  learningTarget: "沿递归调用栈观察左—根—右的访问次序，并验证 BST 中序遍历得到严格递增序列。",
  runtime: "python",
  entry: "inorder.py",
  files: [{
    id: "inorder",
    filename: "inorder.py",
    label: "inorder.py",
    language: "python",
    sourceUrl: "./lesson/inorder.py",
    editable: true,
  }],
  traceUrl: "./lesson/trace.py",
  testsUrl: "./lesson/tests.py",
  seed: 11,
  limits: {
    timeoutMs: 5000, maxFrames: 1200, maxPayloadBytes: 3_000_000,
    maxOutputChars: 40_000, maxSourceChars: 120_000,
    maxItems: 120, maxDepth: 8, maxString: 900,
  },
  initialStep,
};

export default lesson;
```
  </file>
  <file path="samples/code/tree-traversal/lesson/tests.py">
```python
def _is_bst(node, low=float("-inf"), high=float("inf")):
    if node is None:
        return True
    return (
        low < node.value < high
        and _is_bst(node.left, low, node.value)
        and _is_bst(node.right, node.value, high)
    )


def run_tests(namespace):
    observed = namespace.get("result")
    root = namespace.get("root")
    expected = [1, 2, 3, 4, 5, 6, 7]
    return [
        {
            "name": "中序结果严格递增",
            "passed": observed == expected,
            "message": "BST 的中序遍历应按键值升序访问。",
            "expected": expected,
            "observed": observed,
        },
        {
            "name": "遍历没有改变树结构",
            "passed": _is_bst(root),
            "message": "只读取节点，不应改写左右子树。",
        },
        {
            "name": "每个节点恰好访问一次",
            "passed": len(observed or []) == len(set(observed or [])) == 7,
            "message": "重复进入递归帧不能重复写入结果。",
        },
    ]
```
  </file>
  <file path="samples/code/tree-traversal/lesson/trace.py">
```python
POSITIONS = {
    "4": (400, 82),
    "2": (230, 214),
    "6": (570, 214),
    "1": (130, 360),
    "3": (330, 360),
    "5": (470, 360),
    "7": (670, 360),
}


def _stack(frame):
    values = []
    current = frame
    while current is not None:
        if current.f_code.co_name == "inorder" and current.f_code.co_filename.endswith("inorder.py"):
            node = current.f_locals.get("node")
            if node is not None and hasattr(node, "value"):
                values.append(str(node.value))
        current = current.f_back
    values.reverse()
    return values


def _tree(root, visited):
    nodes = []
    edges = []

    def walk(node):
        if node is None:
            return
        node_id = str(node.value)
        x, y = POSITIONS.get(node_id, (400, 240))
        nodes.append({
            "id": node_id,
            "label": node.value,
            "status": "visited" if node.value in visited else "pending",
            "x": x,
            "y": y,
        })
        for child, side in ((node.left, "left"), (node.right, "right")):
            if child is None:
                continue
            child_id = str(child.value)
            edges.append({
                "id": f"{node_id}--{child_id}",
                "source": node_id,
                "target": child_id,
                "side": side,
            })
            walk(child)

    walk(root)
    return nodes, edges


def _step(root, visited, stack, previous_state, complete=False):
    nodes, edges = _tree(root, visited)
    previous = list((previous_state or {}).get("visited", []))
    additions = [value for value in visited if value not in previous]
    focus = []
    if stack:
        focus.append({"id": stack[-1], "role": "current"})
    focus.extend({"id": str(value), "role": "visit"} for value in additions)
    if complete:
        annotation = "遍历完成；输出顺序正好是 BST 的升序键值。"
    elif additions:
        annotation = f"左子树已经返回，将节点 {additions[-1]} 写入访问序列。"
    elif stack:
        annotation = f"递归帧停在节点 {stack[-1]}，继续遵循左—根—右。"
    else:
        annotation = "从根节点开始，先沿左边下降。"
    return {
        "kind": "tree",
        "state": {
            "nodes": nodes,
            "edges": edges,
            "visited": list(visited),
            "stack": list(stack),
            "complete": complete,
        },
        "focus": focus,
        "changes": [{"id": str(value), "role": "visit"} for value in additions],
        "metrics": {"已访问": len(visited), "递归深度": len(stack)},
        "annotation": annotation,
    }


def capture(frame, event, previous_state):
    root = frame.f_globals.get("root")
    visited = frame.f_globals.get("visited")
    if root is None or not isinstance(visited, list):
        return None
    return _step(root, list(visited), _stack(frame), previous_state)


def finalize(namespace, previous_state):
    root = namespace.get("root")
    visited = list(namespace.get("visited", []))
    return _step(root, visited, [], previous_state, complete=True)
```
  </file>
  <file path="samples/code/tree-traversal/lesson/view/index.html">
```html
<main class="tree-study">
  <p class="eyebrow" aria-hidden="true">INORDER / LEFT · ROOT · RIGHT</p>

  <svg id="treeCanvas" class="tree-canvas" viewBox="0 0 800 455" role="img" aria-labelledby="treeTitle treeDescription">
    <title id="treeTitle">二叉搜索树中序遍历状态</title>
    <desc id="treeDescription">七个树节点、递归焦点和已经访问的节点顺序。</desc>
    <g id="edgeLayer" class="edge-layer"></g>
    <path id="visitBeam" class="visit-beam" d=""></path>
    <g id="nodeLayer" class="node-layer"></g>
  </svg>

  <section class="visit-register" aria-label="中序访问序列">
    <div class="register-label">
      <span>VISIT ORDER</span>
      <strong id="visitCount">00 / 07</strong>
    </div>
    <ol id="visitOrder" class="visit-order"></ol>
  </section>

  <div class="evidence-line">
    <p id="viewAnnotation" class="annotation" aria-live="polite">从根节点开始，先沿左边下降。</p>
    <p id="stackReadout" class="stack-readout">STACK · 4</p>
  </div>
</main>
```
  </file>
  <file path="samples/code/tree-traversal/lesson/view/render.js">
```javascript
const SVG_NS = "http://www.w3.org/2000/svg";
const nodes = new Map();
const edges = new Map();
const orderItems = new Map();

const nodeLayer = document.querySelector("#nodeLayer");
const edgeLayer = document.querySelector("#edgeLayer");
const visitBeam = document.querySelector("#visitBeam");
const visitOrder = document.querySelector("#visitOrder");
const visitCount = document.querySelector("#visitCount");
const annotation = document.querySelector("#viewAnnotation");
const stackReadout = document.querySelector("#stackReadout");
const treeDescription = document.querySelector("#treeDescription");

function list(value) {
  return Array.isArray(value) ? value : [];
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function ensureNode(id) {
  if (nodes.has(id)) return nodes.get(id);
  const root = svgElement("g", { class: "tree-node" });
  root.dataset.entityId = id;
  const halo = svgElement("circle", { class: "node-halo", r: "34" });
  const ring = svgElement("circle", { class: "node-ring", r: "27" });
  const core = svgElement("circle", { class: "node-core", r: "20" });
  const value = svgElement("text", { class: "node-value", y: "5" });
  const index = svgElement("text", { class: "node-index", y: "48" });
  root.append(halo, ring, core, value, index);
  nodeLayer.append(root);
  const record = { root, value, index };
  nodes.set(id, record);
  return record;
}

function ensureEdge(id) {
  if (edges.has(id)) return edges.get(id);
  const line = svgElement("line", { class: "tree-edge" });
  line.dataset.entityId = id;
  edgeLayer.append(line);
  edges.set(id, line);
  return line;
}

function ensureOrder(value, index) {
  const key = `${index}:${value}`;
  if (orderItems.has(key)) return orderItems.get(key);
  const item = document.createElement("li");
  item.dataset.order = String(index + 1).padStart(2, "0");
  item.textContent = String(value);
  visitOrder.append(item);
  orderItems.set(key, item);
  return item;
}

window.renderNotaleView = ({ step }) => {
  const state = step?.state || {};
  const nodeRows = list(state.nodes);
  const positions = new Map(nodeRows.map((node) => [String(node.id), node]));
  const focus = new Map(list(step?.focus).map((item) => [String(item.id), item.role || "focus"]));
  const changed = new Set(list(step?.changes).map((item) => String(item.id)));
  const activeNodes = new Set();

  for (const node of nodeRows) {
    const id = String(node.id);
    activeNodes.add(id);
    const record = ensureNode(id);
    record.root.setAttribute("transform", `translate(${Number(node.x) || 0} ${Number(node.y) || 0})`);
    record.root.dataset.status = node.status || "pending";
    record.root.dataset.changed = String(changed.has(id));
    if (focus.has(id)) record.root.dataset.focus = focus.get(id);
    else delete record.root.dataset.focus;
    record.value.textContent = String(node.label ?? id);
    const order = list(state.visited).findIndex((value) => String(value) === id);
    record.index.textContent = order >= 0 ? `VISIT ${String(order + 1).padStart(2, "0")}` : "WAIT";
    record.root.setAttribute("aria-label", `节点 ${node.label ?? id}，${order >= 0 ? `第 ${order + 1} 个访问` : "尚未访问"}`);
  }
  for (const [id, record] of nodes) {
    if (activeNodes.has(id)) continue;
    record.root.remove();
    nodes.delete(id);
  }

  const activeEdges = new Set();
  for (const edge of list(state.edges)) {
    const id = String(edge.id || `${edge.source}--${edge.target}`);
    const source = positions.get(String(edge.source));
    const target = positions.get(String(edge.target));
    if (!source || !target) continue;
    activeEdges.add(id);
    const line = ensureEdge(id);
    line.setAttribute("x1", source.x);
    line.setAttribute("y1", source.y);
    line.setAttribute("x2", target.x);
    line.setAttribute("y2", target.y);
    line.dataset.active = String(source.status === "visited" && target.status === "visited");
  }
  for (const [id, line] of edges) {
    if (activeEdges.has(id)) continue;
    line.remove();
    edges.delete(id);
  }

  const visited = list(state.visited);
  const points = visited
    .map((value) => positions.get(String(value)))
    .filter(Boolean)
    .map((node) => `${node.x},${node.y}`);
  visitBeam.setAttribute("d", points.length ? `M ${points.join(" L ")}` : "");

  const activeOrder = new Set();
  visited.forEach((value, index) => {
    const key = `${index}:${value}`;
    activeOrder.add(key);
    ensureOrder(value, index);
  });
  for (const [key, item] of orderItems) {
    if (activeOrder.has(key)) continue;
    item.remove();
    orderItems.delete(key);
  }

  visitCount.textContent = `${String(visited.length).padStart(2, "0")} / ${String(nodeRows.length).padStart(2, "0")}`;
  annotation.textContent = step?.annotation || "观察递归焦点和访问次序。";
  const stack = list(state.stack);
  stackReadout.textContent = `STACK · ${stack.length ? stack.join(" → ") : "EMPTY"}`;
  treeDescription.textContent = `已按中序访问 ${visited.length} 个节点；当前递归栈为 ${stack.join("，") || "空"}。`;
};
```
  </file>
</sample>
