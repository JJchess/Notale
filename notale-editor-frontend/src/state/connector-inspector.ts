import {
  connectorSchema,
  type Command,
  type Slide,
} from "@notale/editor/browser";
type Connector = Slide["connectors"][number];
export interface EndpointDraft {
  target: string;
  anchor: string;
  x: string;
  y: string;
}
export interface ConnectorDraft {
  start: EndpointDraft;
  end: EndpointDraft;
  kind: string;
  color: string;
  width: string;
  dash: string;
  startArrow: boolean;
  endArrow: boolean;
}
interface Source {
  documentId: string;
  pageId: string;
  width: number;
  height: number;
  connector?: Connector;
  options: { value: string; label: string }[];
}
interface Model {
  scope: string;
  draft?: ConnectorDraft;
  options: Source["options"];
  busy: boolean;
  error: string;
  change?: (patch: Partial<ConnectorDraft>) => void;
  save?: () => Promise<void>;
}
const initial: Model = { scope: "", options: [], busy: false, error: "" };
let model = initial,
  owner: symbol | undefined;
const listeners = new Set<() => void>();
export const connectorInspectorState = {
  getSnapshot: () => model,
  getServerSnapshot: () => initial,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
const scopeOf = (s: Source) =>
  JSON.stringify([s.documentId, s.pageId, s.connector?.id]);
function draftOf(s: Source): ConnectorDraft | undefined {
  const c = s.connector;
  if (!c) return;
  const endpoint = (side: "start" | "end") => ({
    target: c[side].target ?? "",
    anchor: c[side].anchor ?? "auto",
    x: String(c[side].point?.x ?? s.width / 2),
    y: String(c[side].point?.y ?? s.height / 2),
  });
  return {
    start: endpoint("start"),
    end: endpoint("end"),
    kind: c.kind,
    color: c.color,
    width: String(c.width),
    dash: c.dash,
    startArrow: c.startArrow,
    endArrow: c.endArrow,
  };
}
export function connectorFromDraft(
  original: Connector,
  draft: ConnectorDraft,
  targets: string[],
) {
  const number = (value: string) => {
    if (!value.trim() || !Number.isFinite(Number(value)))
      throw Error("请输入有效的坐标和线宽");
    return Number(value);
  };
  const endpoint = (side: "start" | "end") => {
    const value = draft[side];
    if (value.target) {
      if (!targets.includes(value.target))
        throw Error("端点对象已不存在，请重新选择");
      return { target: value.target, anchor: value.anchor };
    }
    return { point: { x: number(value.x), y: number(value.y) } };
  };
  return connectorSchema.parse({
    ...original,
    ...draft,
    width: number(draft.width),
    start: endpoint("start"),
    end: endpoint("end"),
  });
}
export function createConnectorInspector(context: {
  source: () => Source;
  commands: (commands: Command[]) => Promise<unknown>;
}) {
  const token = Symbol();
  owner = token;
  let current = initial,
    baseline = "",
    draftBaseline = "",
    session = 0;
  function publish(next: Model) {
    if (owner !== token) return;
    current = next;
    model = next;
    listeners.forEach((fn) => fn());
  }
  function render() {
    if (owner !== token) return;
    const source = context.source(),
      scope = scopeOf(source),
      changed = scope !== current.scope,
      pristine = JSON.stringify(current.draft) === draftBaseline;
    if (changed) session++;
    const capturedSession = session;
    let draft = current.draft;
    if (changed || pristine) {
      draft = draftOf(source);
      baseline = JSON.stringify(source.connector);
      draftBaseline = JSON.stringify(draft);
    }
    const valid = () =>
      owner === token &&
      capturedSession === session &&
      scope === scopeOf(context.source());
    publish({
      scope,
      draft,
      options: source.options,
      busy: changed ? false : current.busy,
      error: changed ? "" : current.error,
      change: (patch) => {
        if (!valid() || current.busy || !current.draft) return;
        publish({
          ...current,
          draft: { ...current.draft, ...structuredClone(patch) },
          error: "",
        });
      },
      save: async () => {
        if (!valid() || current.busy || !current.draft) return;
        publish({ ...current, busy: true, error: "" });
        try {
          const latest = context.source();
          if (!latest.connector) throw Error("请选择连接线");
          if (JSON.stringify(latest.connector) !== baseline)
            throw Error("连接线已变化，输入已保留，请重新选择后核对");
          const connector = connectorFromDraft(
            latest.connector,
            current.draft,
            latest.options.map((option) => option.value),
          );
          await context.commands([
            { type: "connector.set", slideId: latest.pageId, connector },
          ]);
          if (valid()) {
            baseline = JSON.stringify(connector);
            draftBaseline = JSON.stringify(current.draft);
          }
        } catch (cause) {
          if (valid())
            publish({
              ...current,
              error: cause instanceof Error ? cause.message : String(cause),
            });
        } finally {
          if (valid()) publish({ ...current, busy: false });
        }
      },
    });
  }
  return {
    render,
    dispose() {
      if (owner !== token) return;
      publish(initial);
      owner = undefined;
    },
  };
}
