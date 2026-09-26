import { test } from "node:test";
import assert from "node:assert/strict";
import { newChart } from "@notale/editor/browser";
import {
  applyChartTable,
  chartTableRows,
} from "../src/state/chart-table-draft";
test("table updates follow row identities and preserve unrelated remote changes", () => {
  const source = newChart("line"),
    before = structuredClone(source),
    base = chartTableRows(source, false),
    draft = structuredClone(base),
    column = source.columns[1].id;
  draft.reverse();
  draft[0][column] = 999;
  const target = source.rows.find((row) => row.id === draft[0].__id)!;
  const other = source.rows.find((row) => row.id !== target.id)!;
  other.values[column] = 777;
  const updated = applyChartTable(source, draft, base, false);
  assert.equal(
    updated.rows.find((row) => row.id === target.id)!.values[column],
    999,
  );
  assert.equal(
    updated.rows.find((row) => row.id === other.id)!.values[column],
    777,
  );
  assert.equal(
    target.values[column],
    before.rows.find((row) => row.id === target.id)!.values[column],
  );
  target.values[column] = 888;
  assert.throws(
    () => applyChartTable(source, draft, base, false),
    /单元格已变化/,
  );
});
test("deleted rows and missing steps preserve the draft instead of recreating stale data", () => {
  const source = newChart("line"),
    base = chartTableRows(source, false),
    draft = structuredClone(base);
  source.rows.shift();
  assert.throws(
    () => applyChartTable(source, draft, base, false),
    /数据行已删除/,
  );
  assert.throws(
    () => applyChartTable(newChart("line"), draft, base, false, "missing"),
    /步骤已删除/,
  );
});

test("indexed application includes newly added rows and retains subsequent cell edits", () => {
  const source = newChart("line"),
    base = chartTableRows(source, false),
    column = source.columns[1].id;
  const added = { ...base[0], __id: "new_row", [column]: 123 };
  const updated = applyChartTable(
    source,
    [...base, added, { ...added, [column]: 456 }],
    base,
    false,
  );
  assert.equal(updated.rows.filter((row) => row.id === "new_row").length, 1);
  assert.equal(
    updated.rows.find((row) => row.id === "new_row")!.values[column],
    456,
  );
  assert.equal(
    source.rows.some((row) => row.id === "new_row"),
    false,
  );
});
