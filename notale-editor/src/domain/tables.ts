import { invariant, type Command } from './model.js';
import {
  type Element,
  elements,
  attr,
  setAttr,
  appendHtml,
  removeElement,
  serialize,
} from './html.js';
type Cell = { el: Element; row: number; column: number; rowSpan: number; colSpan: number };
function parentTable(el: Element) {
  let p = el.parentNode;
  while (p && 'tagName' in p) {
    if (p.tagName === 'table') return p;
    p = p.parentNode;
  }
  return undefined;
}
export function tableGrid(table: Element): {
  rows: Element[];
  cells: Cell[];
  grid: Cell[][];
  width: number;
} {
  invariant(table.tagName === 'table', 'NOT_A_TABLE', 'Choose a table object');
  const rows = elements(table).filter((el) => el.tagName === 'tr' && parentTable(el) === table),
    grid: Cell[][] = [],
    cells: Cell[] = [];
  invariant(rows.length <= 500, 'TABLE_SIZE', 'Table exceeds 500 rows');
  for (let r = 0; r < rows.length; r++) {
    grid[r] ??= [];
    let c = 0;
    const groupEnd = rows.findIndex(
        (row, index) => index > r && row.parentNode !== rows[r].parentNode,
      ),
      end = groupEnd < 0 ? rows.length : groupEnd;
    for (const el of rows[r].childNodes.filter(
      (n): n is Element => 'tagName' in n && ['td', 'th'].includes(n.tagName),
    )) {
      while (grid[r][c]) c++;
      const declared = Number(attr(el, 'rowspan') ?? 1),
        colSpan = Number(attr(el, 'colspan') ?? 1),
        rowSpan = declared === 0 ? end - r : Math.min(declared, end - r);
      invariant(
        Number.isInteger(rowSpan) &&
          rowSpan > 0 &&
          Number.isInteger(colSpan) &&
          colSpan > 0 &&
          colSpan <= 200 &&
          c + colSpan <= 200,
        'INVALID_SPAN',
        'Table span is invalid or too large',
      );
      const cell = { el, row: r, column: c, rowSpan, colSpan };
      cells.push(cell);
      for (let y = r; y < r + rowSpan; y++) {
        grid[y] ??= [];
        for (let x = c; x < c + colSpan; x++) {
          invariant(!grid[y][x], 'OVERLAPPING_CELLS', 'Table cells overlap');
          grid[y][x] = cell;
        }
      }
      c += colSpan;
    }
  }
  return { rows, cells, grid, width: Math.max(0, ...grid.map((r) => r.length)) };
}
function span(el: Element, name: 'rowspan' | 'colspan', value: number) {
  setAttr(el, name, value === 1 ? null : String(value));
}
function blank(row: Element, template?: Element, before?: Element) {
  const el = appendHtml(
    row,
    `<${template?.tagName === 'th' ? 'th' : 'td'}></${template?.tagName === 'th' ? 'th' : 'td'}>`,
    before ? row.childNodes.indexOf(before) : undefined,
  ).find((n) => 'tagName' in n) as Element;
  if (template)
    for (const name of ['class', 'style']) {
      const value = attr(template, name);
      if (value) setAttr(el, name, value);
    }
  return el;
}
type Edit = Extract<Command, { type: 'table.edit' }>;
export function editTable(table: Element, command: Edit) {
  const { rows, cells, grid, width } = tableGrid(table),
    r = command.row,
    c = command.column;
  invariant(rows.length && width, 'EMPTY_TABLE', 'Table has no cells');
  if (command.action === 'insert-row') {
    invariant(r <= rows.length, 'TABLE_INDEX', 'Row index is out of range');
    const anchor = rows[Math.min(r, rows.length - 1)],
      parent = anchor.parentNode! as Element;
    const row = appendHtml(
      parent,
      '<tr></tr>',
      parent.childNodes.indexOf(anchor) + (r === rows.length ? 1 : 0),
    ).find((n) => 'tagName' in n) as Element;
    const expanded = new Set<Cell>();
    for (let x = 0; x < width; x++) {
      const crossing = grid[r]?.[x];
      if (crossing && crossing.row < r && rows[crossing.row].parentNode === parent) {
        if (!expanded.has(crossing)) {
          span(crossing.el, 'rowspan', crossing.rowSpan + 1);
          expanded.add(crossing);
        }
        continue;
      }
      blank(row, grid[Math.max(0, r - 1)]?.[x]?.el);
    }
  } else if (command.action === 'delete-row') {
    invariant(r < rows.length && rows.length > 1, 'TABLE_INDEX', 'Cannot delete this row');
    for (const cell of cells) {
      if (cell.row < r && cell.row + cell.rowSpan > r) span(cell.el, 'rowspan', cell.rowSpan - 1);
      else if (cell.row === r && cell.rowSpan > 1) {
        removeElement(cell.el);
        const next = rows[r + 1],
          before = cells.find((n) => n.row === r + 1 && n.column > cell.column);
        cell.el.parentNode = next;
        next.childNodes.splice(
          before ? next.childNodes.indexOf(before.el) : next.childNodes.length,
          0,
          cell.el,
        );
        span(cell.el, 'rowspan', cell.rowSpan - 1);
      }
    }
    removeElement(rows[r]);
  } else if (command.action === 'insert-column') {
    invariant(c <= width, 'TABLE_INDEX', 'Column index is out of range');
    const expanded = new Set<Cell>();
    for (let y = 0; y < rows.length; y++) {
      const crossing = grid[y][c];
      if (crossing && crossing.column < c) {
        if (!expanded.has(crossing)) {
          span(crossing.el, 'colspan', crossing.colSpan + 1);
          expanded.add(crossing);
        }
        continue;
      }
      const before = cells.find((cell) => cell.row === y && cell.column >= c);
      blank(rows[y], grid[y][Math.max(0, c - 1)]?.el, before?.el);
    }
  } else if (command.action === 'delete-column') {
    invariant(c < width && width > 1, 'TABLE_INDEX', 'Cannot delete this column');
    for (const cell of cells)
      if (cell.column <= c && cell.column + cell.colSpan > c) {
        if (cell.colSpan > 1) span(cell.el, 'colspan', cell.colSpan - 1);
        else removeElement(cell.el);
      }
  } else if (command.action === 'merge') {
    const bottom = r + command.rowSpan,
      right = c + command.colSpan;
    invariant(
      bottom <= rows.length && right <= width && rows[r].parentNode === rows[bottom - 1].parentNode,
      'TABLE_RANGE',
      'Merge must be inside one table row group',
    );
    const selected = new Set<Cell>();
    for (let y = r; y < bottom; y++)
      for (let x = c; x < right; x++) {
        const cell = grid[y]?.[x];
        invariant(
          cell &&
            cell.row >= r &&
            cell.column >= c &&
            cell.row + cell.rowSpan <= bottom &&
            cell.column + cell.colSpan <= right,
          'PARTIAL_MERGE',
          'Selection cuts an existing merged cell',
        );
        selected.add(cell);
      }
    const first = grid[r][c];
    for (const cell of selected)
      if (cell !== first) {
        const html = serialize(cell.el);
        if (html) appendHtml(first.el, '<br>' + html, undefined, false);
        removeElement(cell.el);
      }
    span(first.el, 'rowspan', command.rowSpan);
    span(first.el, 'colspan', command.colSpan);
  } else {
    const cell = grid[r]?.[c];
    invariant(cell, 'TABLE_INDEX', 'Cell does not exist');
    for (let y = cell.row; y < cell.row + cell.rowSpan; y++)
      for (let x = cell.column; x < cell.column + cell.colSpan; x++) {
        if (y === cell.row && x === cell.column) continue;
        const before = cells.find((n) => n.row === y && n.column > x);
        blank(rows[y], cell.el, before?.el);
      }
    span(cell.el, 'rowspan', 1);
    span(cell.el, 'colspan', 1);
  }
  tableGrid(table);
}
