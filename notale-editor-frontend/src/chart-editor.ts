import { parseChartSpreadsheet } from './chart-spreadsheet.js';
import { chartSvg, commitSchema, type Command } from "@notale/editor/browser";
type Chart = Extract<Command, { type: "chart.update" }>["data"];
type Item = {
  id: string;
  parent?: string;
  locked: boolean;
  attributes: Record<string, string>;
};
export function createChartEditor(context: {
  objects: () => Item[];
  selection: () => string[];
  key: () => string;
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (e: unknown) => void;
}) {
  const button = document.createElement("button");
  button.id = "open-chart-editor";
  button.textContent = "编辑图表数据";
  document.getElementById("selection-name")!.after(button);
  const convert=document.createElement('button');convert.id='convert-echarts';convert.textContent='转换为可编辑互动图表';button.after(convert);
  convert.onclick=()=>{const item=selected();if(item)void context.commands([{type:'native-chart.convert',slideId:context.slideId(),target:item.id}]).catch(context.error);};
  const dialog = document.createElement("dialog");
  dialog.id = "chart-editor-dialog";
  dialog.setAttribute("aria-labelledby", "chart-editor-title");
  dialog.innerHTML =
    '<header><h2 id="chart-editor-title">图表数据</h2><button id="close-chart-editor" aria-label="关闭图表编辑">×</button></header><div class="field-grid"><label>标题<input id="visual-chart-title"></label><label>图表类型<select id="visual-chart-kind"><option value="bar">柱状图</option><option value="line">折线图</option><option value="area">面积图</option><option value="pie">饼图</option><option value="doughnut">环形图</option></select></label></div><div id="visual-chart-preview" aria-label="图表预览"></div><details id="chart-paste-panel"><summary>粘贴表格数据</summary><p class="hint">支持 Excel / Sheets 复制的表格，或 CSV。第一行是系列名称，第一列是分类。应用会替换当前数据，保存前可预览。</p><textarea id="chart-paste-data" rows="4" aria-label="表格数据" placeholder="分类&#9;训练集&#9;验证集&#10;模型 A&#9;92&#9;85&#10;模型 B&#9;95&#9;89"></textarea><button id="chart-paste-apply">应用到图表预览</button><p id="chart-paste-status" role="status"></p></details><div id="chart-data-grid"></div><div class="inline"><button id="chart-add-row">添加分类</button><button id="chart-add-series">添加系列</button></div><p id="chart-editor-status" role="status"></p><footer><button id="save-chart-editor" class="primary">保存图表</button></footer>';
  document.body.append(dialog);
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    dialog.querySelector<T>("#" + id)!;
  let data: Chart,
    key = "",
    target = "",
    slideId = "",
    busy = false;
  function selected() {
    let item =
      context.selection().length === 1
        ? context.objects().find((o) => o.id === context.selection()[0])
        : undefined;
    while (item && !item.attributes["data-notale-chart"])
      item = context.objects().find((o) => o.id === item?.parent);
    return item;
  }
  function read() {
    data.title = el<HTMLInputElement>("visual-chart-title").value;
    data.kind = el<HTMLSelectElement>("visual-chart-kind")
      .value as Chart["kind"];
    for (const input of dialog.querySelectorAll<HTMLTextAreaElement>(
      "textarea[data-chart-label]",
    ))
      data.labels[Number(input.dataset.chartLabel)] = input.value;
    for (const input of dialog.querySelectorAll<HTMLTextAreaElement>(
      "textarea[data-series-name]",
    ))
      data.series![Number(input.dataset.seriesName)].name = input.value;
    for (const input of dialog.querySelectorAll<HTMLInputElement>(
      "input[data-chart-value]",
    )) {
      const [s, r] = input.dataset.chartValue!.split(":").map(Number);
      data.series![s].values[r] =
        input.value.trim() === "" ? NaN : Number(input.value);
    }
  }
  function preview() {
    try {
      read();
      el("visual-chart-preview").innerHTML = chartSvg(data);
      el("chart-editor-status").textContent = "";
      el<HTMLButtonElement>("save-chart-editor").disabled = busy;
    } catch {
      el("chart-editor-status").textContent =
        "请填写完整数值。饼图和环形图只支持一个非负系列，且总和需大于零。";
      el<HTMLButtonElement>("save-chart-editor").disabled = true;
    }
    el<HTMLButtonElement>("chart-add-series").disabled =
      data.series!.length >= 8 || ["pie", "doughnut"].includes(data.kind);
  }
  function grid() {
    const host = el("chart-data-grid");
    host.replaceChildren();
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    head.insertCell().textContent = "分类";
    data.series!.forEach((series, s) => {
      const cell = head.insertCell(),
        input = document.createElement("textarea");
      input.rows = series.name.includes("\n") ? 2 : 1;
      input.value = series.name;
      input.dataset.seriesName = String(s);
      input.setAttribute("aria-label", `系列 ${s + 1} 名称`);
      cell.append(input);
      const remove = document.createElement("button");
      remove.textContent = "删除系列";
      remove.dataset.removeSeries = String(s);
      remove.disabled = data.series!.length === 1;
      remove.onclick = () => {
        read();
        data.series!.splice(s, 1);
        grid();
      };
      cell.append(remove);
    });
    head.insertCell();
    const body = table.createTBody();
    data.labels.forEach((label, r) => {
      const row = body.insertRow(),
        input = document.createElement("textarea");
      input.rows = label.includes("\n") ? 2 : 1;
      input.value = label;
      input.dataset.chartLabel = String(r);
      input.setAttribute("aria-label", `分类 ${r + 1}`);
      row.insertCell().append(input);
      data.series!.forEach((series, s) => {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = String(series.values[r]);
        input.dataset.chartValue = `${s}:${r}`;
        input.setAttribute("aria-label", `分类 ${r + 1} 系列 ${s + 1} 数值`);
        row.insertCell().append(input);
      });
      const remove = document.createElement("button");
      remove.textContent = "删除分类";
      remove.dataset.removeCategory = String(r);
      remove.disabled = data.labels.length === 1;
      remove.onclick = () => {
        read();
        data.labels.splice(r, 1);
        for (const series of data.series!) series.values.splice(r, 1);
        grid();
      };
      row.insertCell().append(remove);
    });
    host.append(table);
    el<HTMLButtonElement>("chart-add-row").disabled = data.labels.length >= 100;
    preview();
  }
  button.onclick = () => {
    try {
      const item = selected();
      if (!item || item.locked) return;
      slideId = context.slideId();
      target = item.id;
      key = context.key();
      const parsed = commitSchema.parse({
        baseVersion: 1,
        mutationId: crypto.randomUUID(),
        commands: [
          {
            type: "chart.update",
            slideId,
            target,
            data: JSON.parse(item.attributes["data-notale-chart"]),
          },
        ],
      }).commands[0] as Extract<Command, { type: "chart.update" }>;
      data = structuredClone(parsed.data);
      data.series ??= [{ name: "系列 1", values: [...data.values] }];
      data.values = [];
      el<HTMLInputElement>("visual-chart-title").value = data.title;
      el<HTMLSelectElement>("visual-chart-kind").value = data.kind;
      el<HTMLTextAreaElement>("chart-paste-data").value = "";
      el("chart-paste-status").textContent = "";
      el<HTMLDetailsElement>("chart-paste-panel").open = false;
      grid();
      dialog.showModal();
    } catch (error) {
      context.error(error);
    }
  };
  el("chart-paste-apply").onclick = () => {
    if (busy) return;
    try {
      const imported = parseChartSpreadsheet(el<HTMLTextAreaElement>("chart-paste-data").value);
      read();
      if (["pie", "doughnut"].includes(data.kind) && (imported.series.length !== 1 || imported.series[0].values.some(value => value < 0) || imported.series[0].values.reduce((a, b) => a + b, 0) <= 0))
        throw new Error("饼图和环形图需要一个非负系列，且总和大于零；可先切换为柱状图或折线图");
      const candidate = { ...data, labels: imported.labels, values: [], series: imported.series.map((series, index) => ({ ...data.series?.[index], ...series })) };
      // Validate before replacing the draft, including chart-kind compatibility.
      commitSchema.parse({ baseVersion: 1, mutationId: crypto.randomUUID(), commands: [{ type: "chart.update", slideId, target, data: candidate }] });
      chartSvg(candidate);
      data = candidate;
      grid();
      el("chart-paste-status").textContent = `已载入 ${data.labels.length} 个分类、${data.series!.length} 个系列，点击“保存图表”提交。`;
    } catch (error) {
      el("chart-paste-status").textContent = `未替换原数据：${error instanceof Error ? error.message : String(error)}`;
    }
  };
  el("chart-data-grid").addEventListener("input", preview);
  for (const id of ["visual-chart-title", "visual-chart-kind"])
    el(id).addEventListener("input", preview);
  el("chart-add-row").onclick = () => {
    read();
    if (data.labels.length >= 100) return;
    data.labels.push("新分类");
    for (const series of data.series!) series.values.push(0);
    grid();
  };
  el("chart-add-series").onclick = () => {
    read();
    if (data.series!.length >= 8) return;
    data.series!.push({
      name: "系列 " + (data.series!.length + 1),
      values: data.labels.map(() => 0),
    });
    grid();
  };
  el("save-chart-editor").onclick = () =>
    void (async () => {
      if (busy) return;
      if (key !== context.key()) {
        el("chart-editor-status").textContent =
          "页面已变化，请关闭后重新打开图表编辑。";
        return;
      }
      read();
      const controls = [
        ...dialog.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement
        >("input,select,button,textarea"),
      ].map((control) => ({ control, disabled: control.disabled }));
      try {
        const commands = commitSchema.parse({
          baseVersion: 1,
          mutationId: crypto.randomUUID(),
          commands: [{ type: "chart.update", slideId, target, data }],
        }).commands;
        busy = true;
        for (const { control } of controls) control.disabled = true;
        await context.commands(commands);
        dialog.close();
      } catch (error) {
        el("chart-editor-status").textContent =
          error instanceof Error ? error.message : String(error);
      } finally {
        busy = false;
        for (const { control, disabled } of controls)
          control.disabled = disabled;
      }
    })();
  el("close-chart-editor").onclick = () => {
    if (!busy) dialog.close();
  };
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  return {
    render() {
      const item = selected();
      button.hidden = !item;convert.hidden=!item;convert.disabled=!!item?.locked;
      button.disabled = !!item?.locked;
    },
  };
}
