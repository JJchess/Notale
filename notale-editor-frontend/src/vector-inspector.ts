type State = {
  active: boolean;
  editing?: boolean;
  sourceEditing?: boolean;
  sourceItems?: { id: string; name: string }[];
  gradientEditing?: boolean;
  processing?: boolean;
  items?: {
    id: string;
    tag: string;
    locked: boolean;
    generated: boolean;
    attributes: Record<string, string>;
    styles: Record<string, string>;
  }[];
};
export function createVectorInspector(
  send: (action: string, data?: Record<string, unknown>) => void,
) {
  const panel = document.createElement("section");
  panel.id = "vector-properties";
  panel.className = "vector-properties";
  panel.hidden = true;
  document.getElementById("object-style")!.prepend(panel);
  let state: State = { active: false };
  const actions: [string, string][] = [
    ["nodes", "编辑顶点"],
    ["text", "编辑文字"],
    ["group", "组合"],
    ["ungroup", "取消组合"],
    ["union", "联合"],
    ["subtract", "相减"],
    ["intersect", "相交"],
    ["exclude", "排除"],
    ["outline", "描边转轮廓"],
    ["flatten", "合并路径"],
    ["split", "拆分路径"],
    ["offset", "偏移路径"],
    ["source", "编辑源形状"],
    ["clip", "设为裁剪"],
    ["mask", "设为蒙版"],
    ["clip-edit", "编辑裁剪边界"],
    ["release", "解除 / 恢复源形状"],
    ["detach", "分离实例"],
    ["export", "导出 SVG"],
  ];
  function button(label: string, action: () => void, disabled = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = label;
    b.disabled = disabled;
    b.onclick = action;
    return b;
  }
  function section(label: string) {
    const d = document.createElement("details");
    d.open = ["图形外观", "文字", "图形操作", "顶点"].includes(label);
    const s = document.createElement("summary");
    s.textContent = label;
    d.append(s);
    panel.append(d);
    return d;
  }
  function field(
    host: HTMLElement,
    label: string,
    property: string,
    kind = "text",
    options?: [string, string][],
  ) {
    const row = document.createElement("label");
    row.className = "vector-field";
    const span = document.createElement("span");
    span.textContent = label;
    row.append(span);
    const values = state.items!.map(
        (n) => n.styles[property] ?? n.attributes[property] ?? "",
      ),
      mixed = new Set(values).size > 1;
    let input: HTMLInputElement | HTMLSelectElement;
    if (options) {
      const s = document.createElement("select");
      for (const [v, l] of options) s.add(new Option(l, v));
      if (mixed) s.add(new Option("混合", ""), 0);
      input = s;
    } else {
      const n = document.createElement("input");
      n.type = kind;
      n.placeholder = mixed ? "混合" : "";
      if (kind === "number") n.step = "any";
      input = n;
    }
    input.setAttribute("aria-label", label);
    input.value = mixed
      ? ""
      : kind === "number"
        ? String(parseFloat(values[0]) || 0)
        : values[0];
    input.onchange = () =>
      send("style", {
        property,
        value:
          input.value +
          (["font-size", "letter-spacing"].includes(property) ? "px" : ""),
      });
    input.disabled = state.items!.some((n) => n.locked || n.generated);
    row.append(input);
    host.append(row);
  }
  function render(next: State) {
    const sameSelection =
      JSON.stringify(state.items?.map((n) => n.id)) ===
      JSON.stringify(next.items?.map((n) => n.id));
    state = next;
    panel.hidden = !state.active;
    if (!next.active) return;
    if (
      sameSelection &&
      panel.contains(document.activeElement) &&
      document.activeElement?.matches("input,select,textarea")
    )
      return;
    const open = new Set(
      [...panel.querySelectorAll("details[open] summary")].map(
        (n) => n.textContent,
      ),
    );
    panel.replaceChildren();
    const items = state.items ?? [];
    if (!items.length) return;
    const disabled =
      items.some((n) => n.locked || n.generated) || state.processing;
    if (state.gradientEditing)
      panel.append(button("完成渐变编辑", () => send("exit")));
    if (state.sourceEditing) {
      for (const item of state.sourceItems ?? [])
        panel.append(
          button(
            item.name,
            () => send("source", { id: item.id }),
            !!state.processing,
          ),
        );
      panel.append(button("完成源形状编辑", () => send("finish-source")));
    }
    if (state.processing)
      panel.append(button("取消计算", () => send("cancel")));
    if (items.some((n) => n.generated)) {
      const note = document.createElement("p");
      note.textContent = "此图形由互动组件生成，请通过组件参数编辑。";
      panel.append(
        note,
        button("创建可编辑副本", () => send("snapshot")),
      );
    }
    if (items.length === 1) {
      const geometry: Record<string, [string, string][]> = {
        rect: [
          ["x", "X"],
          ["y", "Y"],
          ["width", "宽"],
          ["height", "高"],
          ["rx", "圆角"],
        ],
        circle: [
          ["cx", "中心 X"],
          ["cy", "中心 Y"],
          ["r", "半径"],
        ],
        ellipse: [
          ["cx", "中心 X"],
          ["cy", "中心 Y"],
          ["rx", "水平半径"],
          ["ry", "垂直半径"],
        ],
        line: [
          ["x1", "起点 X"],
          ["y1", "起点 Y"],
          ["x2", "终点 X"],
          ["y2", "终点 Y"],
        ],
        textPath: [["startOffset", "路径起始偏移"]],
      };
      const fields = geometry[items[0].tag];
      if (fields) {
        const shape = section("形状");
        for (const [property, label] of fields) {
          const row = document.createElement("label");
          row.className = "vector-field";
          const name = document.createElement("span");
          name.textContent = label;
          const input = document.createElement("input");
          input.type = property === "startOffset" ? "text" : "number";
          input.value = items[0].attributes[property] ?? "0";
          input.setAttribute("aria-label", label);
          input.disabled = !!disabled;
          input.onchange = () =>
            send("attribute", { property, value: input.value });
          row.append(name, input);
          shape.append(row);
        }
      }
    }
    const basic = section("图形外观");
    field(basic, "填充", "fill");
    field(basic, "描边", "stroke");
    field(basic, "描边宽度", "stroke-width", "number");
    field(basic, "透明度", "opacity", "number");
    field(basic, "虚线", "stroke-dasharray");
    field(basic, "端点", "stroke-linecap", "text", [
      ["butt", "平头"],
      ["round", "圆头"],
      ["square", "方头"],
    ]);
    field(basic, "连接", "stroke-linejoin", "text", [
      ["miter", "尖角"],
      ["round", "圆角"],
      ["bevel", "斜角"],
    ]);
    field(basic, "混合", "mix-blend-mode", "text", [
      ["normal", "正常"],
      ["multiply", "正片叠底"],
      ["screen", "滤色"],
      ["overlay", "叠加"],
      ["darken", "变暗"],
      ["lighten", "变亮"],
    ]);
    if (items.some((n) => ["text", "tspan", "textPath"].includes(n.tag))) {
      const text = section("文字");
      field(text, "字体", "font-family");
      field(text, "字号", "font-size", "number");
      field(text, "字距", "letter-spacing", "number");
      field(text, "对齐", "text-anchor", "text", [
        ["start", "左"],
        ["middle", "中"],
        ["end", "右"],
      ]);
      text.append(
        button("粗体", () =>
          send("style", {
            property: "font-weight",
            value: items[0].styles["font-weight"] === "700" ? "400" : "700",
          }),
        ),
        button("斜体", () =>
          send("style", { property: "font-style", value: "italic" }),
        ),
        button("横排", () =>
          send("style", { property: "writing-mode", value: "horizontal-tb" }),
        ),
        button("竖排", () =>
          send("style", { property: "writing-mode", value: "vertical-rl" }),
        ),
      );
    }
    if (items.length === 1 && items[0].tag === "text") {
      const outline = section("文字转轮廓");
      const font = document.createElement("input");
      font.type = "file";
      font.accept = ".ttf,.otf,.woff,.woff2";
      font.setAttribute("aria-label", "选择此文字使用的字体文件");
      font.disabled = !!disabled;
      const note = document.createElement("p");
      note.textContent = "选择文字实际使用的字体文件，转换后可编辑顶点。";
      font.onchange = () => {
        const file = font.files?.[0];
        if (file)
          void file
            .arrayBuffer()
            .then((font) => send("text-outline", { font }));
      };
      outline.append(note, font);
    }
    const image = section("图片填充");
    const imageFile = document.createElement("input");
    imageFile.type = "file";
    imageFile.accept = "image/png,image/jpeg,image/webp";
    imageFile.setAttribute("aria-label", "选择填充图片");
    imageFile.disabled = !!disabled;
    imageFile.onchange = () => {
      const file = imageFile.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => send("pattern", { href: reader.result });
        reader.readAsDataURL(file);
      }
    };
    image.append(imageFile);
    const gradient = section("渐变");
    const colors = document.createElement("div");
    colors.className = "vector-row";
    const a = document.createElement("input"),
      b = document.createElement("input");
    a.type = b.type = "color";
    a.value = "#8b5cf6";
    b.value = "#38bdf8";
    a.setAttribute("aria-label", "起始颜色");
    b.setAttribute("aria-label", "结束颜色");
    const stops = [a, b];
    colors.append(a, b);
    gradient.append(
      colors,
      button(
        "添加色标",
        () => {
          const color = document.createElement("input");
          color.type = "color";
          color.value = "#ffffff";
          color.setAttribute("aria-label", "渐变色标 " + (stops.length + 1));
          stops.splice(stops.length - 1, 0, color);
          colors.insertBefore(color, b);
        },
        !!disabled,
      ),
    );
    for (const [k, label] of [
      ["linear", "线性渐变"],
      ["radial", "径向渐变"],
    ])
      gradient.append(
        button(
          label,
          () =>
            send("gradient", {
              kind: k,
              stops: stops.map((color, i) => ({
                offset: i / (stops.length - 1),
                color: color.value,
              })),
            }),
          !!disabled,
        ),
      );
    basic.append(
      button("起点箭头", () => send("arrow", { end: "start" }), !!disabled),
      button("终点箭头", () => send("arrow", { end: "end" }), !!disabled),
      button(
        "清除箭头",
        () => {
          send("style", { property: "marker-start", value: "none" });
          send("style", { property: "marker-end", value: "none" });
        },
        !!disabled,
      ),
    );
    gradient.append(
      button(
        "在画布上编辑渐变",
        () => send("gradient-handles"),
        !!disabled ||
          items.length !== 1 ||
          !items[0].styles.fill?.includes("url("),
      ),
    );
    const fx = section("效果");
    for (const [k, label] of [
      ["shadow", "阴影"],
      ["blur", "模糊"],
    ])
      fx.append(
        button(label, () => send("effect", { kind: k, value: 5 }), !!disabled),
      );
    fx.append(
      button(
        "清除效果",
        () => send("style", { property: "filter", value: "none" }),
        !!disabled,
      ),
    );
    const path = section(state.editing ? "顶点" : "图形操作");
    if (state.editing) {
      for (const [k, l] of [
        ["corner", "尖角"],
        ["smooth", "平滑"],
        ["symmetric", "对称"],
        ["close", "开合路径"],
        ["reverse", "反向"],
        ["simplify", "简化"],
        ["break", "断开"],
        ["join", "连接端点"],
        ["delete", "删除顶点"],
      ])
        path.append(button(l, () => send("node", { action: k })));
      const amount = document.createElement("input");
      amount.type = "number";
      amount.value = "15";
      amount.setAttribute("aria-label", "顶点旋转角度");
      path.append(
        amount,
        button("旋转顶点", () =>
          send("node", { action: "rotate", value: Number(amount.value) }),
        ),
        button("放大顶点选区", () =>
          send("node", { action: "scale", value: 1.1 }),
        ),
        button("缩小顶点选区", () =>
          send("node", { action: "scale", value: 1 / 1.1 }),
        ),
      );
      path.append(button("完成", () => send("exit")));
    } else
      for (const [k, label] of actions) {
        const shape = items.every((n) =>
          [
            "path",
            "rect",
            "circle",
            "ellipse",
            "line",
            "polyline",
            "polygon",
          ].includes(n.tag),
        );
        const invalid =
          (k === "nodes" && !shape) ||
          (k === "text" &&
            !items.some((n) =>
              ["text", "tspan", "textPath"].includes(n.tag),
            )) ||
          ([
            "union",
            "subtract",
            "intersect",
            "exclude",
            "clip",
            "mask",
            "group",
          ].includes(k) &&
            items.length < 2) ||
          (k === "detach" && items[0].tag !== "use") ||
          (k === "clip-edit" &&
            !items[0].attributes["clip-path"] &&
            !items[0].attributes.mask) ||
          (k === "source" &&
            !items[0].attributes["data-notale-vector-operation"]) ||
          (k === "ungroup" && items[0].tag !== "g") ||
          (["split", "offset"].includes(k) && !shape) ||
          (["outline", "flatten"].includes(k) && !shape);
        path.append(
          button(
            label,
            () => send(k, k === "offset" ? { amount: 10 } : {}),
            !!disabled || invalid,
          ),
        );
      }
    const draw = section("在图中绘制");
    for (const [k, l] of [
      ["rect", "矩形"],
      ["ellipse", "椭圆"],
      ["line", "直线"],
      ["polygon", "多边形"],
      ["star", "星形"],
      ["arrow", "箭头"],
      ["arc", "圆弧"],
      ["pen", "钢笔"],
      ["pencil", "自由曲线"],
    ])
      draw.append(button(l, () => send("draw", { kind: k }), !!disabled));
    for (const detail of panel.querySelectorAll("details"))
      if (open.has(detail.querySelector("summary")!.textContent))
        detail.open = true;
  }
  return {
    render,
    get active() {
      return state.active;
    },
    get editing() {
      return !!state.editing;
    },
  };
}
