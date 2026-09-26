import {
  chartAuthoringSchema,
  chartAtState,
  type ChartAuthoring,
} from "@notale/editor/browser";
import { chartNumber } from "./chart-table-import";
export type ChartTableRow = Record<string, unknown>;
export function chartTableRows(
  model: ChartAuthoring,
  edgeMode: boolean,
  stateId?: string,
): ChartTableRow[] {
  if (edgeMode)
    return model.edges.map((edge) => ({
      __id: edge.id,
      source: edge.source,
      target: edge.target,
      value: edge.value,
    }));
  return (stateId ? chartAtState(model, [stateId]).rows : model.rows).map(
    (row) => ({ __id: row.id, __parent: row.parentId ?? "", ...row.values }),
  );
}
/** Apply only edited cells by row identity, preserving unrelated concurrent changes. */
export function applyChartTable(
  source: ChartAuthoring,
  buffer: ChartTableRow[],
  baseline: ChartTableRow[],
  edgeMode: boolean,
  stateId?: string,
  uid: () => string = () => crypto.randomUUID(),
): ChartAuthoring {
  const next = structuredClone(source),
    bases = new Map(baseline.map((row) => [String(row.__id), row]));
  const state = stateId
    ? next.states.find((state) => state.id === stateId)
    : undefined;
  if (stateId && !edgeMode && !state)
    throw Error("图表步骤已删除，数据草稿已保留");
  const rows =
    stateId && !edgeMode
      ? structuredClone(chartAtState(next, [stateId]).rows)
      : next.rows;
  const rowIndex = new Map(rows.map((row) => [row.id, row])),
    edgeIndex = new Map(next.edges.map((edge) => [edge.id, edge]));
  function check(old: unknown, current: unknown, value: unknown) {
    if (current !== old && current !== value)
      throw Error("单元格已变化，数据草稿已保留，请核对后重试");
  }
  for (const [index, record] of buffer.entries()) {
    const id = String(record.__id ?? uid()),
      base = bases.get(id);
    if (edgeMode) {
      let edge = edgeIndex.get(id);
      if (!edge) {
        if (base) throw Error("连线已删除，数据草稿已保留");
        edge = {
          id,
          source: String(record.source ?? ""),
          target: String(record.target ?? ""),
          value: 0,
        };
        next.edges.push(edge);
        edgeIndex.set(id, edge);
      }
      for (const field of ["source", "target", "value"] as const) {
        if (base && record[field] === base[field]) continue;
        const value =
          field === "value"
            ? (chartNumber(record[field], index, "流量") ?? 0)
            : String(record[field] ?? "");
        if (base) check(base[field], edge[field], value);
        if (field === "value") edge.value = value as number;
        else edge[field] = value as string;
      }
    } else {
      let row = rowIndex.get(id);
      if (!row) {
        if (base) throw Error("数据行已删除，数据草稿已保留");
        row = { id, values: {} };
        rows.push(row);
        rowIndex.set(id, row);
      }
      for (const column of source.columns) {
        if (base && record[column.id] === base[column.id]) continue;
        const value =
          column.type === "number"
            ? chartNumber(record[column.id], index, column.name)
            : String(record[column.id] ?? "");
        if (base) check(base[column.id], row.values[column.id], value);
        row.values[column.id] = value;
      }
    }
  }
  if (stateId && !edgeMode) state!.rows = rows;
  next.origin = "manual";
  return chartAuthoringSchema.parse(next);
}
