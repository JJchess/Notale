import type { ChartAuthoring } from "@notale/editor/browser";
import { applyChartTable, type ChartTableRow } from "./chart-table-draft";

/** Expand and validate a paste in isolation, then submit it as one chart edit. */
export function pasteChartTable(
  source: ChartAuthoring,
  buffer: ChartTableRow[],
  baseline: ChartTableRow[],
  cell: { row: number; column: number },
  pasted: string[][],
  stateId?: string,
  uid: () => string = () => crypto.randomUUID(),
): ChartAuthoring {
  const width = cell.column + Math.max(0, ...pasted.map((row) => row.length));
  if (
    !Number.isInteger(cell.row) ||
    !Number.isInteger(cell.column) ||
    cell.row < 0 ||
    cell.column < 0 ||
    cell.row > buffer.length
  )
    throw Error("请选择有效的起始单元格");
  if (cell.row + pasted.length > 20000 || width > 100)
    throw Error("最多支持 20,000 行、100 列");
  const candidate = structuredClone(source),
    rows = structuredClone(buffer);
  while (candidate.columns.length < width) {
    const id = uid(),
      name = `系列 ${candidate.series.length + 1}`;
    candidate.columns.push({ id, name, type: "number" });
    candidate.series.push({
      id,
      columnId: id,
      name,
      axis: "primary",
      style: {},
      points: {},
    });
  }
  for (let r = 0; r < pasted.length; r++) {
    const at = cell.row + r;
    rows[at] ??= { __id: uid() };
    for (let c = 0; c < pasted[r].length; c++)
      rows[at][candidate.columns[cell.column + c].id] = pasted[r][c];
  }
  return applyChartTable(candidate, rows, baseline, false, stateId, uid);
}
