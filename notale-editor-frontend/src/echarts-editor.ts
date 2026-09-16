import {bindChartProperties,type ChartPropertyGroup,type ChartPropertyButton} from './state/chart-properties';
import {bindChartDock} from './state/chart-dock';
import {bindChartBindings,type ChartBindingField,type ChartBindingAction} from './state/chart-bindings';
import {bindChartToolbar,type ChartToolbarAction} from './state/chart-toolbar';
import {createChartGridConnection} from './state/chart-grid-connection';
import {applyChartTable,chartTableRows} from './state/chart-table-draft';
import {pasteChartTable} from './state/chart-table-paste';
import {chartNumber as number} from './state/chart-table-import';
import {createChartDataMenu,type ChartMenuAction} from './state/chart-data-menu';
import {createChartImport} from './state/chart-import-dialog';
import {createChartGallery} from './state/chart-gallery';
import {ChartBuffers,chartBufferKey} from './state/chart-buffers';
import {ChartEdits,type ChartEdit} from './state/chart-edits';
import {
  chartAuthoringSchema,
  newChart,
  cleanChartReferences,
  chartAtState,
  type ChartAuthoring,
  type ChartKind,
  type ChartSelection,
  type NativeChartInspection,
  type Slide,
  type Command,
} from "@notale/editor/browser";

