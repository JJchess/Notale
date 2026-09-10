import type { Command } from "@notale/editor/browser";
type Item = {
  id: string;
  tag: string;
  parent?: string;
  html: string;
  locked: boolean;
};
export function createTableInspector(context: {
  objects: () => Item[];
  selection: () => string[];
  select: (id: string) => void;
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (e: unknown) => void;
}) {
  const panel = document.createElement("fieldset");
  panel.id = "visual-table-panel";
  panel.innerHTML =
    '<legend>表格</legend><p>选择单元格；按住 Shift 点击另一格可选中矩形区域。</p><div id="table-cell-grid" role="group" aria-label="表格单元格"></div><label>单元格文字<textarea id="table-cell-text" rows="3"></textarea></label><button id="save-table-cell">保存单元格</button><div class="inline" id="visual-table-actions"></div><div id="table-range-actions"><button id="merge-table-range">合并选区</button><label>底色<input id="table-range-color" type="color" value="#eee7ff"></label><button id="apply-table-color">应用底色</button><label>对齐<select id="table-range-align"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label><button id="apply-table-align">应用对齐</button><label>文字颜色<input id="table-text-color" type="color" value="#30253e"></label><button id="apply-table-text-color">应用文字颜色</button><label>字号<input id="table-font-size" type="number" min="1" max="512" placeholder="清空以沿用原稿"></label><button id="apply-table-font-size">应用字号</button><label>边框范围<select id="table-border-mode"><option value="all">所有边框</option><option value="outer">选区外框</option><option value="none">无边框</option></select></label><label>边框颜色<input id="table-border-color" type="color" value="#6638dc"></label><label>边框粗细<input id="table-border-width" type="number" min="0" max="30" step="0.5" value="1"></label><button id="apply-table-border">应用边框</button></div><p id="table-cell-status" role="status"></p>';
  document.getElementById("media-panel")!.after(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    panel.querySelector<T>("#" + id)!;
  let key = "",
    table: Item | undefined,
    chosen = "",
    rangeEnd = "",
    tableKey = "",
    busy = false;
  let cells: {
    id: string;
    row: number;
    column: number;
    rowSpan: number;
    colSpan: number;
    text: string;
    editable: boolean;
    group: number;
  }[] = [];
  for (const [action, label] of Object.entries({
    "insert-row": "在上方插入行",
    "delete-row": "删除所在行",
    "insert-column": "在左侧插入列",
    "delete-column": "删除所在列",
    unmerge: "拆分单元格",
  })) {
    const button = document.createElement("button");
    button.dataset.tableAction = action;
    button.textContent = label;
    button.onclick = () =>
      void run(async () => {
        const cell = cells.find((c) => c.id === chosen);
        if (!table || !cell) return;
        await context.commands([
          {
            type: "table.edit",
            slideId: context.slideId(),
            target: table.id,
            action: action as Extract<
              Command,
              { type: "table.edit" }
            >["action"],
            row: cell.row,
            column: cell.column,
            rowSpan: 1,
            colSpan: 1,
          },
        ]);
      });
    el("visual-table-actions").append(button);
  }
  function region() {
    const start = cells.find((cell) => cell.id === chosen),
      end = cells.find((cell) => cell.id === rangeEnd) ?? start;
    if (!start || !end)
      return {
        row: 0,
        column: 0,
        rowSpan: 1,
        colSpan: 1,
        picked: [],
        valid: false,
      };
    const row = Math.min(start.row, end.row),
      column = Math.min(start.column, end.column),
      bottom = Math.max(start.row + start.rowSpan, end.row + end.rowSpan),
      right = Math.max(start.column + start.colSpan, end.column + end.colSpan);
    const picked = cells.filter(
      (cell) =>
        cell.row < bottom &&
        cell.row + cell.rowSpan > row &&
        cell.column < right &&
        cell.column + cell.colSpan > column,
    );
    const valid =
      picked.every(
        (cell) =>
          cell.row >= row &&
          cell.row + cell.rowSpan <= bottom &&
          cell.column >= column &&
          cell.column + cell.colSpan <= right &&
          cell.group === start.group &&
          !context.objects().find((o) => o.id === cell.id)?.locked,
      ) &&
      picked.reduce((sum, cell) => sum + cell.rowSpan * cell.colSpan, 0) ===
        (bottom - row) * (right - column);
    return {
      row,
      column,
      rowSpan: bottom - row,
      colSpan: right - column,
      picked,
      valid,
    };
  }
  el("merge-table-range").onclick = () =>
    void run(async () => {
      const area = region();
      if (!table || !area.valid || area.picked.length < 2) return;
      await context.commands([
        {
          type: "table.edit",
          slideId: context.slideId(),
          target: table.id,
          action: "merge",
          row: area.row,
          column: area.column,
          rowSpan: area.rowSpan,
          colSpan: area.colSpan,
        },
      ]);
    });
  for (const [id, property, input] of [
    ["apply-table-color", "background-color", "table-range-color"],
    ["apply-table-align", "text-align", "table-range-align"],
    ["apply-table-text-color", "color", "table-text-color"],
  ])
    el(id).onclick = () =>
      void run(async () => {
        await context.commands(
          region().picked.map((cell) => ({
            type: "element.patch" as const,
            slideId: context.slideId(),
            target: cell.id,
            patch: { style: { [property]: el<HTMLInputElement>(input).value } },
          })),
        );
      });
  const formattingActions = ["apply-table-color", "apply-table-align", "apply-table-text-color", "apply-table-font-size", "apply-table-border"];
  el("apply-table-font-size").onclick = () => void run(async () => {
    const raw = el<HTMLInputElement>("table-font-size").value.trim(), size = Number(raw);
    if (raw && (!Number.isFinite(size) || size < 1 || size > 512)) throw new Error("字号应在 1 到 512 之间");
    await context.commands(region().picked.map(cell => ({ type: "element.patch", slideId: context.slideId(), target: cell.id, patch: { style: { 'font-size': raw ? `${size}px` : '' } } })));
  });
  el("apply-table-border").onclick = () => void run(async () => {
    const area = region(), mode = el<HTMLSelectElement>("table-border-mode").value,
      raw = el<HTMLInputElement>("table-border-width").value.trim(), width = Number(raw), color = el<HTMLInputElement>("table-border-color").value;
    if (mode !== 'none' && (!raw || !Number.isFinite(width) || width < 0 || width > 30)) throw new Error("边框粗细应在 0 到 30 之间");
    const commands: Command[] = area.picked.map(cell => {
      const sides = mode === 'outer' ? [
        ...(cell.row === area.row ? ['top'] : []),
        ...(cell.column === area.column ? ['left'] : []),
        ...(cell.row + cell.rowSpan === area.row + area.rowSpan ? ['bottom'] : []),
        ...(cell.column + cell.colSpan === area.column + area.colSpan ? ['right'] : []),
      ] : ['top', 'right', 'bottom', 'left'];
      const style: Record<string, string> = {};
      for (const side of sides) {
        style[`border-${side}-style`] = mode === 'none' ? 'none' : 'solid';
        if (mode !== 'none') { style[`border-${side}-width`] = `${width}px`; style[`border-${side}-color`] = color; }
      }
      return { type: 'element.patch', slideId: context.slideId(), target: cell.id, patch: { style } };
    });
    await context.commands(commands.filter(command => command.type === 'element.patch' && Object.keys(command.patch.style ?? {}).length));
  });
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    busy = true;
    panel.disabled = true;
    try {
      await action();
    } catch (error) {
      context.error(error);
    } finally {
      busy = false;
      render();
    }
  }
  el("save-table-cell").onclick = () =>
    void run(async () => {
      const cell = cells.find((c) => c.id === chosen);
      if (!cell?.editable) return;
      await context.commands([
        {
          type: "element.patch",
          slideId: context.slideId(),
          target: cell.id,
          patch: { text: el<HTMLTextAreaElement>("table-cell-text").value },
        },
      ]);
    });
  function render() {
    const objects = context.objects(),
      selected = context.selection();
    let object =
      selected.length === 1
        ? objects.find((o) => o.id === selected[0])
        : undefined;
    const selectedId = object?.id;
    while (object && object.tag !== "table")
      object = objects.find((o) => o.id === object?.parent);
    table = object;
    panel.hidden = !table;
    if (!table) return;
    panel.disabled =
      busy ||
      table.locked ||
      !!objects.find((o) => o.id === selectedId)?.locked;
    const identity = context.slideId() + table.id;
    if (identity !== tableKey) {
      tableKey = identity;
      rangeEnd = "";
    }
    const next = identity + table.html;
    if (next !== key) {
      key = next;
      const source = new DOMParser()
        .parseFromString(table.html, "text/html")
        .querySelector("table")!;
      cells = [];
      const occupied: string[][] = [];
      const rows = [...source.rows];
      rows.forEach((row, r) => {
        occupied[r] ??= [];
        let c = 0;
        const end = rows.findIndex(
          (later, i) => i > r && later.parentElement !== row.parentElement,
        );
        const groupEnd = end < 0 ? rows.length : end;
        for (const cell of row.cells) {
          while (occupied[r][c]) c++;
          const id = cell.getAttribute("data-notale-id")!;
          const rowSpan =
              cell.rowSpan === 0
                ? groupEnd - r
                : Math.min(cell.rowSpan, groupEnd - r),
            colSpan = cell.colSpan;
          cells.push({
            id,
            row: r,
            column: c,
            rowSpan,
            colSpan,
            text: cell.textContent ?? "",
            group: rows.findIndex(
              (other) => other.parentElement === row.parentElement,
            ),
            editable:
              cell.children.length === 0 &&
              !objects.find((o) => o.id === id)?.locked,
          });
          for (let y = r; y < r + rowSpan; y++) {
            occupied[y] ??= [];
            for (let x = c; x < c + colSpan; x++) occupied[y][x] = id;
          }
          c += colSpan;
        }
      });
      const grid = el("table-cell-grid");
      grid.replaceChildren();
      grid.style.gridTemplateColumns = `repeat(${Math.max(1, ...occupied.map((row) => row.length))}, minmax(85px, 1fr))`;
      for (const cell of cells) {
        const button = document.createElement("button");
        button.dataset.tableCell = cell.id;
        button.textContent = cell.text || "空白";
        button.setAttribute(
          "aria-label",
          `第 ${cell.row + 1} 行，第 ${cell.column + 1} 列：${cell.text || "空白"}`,
        );
        button.style.gridArea = `${cell.row + 1} / ${cell.column + 1} / span ${cell.rowSpan} / span ${cell.colSpan}`;
        button.onclick = (event) => {
          if (event.shiftKey && chosen) {
            rangeEnd = cell.id;
          } else {
            rangeEnd = "";
            chosen = cell.id;
            context.select(cell.id);
          }
          render();
        };
        grid.append(button);
      }
    }
    if (cells.some((c) => c.id === selectedId) && selectedId !== chosen) {
      chosen = selectedId!;
      rangeEnd = "";
    }
    if (rangeEnd && !cells.some((c) => c.id === rangeEnd)) rangeEnd = "";
    if (!cells.some((c) => c.id === chosen)) chosen = cells[0]?.id ?? "";
    const cell = cells.find((c) => c.id === chosen);
    if (!cell) return;
    for (const button of el("table-cell-grid").querySelectorAll<HTMLElement>(
      "[data-table-cell]",
    ))
      button.setAttribute(
        "aria-pressed",
        String(
          region().picked.some((cell) => cell.id === button.dataset.tableCell),
        ),
      );
    const input = el<HTMLTextAreaElement>("table-cell-text");
    const inputKey = key + chosen;
    if (input.dataset.key !== inputKey) {
      input.dataset.key = inputKey;
      input.value = cell.text;
    }
    const area = region();
    input.disabled = !cell.editable || area.picked.length > 1;
    el<HTMLButtonElement>("save-table-cell").disabled = input.disabled;
    el("table-cell-status").textContent =
      area.picked.length > 1
        ? `选中 ${area.picked.length} 个单元格`
        : cell.editable
          ? `第 ${cell.row + 1} 行 · 第 ${cell.column + 1} 列`
          : "此单元格包含格式、子对象或锁定内容，请在画布中选择具体内容编辑。";
    el<HTMLButtonElement>("merge-table-range").disabled =
      !area.valid || area.picked.length < 2;
    const locked = area.picked.some(
      (cell) => objects.find((o) => o.id === cell.id)?.locked,
    );
    for (const id of formattingActions)
      el<HTMLButtonElement>(id).disabled = locked || !area.picked.length;
    (
      panel.querySelector('[data-table-action="unmerge"]') as HTMLButtonElement
    ).disabled = cell.rowSpan === 1 && cell.colSpan === 1;
  }
  return { render };
}
