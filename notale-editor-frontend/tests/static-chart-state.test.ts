import { test } from "node:test";
import assert from "node:assert/strict";
import {
  staticChartDraft,
  draftChart,
  importStaticChart,
  selectedStaticChart,
} from "../src/state/static-chart";
import {
  bindStaticChart,
  staticChartActions,
  staticChartState,
} from "../src/state/static-chart-dialog";
const data = {
  kind: "bar",
  title: "数据",
  labels: ["A", "B"],
  values: [10, 20],
};
test("static chart drafts preserve invalid input and import without mutating the original", () => {
  const draft = staticChartDraft(data);
  draft.values[0][0] = "";
  assert.throws(() => draftChart(draft), /第 1 个分类、第 1 个系列/);
  draft.values[0][0] = "1.25";
  assert.equal(draftChart(draft).series![0].values[0], 1.25);
  const imported = importStaticChart(draft, "分类\t一组\t二组\nC\t3\t4");
  assert.deepEqual(imported.chart.labels, ["C"]);
  assert.deepEqual(imported.values, [["3"], ["4"]]);
  assert.deepEqual(draft.chart.labels, ["A", "B"]);
  const pie = staticChartDraft({ ...data, kind: "pie" });
  pie.values[0] = ["-1", "2"];
  assert.throws(() => draftChart(pie), /不能为负数/);
  pie.values[0] = ["0", "0"];
  assert.throws(() => draftChart(pie), /大于零/);
  pie.values[0] = ["1", "2"];
  const multi = {
    ...imported,
    chart: { ...imported.chart, kind: "pie" as const },
  };
  assert.throws(() => draftChart(multi), /只能显示一个系列/);
  assert.equal(multi.values.length, 2);
  assert.throws(
    () => importStaticChart(pie, "分类\t一组\t二组\nC\t3\t4"),
    /只能显示一个系列/,
  );
  const grouped = importStaticChart(
    draft,
    "分类\t数量\nA\t1,234.5\nB\t-12,000",
  );
  assert.deepEqual(grouped.values, [["1234.5", "-12000"]]);
  const csv = importStaticChart(draft, '分类,数量\nA,"1,234"');
  assert.deepEqual(csv.values, [["1234"]]);
  assert.throws(
    () => importStaticChart(draft, "分类\t数量\nA\t1,23"),
    /每组三位/,
  );
  assert.deepEqual(draft.chart.labels, ["A", "B"]);
  assert.equal(
    selectedStaticChart(
      [{ id: "a", parent: "a", locked: false, attributes: {} }],
      ["a"],
    ),
    undefined,
  );
});
test("static chart saves reject changed sources and retain the editing session", async () => {
  const item = {
    id: "chart",
    locked: false,
    attributes: { "data-notale-chart": JSON.stringify(data) },
  };
  let commands: any[] = [];
  const binding = bindStaticChart({
    documentId: () => "doc",
    slideId: () => "page",
    selection: () => ["chart"],
    objects: () => [item],
    commands: async (values) => {
      commands = values;
    },
  });
  binding.render();
  staticChartActions.open();
  const editing = staticChartState.getSnapshot().editing!;
  item.attributes["data-notale-chart"] = JSON.stringify({
    ...data,
    title: "remote",
  });
  await assert.rejects(
    staticChartActions.save(editing, editing.draft),
    /已变化/,
  );
  assert.equal(staticChartState.getSnapshot().editing, editing);
  assert.equal(commands.length, 0);
  staticChartActions.close();
  staticChartActions.open();
  const latest = staticChartState.getSnapshot().editing!;
  await staticChartActions.save(latest, latest.draft);
  assert.equal(commands.length, 0);
  staticChartActions.open();
  const changed = staticChartState.getSnapshot().editing!;
  const draft = structuredClone(changed.draft);
  draft.chart.title = "Edited";
  await staticChartActions.save(changed, draft);
  assert.equal(commands[0].data.title, "Edited");
  assert.equal(staticChartState.getSnapshot().editing, undefined);
  binding.dispose();
});