type Context = {
  documentId: () => string;
  slide: () => Slide;
  selection: () => string[];
  locked: () => boolean;
  inspect: () => Promise<NativeChartInspection>;
  send: (type: string, data: unknown) => void;
  select: (id: string) => void;
  format: () => void;
  commands: (commands: Command[]) => Promise<unknown>;
  commit:(edit:ChartEdit)=>Promise<void>;
  error: (error: unknown) => void;
  step: () => number;
  setStep: (step: number) => void;
};
const uid = () => crypto.randomUUID();
export function createEchartsEditor(ctx: Context) {
  let target = "",
    model: ChartAuthoring | undefined,
    part: ChartSelection = { kind: "chart" },
    key = "",
    stepState: string | undefined;
  let grid: any,
    gridLoaded: Promise<void> | undefined,
    focused = { row: 0, column: 0 },
    edgeMode = false,
    composition = false;
  let bufferBase: Record<string, unknown>[] = [];
  let buffer: Record<string, unknown>[] | undefined,
    bufferError = "",
    selectionGeneration = 0;
  const cache = new Map<string, ChartAuthoring>();
  const edits=new ChartEdits(ctx.commit);
  const buffers=new ChartBuffers();
  let sealed=false,disposed=false;
  const lifecycle=new AbortController();
  const panel=document.getElementById('echarts-inspector')!;
  const propertyView=bindChartProperties();
  let observedAuthoring:string|undefined,propertyLocked:boolean|undefined;
  let propertyRoot:ChartPropertyGroup={kind:'group',className:'',children:[]};
  let propertyGuard=()=>{};
  const dock=document.getElementById('chart-data-dock')!;
  const dockState=bindChartDock();
  const viewport=document.getElementById('canvas-viewport')!;
  const gridConnection=createChartGridConnection();
  const bindings = dock.querySelector<HTMLElement>(".chart-data-bindings")!;
  let renamingColumn:string|undefined;
  const bindingView=bindChartBindings(bindings);
  const gallery=createChartGallery();
  const importDialog=createChartImport();
  const dataMenu=createChartDataMenu();
  const status = (text: string) => {
    if(disposed)return;
    dockState.status(text,!!bufferError);
  };
  const error = (e: unknown) => {
    bufferError = e instanceof Error ? e.message : String(e);
    status(bufferError);
  };
  const button=(parent:ChartPropertyGroup,label:string,action:()=>unknown)=>{
    const guard=propertyGuard;
    const node:ChartPropertyButton={kind:'button',label,run:()=>{guard();return action();}};
    parent.children.push(node);return node;
  };
  const field=(parent:ChartPropertyGroup,label:string,value:unknown,change:(value:any)=>void,options?:Record<string,string>|'number'|'color'|'checkbox')=>{
    const guard=propertyGuard;
    parent.children.push({kind:'field',label,value,options,change:value=>{guard();change(value);}});
  };
  const section=(title:string,open=false)=>{
    const group:ChartPropertyGroup={kind:'group',className:'chart-properties',title,open,children:[]};propertyRoot.children.push(group);return group;
  };
  function currentKey() {
    return [ctx.documentId(), ctx.slide().id, target].join(":");
  }
  function bufferKey(){return chartBufferKey(currentKey(),edgeMode?undefined:stepState);}
  function preview() {
    if (model) ctx.send("chart-draft", { target, model, stepState });
  }
  function save(next: ChartAuthoring, refresh = false) {
    if (sealed || !model || ctx.locked()) return false;
    try {
      next = chartAuthoringSchema.parse(cleanChartReferences(next));
      const before = structuredClone(model);
      if (JSON.stringify(before) === JSON.stringify(next)) return true;
      model = next;
      cache.set(currentKey(), structuredClone(next));
      preview();
      void edits.enqueue({documentId:ctx.documentId(),slideId:ctx.slide().id,target,before,after:next}).catch(ctx.error);
      bufferError = "";
      status("");
      renderProperties();
      if(refresh)renderGrid();
      return true;
    } catch (e) {
      error(e);
      return false;
    }
  }
  function edit(action: (next: ChartAuthoring) => void, refresh = false) {
    if (!model) return;
    const next = structuredClone(model);
    action(next);
    save(next, refresh);
  }
  function styleEdit(action: (next: ChartAuthoring) => void) {
    if (!model) return;
    if (!stepState) {
      edit(action);
      return;
    }
    edit((next) => {
      const base = chartAtState(next, [stepState!]);
      action(base);
      const state = next.states.find((s) => s.id === stepState)!;
      state.appearance = Object.fromEntries(
        Object.entries(base.appearance).filter(
          ([k, v]) =>
            JSON.stringify(v) !==
            JSON.stringify(next.appearance[k as keyof typeof next.appearance]),
        ),
      );
      state.kind = base.kind !== next.kind ? base.kind : undefined;
      state.xAxis = Object.fromEntries(
        Object.entries(base.xAxis).filter(
          ([k, v]) =>
            JSON.stringify(v) !==
            JSON.stringify(next.xAxis[k as keyof typeof next.xAxis]),
        ),
      );
      state.yAxis = Object.fromEntries(
        Object.entries(base.yAxis).filter(
          ([k, v]) =>
            JSON.stringify(v) !==
            JSON.stringify(next.yAxis[k as keyof typeof next.yAxis]),
        ),
      );
      state.series = Object.fromEntries(
        base.series.map((s) => [s.id, s.style]),
      );
      state.hiddenRows = base.hiddenRows;
      state.annotations = base.annotations
        .filter((a) => !a.hidden)
        .map((a) => a.id);
    });
  }
  function seriesStyle() {
    return (
      model?.series.find((s) => s.id === part.seriesId) ?? model?.series[0]
    );
  }
  function modifySeries(property: string, value: any) {
    styleEdit((next) => {
      const series =
        next.series.find((s) => s.id === part.seriesId) ?? next.series[0];
      const style =
        part.kind === "point" && part.rowId
          ? (series.points[part.rowId] ??= {})
          : series.style;
      (style as any)[property] = value;
    });
  }
  function selectPart(next: ChartSelection) {
    if (
      next.kind === "series" &&
      part.seriesId === next.seriesId &&
      next.rowId
    ) {
      next = { ...next, kind: "point" };
    }
    part = next;
    renderProperties();
    ctx.format();
    if (model && next.rowId) {
      const row = model.rows.findIndex((r) => r.id === next.rowId);
      if (row >= 0) {
        focused.row = row;
        void grid?.scrollToRow?.(row);
      }
    }
    ctx.send("chart-selection", { target, selection: part });
  }
  function renderProperties() {
    if(disposed)return;
    if(!model){propertyView.hide();return;}
    propertyRoot={kind:'group',className:'',children:[]};
    const scope=JSON.stringify([currentKey(),part,stepState]),baseline=JSON.stringify(model);
    propertyGuard=()=>{if(disposed||JSON.stringify([currentKey(),part,stepState])!==scope||JSON.stringify(model)!==baseline)throw Error('图表已变化，请重新选择属性');if(ctx.locked())throw Error('图表已锁定');};
    if (stepState) {
      const bar:ChartPropertyGroup={kind:'group',className:'chart-step-scope',children:[]};
      const stepLabel = `正在编辑：${model.states.find((s) => s.id === stepState)?.name ?? "教学步骤"}`;
      bar.children.push({kind:'text',className:'',text:stepLabel});
      button(bar, "返回基础图表", () => {
        stepState = undefined;
        preview();
        renderProperties();
        renderGrid();
      });
      propertyRoot.children.push(bar);
    }
    const cartesian = [
      "column",
      "bar",
      "line",
      "area",
      "stacked",
      "percent",
      "stacked-area",
      "combo",
      "scatter",
      "bubble",
      "histogram",
      "boxplot",
      "heatmap",
      "waterfall",
    ].includes(model.kind);
    const objects: Record<string, string> = {
      chart: "整个图表",
      title: "标题",
      legend: "图例",
      xAxis: "横坐标轴",
      yAxis: "纵坐标轴",
    };
    if (!cartesian) {
      delete objects.xAxis;
      delete objects.yAxis;
    }
    for (const s of model.series) objects[`series:${s.id}`] = `系列：${s.name}`;
    for (const a of model.annotations)
      objects[`annotation:${a.id}`] = `标注：${a.text || "未命名"}`;
    const selectionKey =
      part.kind === "series" || part.kind === "point"
        ? `series:${part.seriesId}`
        : part.kind === "annotation"
          ? `annotation:${part.annotationId}`
          : part.kind;
    field(
      propertyRoot,
      "所选内容",
      selectionKey,
      (value) => {
        const [kind, id] = value.split(":");
        selectPart({
          kind,
          seriesId: kind === "series" ? id : undefined,
          annotationId: kind === "annotation" ? id : undefined,
        });
      },
      objects,
    );
    if (part.kind === "point") {
      const note = `数据点：${model.rows.find((r) => r.id === part.rowId)?.values[model.bindings.label] ?? ""}`;
      propertyRoot.children.push({kind:'text',className:'hint',text:note});
    }
    const actions:ChartPropertyGroup={kind:'group',className:'chart-primary-actions',children:[]};
    button(actions, "编辑数据", openData);
    button(actions, "更改类型", () => openGallery("change"));
    propertyRoot.children.push(actions);
    const shown = stepState ? chartAtState(model, [stepState]) : model;
    if (["chart", "title"].includes(part.kind)) {
      const group = section("标题与文字", true);
      for (const [label, key] of [
        ["标题", "title"],
        ["副标题", "subtitle"],
        ["字体", "fontFamily"],
      ] as const)
        field(group, label, shown.appearance[key] ?? "", (v) =>
          styleEdit((n) => (n.appearance[key] = v)),
        );
      field(
        group,
        "字号",
        shown.appearance.fontSize ?? 16,
        (v) => styleEdit((n) => (n.appearance.fontSize = v)),
        "number",
      );
      field(
        group,
        "文字颜色",
        shown.appearance.textColor ?? "#374151",
        (v) => styleEdit((n) => (n.appearance.textColor = v)),
        "color",
      );
    }
    if (["chart", "legend"].includes(part.kind)) {
      const g = section("布局与配色", part.kind === "legend");
      field(
        g,
        "图例",
        shown.appearance.legend ?? "auto",
        (v) => styleEdit((n) => (n.appearance.legend = v)),
        {
          auto: "自动",
          none: "隐藏",
          top: "上方",
          bottom: "下方",
          left: "左侧",
          right: "右侧",
        },
      );
      field(
        g,
        "背景",
        shown.appearance.background ?? "#ffffff",
        (v) => styleEdit((n) => (n.appearance.background = v)),
        "color",
      );
      field(
        g,
        "绘图区边距",
        shown.appearance.margin ?? 50,
        (v) => styleEdit((n) => (n.appearance.margin = v)),
        "number",
      );
      const palettes = [
        ["#7c5ce7", "#39a7a0", "#f2ad5e", "#dc668e", "#6c92d4"],
        ["#3e73ba", "#6ca0d6", "#b4d5ed", "#dc914c", "#ddbd83"],
        ["#269a91", "#62b2a8", "#a4d1bc", "#d4c788", "#d58b61"],
      ];
      const swatches:ChartPropertyGroup={kind:'group',className:'chart-palettes',children:[]};
      palettes.forEach((colors, i) => {
        const b = button(swatches, `配色 ${i + 1}`, () =>
          styleEdit((n) => (n.appearance.palette = colors)),
        );
        b.colors=colors;
      });
      g.children.push(swatches);
    }
    if (part.kind === "series" || part.kind === "point") {
      const s =
          shown.series.find((s) => s.id === part.seriesId) ?? shown.series[0],
        st =
          part.kind === "point" && part.rowId
            ? { ...s.style, ...s.points[part.rowId] }
            : s.style,
        g = section("外观", true);
      if (part.kind === "series") {
        field(g, "系列名称", s.name, (v) =>
          edit((n) => {
            n.series.find((t) => t.id === s.id)!.name = v;
          }),
        );
        if (shown.kind === "combo")
          field(
            g,
            "绘制为",
            s.type ?? "bar",
            (v) =>
              edit((n) => {
                n.series.find((t) => t.id === s.id)!.type = v;
              }),
            { bar: "柱形", line: "折线" },
          );
        if (["column", "bar", "line", "area", "combo"].includes(shown.kind))
          field(
            g,
            "坐标轴",
            s.axis,
            (v) =>
              edit((n) => {
                n.series.find((t) => t.id === s.id)!.axis = v;
              }),
            { primary: "主坐标轴", secondary: "次坐标轴" },
          );
      }
      field(
        g,
        "颜色",
        st.color ??
          shown.appearance.palette?.[shown.series.indexOf(s)] ??
          "#7c5ce7",
        (v) => modifySeries("color", v),
        "color",
      );
      field(g, "渐变终点", st.gradient ?? "", (v) =>
        modifySeries("gradient", v || undefined),
      );
      field(
        g,
        "不透明度",
        st.opacity ?? 1,
        (v) => modifySeries("opacity", v),
        "number",
      );
      field(
        g,
        "线宽",
        st.width ?? 3,
        (v) => modifySeries("width", v),
        "number",
      );
      field(
        g,
        "线型",
        st.lineType ?? "solid",
        (v) => modifySeries("lineType", v),
        { solid: "实线", dashed: "虚线", dotted: "点线" },
      );
      field(
        g,
        "数据标记",
        st.symbol ?? "circle",
        (v) => modifySeries("symbol", v),
        {
          circle: "圆形",
          rect: "方形",
          diamond: "菱形",
          triangle: "三角形",
          none: "隐藏",
        },
      );
      field(
        g,
        "标记大小",
        st.symbolSize ?? 7,
        (v) => modifySeries("symbolSize", v),
        "number",
      );
      field(
        g,
        "平滑曲线",
        st.smooth ?? false,
        (v) => modifySeries("smooth", v),
        "checkbox",
      );
      field(
        g,
        "显示数值",
        st.labels ?? false,
        (v) => modifySeries("labels", v),
        "checkbox",
      );
      field(
        g,
        "标签位置",
        st.labelPosition ?? "top",
        (v) => modifySeries("labelPosition", v),
        { top: "上方", inside: "内部", right: "右侧", outside: "外部" },
      );
      button(g, "恢复继承样式", () =>
        edit((n) => {
          const s = n.series.find((s) => s.id === part.seriesId)!;
          if (part.kind === "point" && part.rowId) delete s.points[part.rowId];
          else s.style = {};
        }, true),
      );
      button(g, "添加标注", () => addAnnotation(part.rowId ? "point" : "text"));
    }
    for (const key of ["xAxis", "yAxis", "secondaryAxis"] as const) {
      if (
        !cartesian ||
        (key === "secondaryAxis" &&
          !shown.series.some((s) => s.axis === "secondary"))
      )
        continue;
      if (
        !["chart", key].includes(part.kind) &&
        !(key === "secondaryAxis" && part.kind === "yAxis")
      )
        continue;
      const g = section(
        key === "xAxis"
          ? "横坐标轴"
          : key === "yAxis"
            ? "纵坐标轴"
            : "次坐标轴",
        part.kind === key,
      );
      const axis = shown[key];
      field(g, "轴标题", axis.name ?? "", (v) =>
        styleEdit((n) => (n[key].name = v)),
      );
      field(
        g,
        "刻度类型",
        axis.type ?? (key === "xAxis" ? "category" : "value"),
        (v) => styleEdit((n) => (n[key].type = v)),
        { category: "分类", value: "数值", time: "时间", log: "对数" },
      );
      for (const [name, prop] of [
        ["最小值", "min"],
        ["最大值", "max"],
        ["刻度间隔", "interval"],
        ["标签旋转", "rotate"],
      ] as const)
        field(
          g,
          name,
          axis[prop],
          (v) => styleEdit((n) => ((n[key] as any)[prop] = v)),
          "number",
        );
      field(
        g,
        "逆序",
        axis.inverse ?? false,
        (v) => styleEdit((n) => (n[key].inverse = v)),
        "checkbox",
      );
      field(
        g,
        "网格线",
        axis.grid ?? key !== "xAxis",
        (v) => styleEdit((n) => (n[key].grid = v)),
        "checkbox",
      );
    }
    if (part.kind === "annotation") {
      const annotation = model.annotations.find(
        (a) => a.id === part.annotationId,
      );
      if (annotation) {
        const g = section("标注", true);
        const change = (key: string, value: any) =>
          edit((n) => {
            Object.assign(n.annotations.find((a) => a.id === annotation.id)!, {
              [key]: value,
            });
          });
        field(g, "文字", annotation.text, (v) => change("text", v));
        for (const [label, key] of [
          ["横向位置", "x"],
          ["纵向位置", "y"],
          ["宽度", "width"],
          ["字号", "fontSize"],
        ] as const)
          field(g, label, annotation[key], (v) => change(key, v), "number");
        field(g, "颜色", annotation.color, (v) => change("color", v), "color");
        if (annotation.kind === "area")
          field(
            g,
            "结束位置",
            annotation.end,
            (v) => change("end", v),
            "number",
          );
        button(g, "删除标注", () => {
          edit((n) => {
            n.annotations = n.annotations.filter((a) => a.id !== annotation.id);
          }, true);
          part = { kind: "chart" };
          renderProperties();
        });
      }
    }
    const numbers = section("数值与提示");
    field(
      numbers,
      "小数位",
      shown.appearance.precision ?? 0,
      (v) => styleEdit((n) => (n.appearance.precision = v)),
      "number",
    );
    field(numbers, "前缀", shown.appearance.prefix ?? "", (v) =>
      styleEdit((n) => (n.appearance.prefix = v)),
    );
    field(numbers, "单位", shown.appearance.suffix ?? "", (v) =>
      styleEdit((n) => (n.appearance.suffix = v)),
    );
    field(
      numbers,
      "千位分隔",
      shown.appearance.thousands ?? false,
      (v) => styleEdit((n) => (n.appearance.thousands = v)),
      "checkbox",
    );
    field(
      numbers,
      "标签内容",
      shown.appearance.labelContent ?? "value",
      (v) => styleEdit((n) => (n.appearance.labelContent = v)),
      {
        value: "数值",
        name: "名称",
        percent: "百分比",
        "name-value": "名称与数值",
      },
    );
    field(
      numbers,
      "演示时显示提示",
      shown.appearance.tooltip !== false,
      (v) => styleEdit((n) => (n.appearance.tooltip = v)),
      "checkbox",
    );
    if (shown.kind === "histogram")
      field(
        numbers,
        "分箱数",
        shown.appearance.bins,
        (v) =>
          styleEdit((n) => {
            if (v === null) delete n.appearance.bins;
            else n.appearance.bins = v;
          }),
        "number",
      );
    if (shown.kind === "heatmap") {
      field(
        numbers,
        "色标",
        shown.appearance.colorScale ?? "continuous",
        (v) => styleEdit((n) => (n.appearance.colorScale = v)),
        { continuous: "连续", piecewise: "分段" },
      );
      field(
        numbers,
        "低值颜色",
        shown.appearance.colorLow ?? "#e8e1fc",
        (v) => styleEdit((n) => (n.appearance.colorLow = v)),
        "color",
      );
      field(
        numbers,
        "高值颜色",
        shown.appearance.colorHigh ?? "#7350d2",
        (v) => styleEdit((n) => (n.appearance.colorHigh = v)),
        "color",
      );
    }
    const annotations = section("标注与参考");
    button(annotations, "文字标注", () => addAnnotation("text"));
    button(annotations, "参考线", () => addAnnotation("line"));
    button(annotations, "参考区域", () => addAnnotation("area"));
    const teaching = section("分步讲授");
    button(teaching, "添加下一步", addStep);
    for (const state of model.states)
      button(teaching, state.name, () => {
        stepState = state.id;
        preview();
        renderProperties();
        renderGrid();
      });
    if (stepState) {
      field(
        teaching,
        "步骤名称",
        model.states.find((s) => s.id === stepState)?.name ?? "",
        (v) =>
          edit((n) => {
            n.states.find((s) => s.id === stepState)!.name = v;
          }),
      );
      button(teaching, "显示到当前分类", () =>
        edit((n) => {
          n.states.find((s) => s.id === stepState)!.hiddenRows = n.rows
            .slice(focused.row + 1)
            .map((r) => r.id);
        }),
      );
      button(teaching, "显示全部分类", () =>
        edit((n) => {
          n.states.find((s) => s.id === stepState)!.hiddenRows = [];
        }),
      );
      button(teaching, "突出所选系列", () => {
        edit((n) => {
          n.states.find((s) => s.id === stepState)!.emphasis = [
            part.seriesId ?? n.series[0].id,
          ];
        });
      });
      button(teaching, "显示所选系列", () => modifySeries("hidden", false));
      button(teaching, "隐藏所选系列", () => modifySeries("hidden", true));
    }
    const transfer = section("导出与恢复");
    button(transfer, "导出 PNG", () =>
      ctx.send("chart-export", { target, format: "png" }),
    );
    button(transfer, "导出 SVG", () =>
      ctx.send("chart-export", { target, format: "svg" }),
    );
    button(transfer, "恢复默认外观", () => {
      edit((n) => {
        n.appearance = { title: n.appearance.title };
        n.xAxis = {};
        n.yAxis = {};
        n.secondaryAxis = {};
        n.series.forEach((s) => {
          s.style = {};
          s.points = {};
        });
      }, true);
    });
    if (ctx.slide().nativeCharts[target]?.source)
      button(transfer, "恢复动态数据", () =>
        edit((n) => (n.origin = "native"), true),
      );
    propertyLocked=ctx.locked();
    propertyView.update(scope,propertyRoot.children,propertyLocked);
  }
  function addAnnotation(kind: "text" | "point" | "line" | "area") {
    const id = uid();
    edit((n) => {
      n.annotations.push({
        id,
        kind,
        text:
          kind === "line"
            ? "参考值"
            : kind === "area"
              ? "关注区域"
              : "在此输入标注",
        rowId: kind === "point" ? part.rowId : undefined,
        seriesId: part.seriesId,
        x: kind === "area" ? 0 : 45,
        y: kind === "line" ? 80 : 25,
        end: kind === "area" ? 1 : undefined,
        color: "#7c5ce7",
        fontSize: 16,
        width: 180,
      });
      if (stepState) {
        n.states.find((s) => s.id === stepState)!.annotations =
          n.annotations.map((a) => a.id);
      }
    }, true);
    part = { kind: "annotation", annotationId: id };
    renderProperties();
  }
  async function addStep() {
    if (!model) return;
    await edits.flush();
    const page = ctx.slide(),
      id = target,
      stateId = uid(),
      index = Math.max(1, page.steps?.length ?? ctx.step() + 1);
    const next = structuredClone(model),
      previous = next.states.at(-1);
    const state = {
      ...(previous ? structuredClone(previous) : {}),
      id: stateId,
      name: `步骤 ${index}`,
    };
    next.states.push(state);
    await ctx.commands([
      {
        type: "native-chart.edit",
        slideId: page.id,
        target: id,
        model: next,
        before: model,
      },
      { type: "step.initialize", slideId: page.id },
      {
        type: "step.insert",
        slideId: page.id,
        index,
        step: { id: uid(), name: state.name, notes: "", advanceAfter: null },
      },
      {
        type: "animation.set",
        slideId: page.id,
        animation: {
          id: uid(),
          target: id,
          step: index,
          effect: "chart-state",
          chartStateId: stateId,
          trigger: "click",
          duration: 500,
          delay: 0,
          easing: "ease-out",
          dx: 0,
          dy: 0,
        },
      },
    ]);
    model = next;
    stepState = stateId;
    ctx.setStep(index);
    preview();
    renderProperties();
    renderGrid();
  }
  function openGallery(mode: "insert" | "change") {
    if(disposed)return;
    const documentId=ctx.documentId(),slideId=ctx.slide().id,selected=target;
    const baseline=model?JSON.stringify(model):undefined;
    gallery.open({mode,kind:model?.kind,choose:async kind=>{
      if(disposed||ctx.documentId()!==documentId||ctx.slide().id!==slideId)
        throw Error('讲义或页面已切换，请重新打开图表类型窗口');
      if(mode==='insert'){
        const id=uid();
        await ctx.commands([{type:'native-chart.create',slideId,target:id,model:newChart(kind),x:180,y:120,width:900,height:520}]);
        if(!disposed&&ctx.documentId()===documentId&&ctx.slide().id===slideId){ctx.select(id);ctx.format();}
        return;
      }
      if(!model||target!==selected||JSON.stringify(model)!==baseline)
        throw Error('图表已变化，请重新打开类型窗口');
      if(ctx.locked())throw Error('图表已锁定');
      edit(next=>{next.kind=kind;next.origin='manual';},true);
      if(bufferError)throw Error(bufferError);
      await edits.flush();
    }});
  }
  async function loadGrid() {
    if (gridLoaded) return gridLoaded;
    gridLoaded = (async () => {
      const handle=await gridConnection.mount(dock.querySelector<HTMLElement>(".chart-data-grid")!);
      if(disposed)return;
      grid=handle.element;const gridHost=handle.adapter;
      gridHost.on("beforecellfocusinit", (e: any) => {
        focused = {
          row: e.detail.rowIndex ?? 0,
          column: e.detail.colIndex ?? 0,
        };
        renderBindings();
        if (model && !edgeMode) {
          const row = model.rows[focused.row],
            series = model.series.find(
              (s) => s.columnId === model!.columns[focused.column]?.id,
            );
          if (row && series)
            ctx.send("chart-selection", {
              target,
              selection: { kind: "point", rowId: row.id, seriesId: series.id },
            });
        }
      });
      gridHost.on("afteredit", (e: any) => {
        if (composition) return;
        buffer = (grid.source as any[]).map((row) => ({ ...row }));
        applyBuffer();
      });
      gridHost.on("beforepasteapply", (event: any) => {
        if (edgeMode || !model) return;
        event.preventDefault();
        event.detail.event?.preventDefault();
        const pasted = event.detail.parsed as string[][];
        if (!pasted.length) return;
        try {
          if (ctx.locked()) throw Error("图表已锁定，未粘贴数据");
          const next = pasteChartTable(model, grid.source, bufferBase, focused, pasted, stepState, uid);
          if (!save(next)) throw Error(bufferError || "图表暂时无法保存，未完成粘贴");
          buffers.clear(bufferKey());
          renderGrid();
        } catch (cause) {
          error(cause);
        }
      });
      gridHost.on("afterpasteapply", () => {
        buffer = (grid.source as any[]).map((row) => ({ ...row }));
        applyBuffer();
      });
      gridHost.on("compositionstart", () => (composition = true));
      gridHost.on("compositionend", () => (composition = false));
      gridHost.on("keydown", async (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          return;
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "d"
        ) {
          event.preventDefault();
          event.stopPropagation();
          if(buffer&&!ctx.locked()){
            const scope=bufferKey(),previous=buffer;
            const selected=await grid.getSelectedRange();
            if(disposed||bufferKey()!==scope||buffer!==previous||ctx.locked())return;
            const cols=edgeMode?['source','target','value']:model!.columns.map(c=>c.id);
            const range=selected??{x:focused.column,x1:focused.column,y:focused.row,y1:focused.row};
            const from=range.y===range.y1?range.y-1:range.y,start=range.y===range.y1?range.y:range.y+1;
            if(from>=0)for(let r=start;r<=range.y1;r++)for(let c=range.x;c<=range.x1;c++)if(buffer[r]&&(!edgeMode||c===2))buffer[r][cols[c]]=buffer[from][cols[c]];
            grid.source=buffer;applyBuffer();
          }
        }
      });
      gridHost.on("contextmenu", (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        showDataMenu(e.clientX, e.clientY);
      });
    })().catch(cause=>{gridLoaded=undefined;throw cause;});
    return gridLoaded;
  }
  function showDataMenu(x: number, y: number) {
    if(disposed)return;
    const source=currentKey(),scope=stepState,baseline=JSON.stringify(model),cell={...focused},sourceEdge=edgeMode;
    const actions:ChartMenuAction[]=[];
    const action=(label:string,run:()=>void)=>actions.push({label,run:()=>{
      if(disposed||currentKey()!==source||JSON.stringify(model)!==baseline||edgeMode!==sourceEdge||stepState!==scope)
        throw Error('图表数据已变化，请重新打开快捷菜单');
      if(ctx.locked())throw Error('图表已锁定');
      focused={...cell};run();
    }});
    action("在下方插入行", addRow);
    action("删除当前行", () =>
      edit((n) => {
        if (edgeMode) n.edges.splice(focused.row, 1);
        else {
          const removed = n.rows.splice(focused.row, 1)[0];
          for (const r of n.rows)
            if (r.parentId === removed?.id) r.parentId = null;
        }
      }, true),
    );
    action("当前行上移", () =>
      edit((n) => {
        const rows = edgeMode ? n.edges : n.rows;
        if (focused.row > 0) {
          [rows[focused.row - 1], rows[focused.row]] = [
            rows[focused.row],
            rows[focused.row - 1],
          ];
          focused.row--;
        }
      }, true),
    );
    action("当前行下移", () =>
      edit((n) => {
        const rows = edgeMode ? n.edges : n.rows;
        if (focused.row < rows.length - 1) {
          [rows[focused.row + 1], rows[focused.row]] = [
            rows[focused.row],
            rows[focused.row + 1],
          ];
          focused.row++;
        }
      }, true),
    );
    if (!edgeMode && model && focused.column > 0) {
      const move = (delta: number) =>
        edit((n) => {
          const at = focused.column,
            to = at + delta;
          if (to < 1 || to >= n.columns.length) return;
          [n.columns[at], n.columns[to]] = [n.columns[to], n.columns[at]];
          n.series.sort(
            (a, b) =>
              n.columns.findIndex((c) => c.id === a.columnId) -
              n.columns.findIndex((c) => c.id === b.columnId),
          );
          focused.column = to;
        }, true);
      action("当前列左移", () => move(-1));
      action("当前列右移", () => move(1));
      action("重命名当前列", () => {
        renamingColumn=model!.columns[focused.column]?.id;
        renderBindings();
      });
      if (model.series.length > 1)
        action("删除当前系列", () =>
          edit((n) => {
            const c = n.columns[focused.column];
            n.series = n.series.filter((s) => s.columnId !== c.id);
            n.columns = n.columns.filter((x) => x.id !== c.id);
            for (const row of n.rows) delete row.values[c.id];
            for (const [k, v] of Object.entries(n.bindings))
              if (v === c.id) delete (n.bindings as any)[k];
          }, true),
        );
    }
    dataMenu.open(x,y,actions);
  }
  function applyBuffer() {
    if (!model || !buffer) return;
    try {
      const next=applyChartTable(model,buffer,bufferBase,edgeMode,stepState,uid);
      if (!save(next)) throw Error(bufferError || (ctx.locked() ? "图表已锁定，数据草稿已保留" : "图表暂时无法保存，数据草稿已保留"));
      bufferBase = structuredClone(buffer);
      bufferError = "";
      buffers.clear(bufferKey());
      status("");
    } catch (e) {
      error(e);
      try {
        buffers.set(bufferKey(),{edgeMode,buffer,bufferBase});
      } catch {
        ctx.error(Error("数据草稿无法写入本机，请保持窗口打开"));
      }
    }
  }

  function renderGrid() {
    if(disposed)return;
    if (!grid || !model || !dockState.visible) return;
    buffer=chartTableRows(model,edgeMode,stepState);
    bufferBase = structuredClone(buffer);
    bufferError="";status("");
    const retained=buffers.get(bufferKey());
    if(retained){buffer=retained.buffer;bufferBase=retained.bufferBase;edgeMode=retained.edgeMode;bufferError='上次的数据草稿尚未应用，请修正后继续';status(bufferError);}
    grid.columns = edgeMode
      ? [
          { prop: "sourceName", name: "起点", readonly: true, size: 190 },
          { prop: "targetName", name: "终点", readonly: true, size: 190 },
          { prop: "value", name: "流量", size: 140 },
        ]
      : model.columns.map((c) => ({
          prop: c.id,
          name: c.name,
          size: c.type === "text" ? 190 : 150,
        }));
    if (edgeMode) {
      const labels = new Map(model.rows.map(row => [row.id, row.values[model!.bindings.label]]));
      for (const row of buffer) {
        row.sourceName = (typeof row.source === "string" ? labels.get(row.source) : undefined) ?? "";
        row.targetName = (typeof row.target === "string" ? labels.get(row.target) : undefined) ?? "";
      }
    }
    grid.source = buffer;
    grid.readonly = ctx.locked();
    renderBindings();
  }
  function renderBindings() {
    if(disposed)return;
    const fields:ChartBindingField[]=[],actions:ChartBindingAction[]=[];let hint='';
    if(!model){bindingView.update(fields,actions);return;}
    const source=currentKey(),baseline=JSON.stringify(model),cell={...focused};
    const validate=()=>{if(disposed||currentKey()!==source||JSON.stringify(model)!==baseline||focused.row!==cell.row||focused.column!==cell.column)throw Error('图表或单元格已变化，请重新选择');if(ctx.locked())throw Error('图表已锁定');};
    const bindingField=(label:string,value:unknown,change:(value:string)=>void,options?:Record<string,string>)=>fields.push({label,value:String(value??''),options,change:value=>{validate();change(value);}});
    const bindingButton=(label:string,run:()=>void)=>actions.push({label,run:()=>{validate();run();}});
    const columns = Object.fromEntries(
      model.columns.map((c) => [c.id, c.name]),
    );
    const rename=model.columns.find(column=>column.id===renamingColumn);
    if(rename)bindingField('列名称',rename.name,value=>{
      renamingColumn=undefined;
      edit(next=>{next.columns.find(column=>column.id===rename.id)!.name=value;for(const series of next.series)if(series.columnId===rename.id)series.name=value;},true);
    });
    bindingField("分类",
      model.bindings.label,
      (v) => edit((n) => (n.bindings.label = v), true),
      columns,
    );
    if (
      ["tree", "treemap", "sunburst"].includes(model.kind) &&
      model.rows[focused.row]
    )
      bindingField("父节点",
        model.rows[focused.row].parentId ?? "",
        (v) =>
          edit((n) => {
            n.rows[focused.row].parentId = v || null;
          }, true),
        {
          "": "无（根节点）",
          ...Object.fromEntries(
            model.rows
              .filter((r) => r.id !== model!.rows[focused.row].id)
              .map((r) => [
                r.id,
                String(r.values[model!.bindings.label] ?? "未命名"),
              ]),
          ),
        },
      );
    if (["scatter", "bubble"].includes(model.kind)) {
      bindingField("横轴",
        model.bindings.x,
        (v) => edit((n) => (n.bindings.x = v), true),
        columns,
      );
      bindingField("纵轴",
        model.bindings.y,
        (v) => edit((n) => (n.bindings.y = v), true),
        columns,
      );
      if (model.kind === "bubble")
        bindingField("大小",
          model.bindings.size,
          (v) => edit((n) => (n.bindings.size = v), true),
          columns,
        );
    }
    if (
      [
        "pie",
        "doughnut",
        "rose",
        "funnel",
        "gauge",
        "tree",
        "treemap",
        "sunburst",
      ].includes(model.kind)
    )
      bindingField("数值系列",
        model.bindings.seriesId ?? model.series[0].id,
        (v) => edit((n) => (n.bindings.seriesId = v), true),
        Object.fromEntries(model.series.map((s) => [s.id, s.name])),
      );
    if (["graph", "sankey"].includes(model.kind)) {
      bindingButton(edgeMode ? "编辑节点" : "编辑连线", () => {
        edgeMode = !edgeMode;
        focused.row = 0;
        renderGrid();
      });
      const edge = model.edges[focused.row];
      if (edgeMode && edge) {
        const nodes = Object.fromEntries(
          model.rows.map((r) => [
            r.id,
            String(r.values[model!.bindings.label] ?? "未命名"),
          ]),
        );
        bindingField("起点",
          edge.source,
          (v) => edit((n) => (n.edges[focused.row].source = v), true),
          nodes,
        );
        bindingField("终点",
          edge.target,
          (v) => edit((n) => (n.edges[focused.row].target = v), true),
          nodes,
        );
      }
    }
    if (ctx.slide().nativeCharts[target]?.source && model.origin === "native") {
      hint="当前由原图动态计算；修改表格后使用手工数据。";
    }
    bindingView.update(fields,actions,hint);
  }
  async function openData() {
    if(disposed)return;
    if (!model) return;
    let saved=280;try{saved=Number(localStorage.getItem('notale-chart-dock-height'))||280;}catch{}
    dockState.show(Math.max(180,Math.min(saved,viewport.parentElement!.clientHeight*.5)));
    await loadGrid();
    if(disposed)return;
    renderGrid();

  }
  const actions = dock.querySelector<HTMLElement>(".chart-data-actions")!;
  const toolbarActions:ChartToolbarAction[]=[];
  const toolbarAction=(label:string,run:()=>unknown)=>{toolbarActions.push({label,run:()=>{if(disposed)throw Error('图表数据面板已关闭');return run();}});};
  function addRow() {
    edit((n) => {
      if (edgeMode) {
        if (n.rows.length >= 2)
          n.edges.push({
            id: uid(),
            source: n.rows[0].id,
            target: n.rows[1].id,
            value: 1,
          });
      } else
        n.rows.splice(focused.row + 1, 0, {
          id: uid(),
          values: Object.fromEntries(
            n.columns.map((c) => [c.id, c.type === "number" ? null : "新分类"]),
          ),
        });
    }, true);
  }
  toolbarAction("＋ 行", addRow);
  toolbarAction("＋ 系列", () =>
    edit((n) => {
      const id = uid();
      n.columns.push({
        id,
        name: `系列 ${n.series.length + 1}`,
        type: "number",
      });
      n.series.push({
        id: uid(),
        columnId: id,
        name: `系列 ${n.series.length + 1}`,
        axis: "primary",
        style: {},
        points: {},
      });
      n.rows.forEach((r) => (r.values[id] = null));
    }, true),
  );
  toolbarAction("切换行列", () => {
    if (!model) return;
    if (model.states.length || model.annotations.length || model.edges.length)
      throw Error("带有步骤、标注或连线的图表暂不能切换行列");
    if (model.rows.length > 99) throw Error("切换后系列数不能超过 99");
    edit((n) => {
      const old = structuredClone(n);
      n.columns = [
        old.columns.find((c) => c.id === old.bindings.label)!,
        ...old.rows.map((r) => ({
          id: r.id,
          name: String(r.values[old.bindings.label] ?? ""),
          type: "number" as const,
        })),
      ];
      n.rows = old.series.map((series) => ({
        id: series.id,
        values: {
          [old.bindings.label]: series.name,
          ...Object.fromEntries(
            old.rows.map((r) => [r.id, r.values[series.columnId] ?? null]),
          ),
        },
      }));
      n.series = old.rows.map((r) => ({
        id: r.id,
        columnId: r.id,
        name: String(r.values[old.bindings.label] ?? ""),
        axis: "primary",
        style: {},
        points: {},
      }));
      n.bindings = { label: old.bindings.label };
      n.hiddenRows = [];
      n.origin = "manual";
    }, true);
  });
  toolbarActions.push({label:'导入表格',run:()=>{},file:{accept:'.csv,.tsv,.txt',prepare:()=>{
    if(disposed)throw Error('图表数据面板已关闭');
    const source=currentKey(),generation=selectionGeneration;
    return async(file:File)=>{
      const text=await file.text();
      if(disposed)return;
      if(currentKey()!==source||selectionGeneration!==generation)throw Error('图表已切换，请重新选择导入文件');
      showImport(text);
    };
  }}});
  toolbarAction("恢复有效数据", () => {
    bufferError = "";
    buffers.clear(bufferKey());
    renderGrid();
    status("");
  });
  const toolbar=bindChartToolbar(actions,toolbarActions);
  function showImport(text: string) {
    if(disposed)return;
    const source=currentKey(),baseline=JSON.stringify(model);
    const validate=()=>{
      if(disposed||currentKey()!==source||JSON.stringify(model)!==baseline)throw Error('图表已变化，导入内容已保留，请重新打开导入窗口');
      if(ctx.locked())throw Error('图表已锁定');
    };
    importDialog.open(text,async(raw,header)=>{
      validate();await importTable(raw,header,validate);
      if(bufferError)throw Error(bufferError);
      await edits.flush();
    });
  }
  async function importTable(text: string, withHeader: boolean, validate:()=>void) {
    const {importChartTable}=await import('./state/chart-table-import');
    validate();
    if(!model)throw Error('请选择图表');
    save(importChartTable(model,text,withHeader,uid),true);
  }
  async function render() {
    if(disposed)return;
    const id = ctx.selection().length === 1 ? ctx.selection()[0] : "";
    const chart = ctx.slide().nativeCharts[id];
    const nextKey = [ctx.documentId(), ctx.slide().id, id].join(":");
    const authoring=JSON.stringify(chart?.authoring);
    if (nextKey === key) {
      const pending=edits.hasPending(ctx.documentId(),ctx.slide().id,id);
      if(authoring!==observedAuthoring&&!pending){
        observedAuthoring=authoring;
        model=chart?.authoring?structuredClone(chart.authoring):undefined;
        if(model){
          if(stepState&&!model.states.some(state=>state.id===stepState))stepState=undefined;
          cache.set(key,structuredClone(model));renderProperties();
          if(dockState.visible&&!bufferError)renderGrid();
        }else{propertyView.hide();dockState.hide();}
      }
      if(model&&propertyLocked!==ctx.locked()){
        renderProperties();renderBindings();if(grid)grid.readonly=ctx.locked();
      }
      if(!model)propertyView.hide();
      return;
    }
    observedAuthoring=authoring;
    key = nextKey;
    renamingColumn=undefined;
    target = id;
    part = { kind: "chart" };
    stepState = undefined;
    bufferError = "";
    model = chart?.authoring ? structuredClone(chart.authoring) : undefined;
    const generation = ++selectionGeneration;
    if (!id) {
      propertyView.hide();
      dockState.hide();
      return;
    }
    if (!model) {
      try {
        const inspected = await ctx.inspect();
        if (generation !== selectionGeneration) return;
        if (
          inspected.available &&
          inspected.series.length &&
          inspected.series.every(
            (s) =>
              ["line", "bar", "pie"].includes(s.type) &&
              s.data.every((d) => {
                const v = (d as any)?.value ?? d;
                return v === null || typeof v === "number";
              }),
          )
        ) {
          const next = newChart(
            inspected.series[0].type === "bar"
              ? "column"
              : (inspected.series[0].type as ChartKind),
          );
          next.origin = "native";
          next.appearance.title = inspected.title ?? "";
          next.columns = [
            { id: "label", name: "分类", type: "text" },
            ...inspected.series.map((s, i) => ({
              id: `value_${i}`,
              name: s.name || `系列 ${i + 1}`,
              type: "number" as const,
            })),
          ];
          next.series = inspected.series.map((s, i) => ({
            id: `series_${i}`,
            name: s.name || `系列 ${i + 1}`,
            columnId: `value_${i}`,
            axis: "primary",
            style: {
              color: /^#[\da-f]{6}$/i.test(s.color) ? s.color : "#7c5ce7",
              width: s.width,
              labels: false,
            },
            points: {},
          }));
          next.rows = Array.from(
            { length: Math.max(...inspected.series.map((s) => s.data.length)) },
            (_, i) => ({
              id: `row_${i}`,
              values: {
                label:
                  inspected.labels?.[i] ??
                  String((inspected.series[0].data[i] as any)?.name ?? i + 1),
                ...Object.fromEntries(
                  inspected.series.map((s, j) => {
                    const value = (s.data[i] as any)?.value ?? s.data[i];
                    return [
                      `value_${j}`,
                      typeof value === "number" ? value : null,
                    ];
                  }),
                ),
              },
            }),
          );
          next.bindings = {
            label: "label",
            x: "value_0",
            y: next.columns[2]?.id ?? "value_0",
          };
          model = next;
        }
      } catch {
        /* Non-chart selections have no chart inspector. */
      }
    }
    if (generation !== selectionGeneration) return;
    if(!model)propertyView.hide();
    if (model) {
      cache.set(key, structuredClone(model));
      renderProperties();
      if (dockState.visible) renderGrid();
    } else dockState.hide();
  }
  return {
    render,
    dispose(){
      if(disposed)return;
      disposed=true;sealed=true;selectionGeneration++;lifecycle.abort();gridConnection.dispose();gallery.dispose();importDialog.dispose();dataMenu.dispose();toolbar.dispose();bindingView.dispose();
      propertyView.dispose();dockState.dispose();
      cache.clear();
    },
    changeType: () => openGallery("change"),
    openGallery: () => openGallery("insert"),
    openData,
    selectPart,
    restore(next: ChartAuthoring) {
      if(disposed)return;
      if (JSON.stringify(model) === JSON.stringify(next)) return;
      model = structuredClone(next);
      cache.set(currentKey(), model);
      preview();
      if (
        !panel.contains(document.activeElement) &&
        !dock.contains(document.activeElement)
      ) {
        renderProperties();
        renderGrid();
      }
    },
    async flush() {
      await edits.flush();
      if (bufferError) throw Error(bufferError);
    },
    model: () => model,
    receive(type: string, data: any) {
      if(disposed)return;
      if (type === "chart-title" && data.target === target)
        edit((n) => (n.appearance.title = data.text));
      if (type === "chart-selected" && data.target === target)
        selectPart(data.selection);
      if (type === "chart-exported" && data.url) {
        const a = document.createElement("a");
        a.href = data.url;
        a.download = `图表.${data.format ?? "png"}`;
        a.click();
      }
      if (type === "chart-annotation" && data.target === target)
        edit((n) => {
          Object.assign(
            n.annotations.find((a) => a.id === data.id)!,
            data.patch,
          );
        });
    },
    pending: () => edits.pending(),
    pendingBuffers:()=>buffers.pending(),
    async seal(){sealed=true;await edits.seal();},
  };
}
