import { test } from "node:test";
import assert from "node:assert/strict";
import { newChart } from "@notale/editor/browser";
import { chartTableRows } from "../src/state/chart-table-draft";
import { pasteChartTable } from "../src/state/chart-table-paste";

test("paste expands columns atomically and rejects invalid cells without changing source or drafts", () => {
  const source = newChart("line"),
    buffer = chartTableRows(source, false),
    baseline = structuredClone(buffer),
    before = structuredClone(source);
  const values: string[] = source.columns.map((column) =>
    column.type === "number" ? "123" : "New category",
  );
  values.push("invalid");
  assert.throws(
    () =>
      pasteChartTable(source, buffer, baseline, { row: 0, column: 0 }, [
        values,
      ]),
    /需要数字/,
  );
  assert.deepEqual(source, before);
  assert.deepEqual(buffer, baseline);
  values[values.length - 1] = "456";
  const result = pasteChartTable(
    source,
    buffer,
    baseline,
    { row: 0, column: 0 },
    [values],
  );
  assert.equal(result.columns.length, source.columns.length + 1);
  assert.equal(result.rows[0].values[result.columns.at(-1)!.id], 456);
  assert.deepEqual(source, before);
});
test("step paste keeps base rows and existing invalid drafts intact on rejection", () => {
  const source = newChart("line");
  source.states = [{ id: "step", name: "Step" }];
  const buffer = chartTableRows(source, false, "step"),
    baseline = structuredClone(buffer),
    column = source.columns[1].id;
  const updated = pasteChartTable(
    source,
    buffer,
    baseline,
    { row: 0, column: 1 },
    [["999"]],
    "step",
  );
  assert.equal(updated.rows[0].values[column], source.rows[0].values[column]);
  assert.equal(updated.states[0].rows![0].values[column], 999);
  buffer[1][column] = "invalid draft";
  const before = structuredClone(buffer);
  assert.throws(
    () =>
      pasteChartTable(
        source,
        buffer,
        baseline,
        { row: 0, column: 1 },
        [["42"]],
        "step",
      ),
    /需要数字/,
  );
  assert.deepEqual(buffer, before);
});
