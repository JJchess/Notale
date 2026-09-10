<sample id="code-core-bundle" category="code" variant="one">
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
</sample>
