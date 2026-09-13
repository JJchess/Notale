import { mediaSettingsSchema, type Command } from "@notale/editor/browser";
import { readMediaSettings, mediaGeometryCapabilities } from "./media-settings";
export interface MediaObject {
  id: string;
  tag: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  locked?: boolean;
}
interface Source {
  documentId: string;
  pageId: string;
  object?: MediaObject;
}
export interface MediaDraft {
  alt: string;
  fit: string;
  positionX: string;
  positionY: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  startAt: string;
  endAt: string;
  volume: string;
  rate: string;
  startStep: string;
  muted: boolean;
  loop: boolean;
  controls: boolean;
}
interface Model {
  scope: string;
  tag: string;
  draft?: MediaDraft;
  busy: boolean;
  locked: boolean;
  customPosition: boolean;
  customCrop: boolean;
  notice: string;
  error: string;
  change?: (patch: Partial<MediaDraft>) => void;
  save?: () => Promise<void>;
  replace?: (poster: boolean) => void;
}
const initial: Model = {
  scope: "",
  tag: "",
  busy: false,
  locked: false,
  customPosition: false,
  customCrop: false,
  notice: "",
  error: "",
};
let model = initial,
  owner: symbol | undefined;
const listeners = new Set<() => void>();
export const mediaInspectorState = {
  getSnapshot: () => model,
  getServerSnapshot: () => initial,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
const sourceKey = (s: Source) =>
  JSON.stringify([s.documentId, s.pageId, s.object?.id]);
const mediaKey = (o?: MediaObject) =>
  JSON.stringify(
    o && [
      o.tag,
      o.attributes.src,
      o.attributes.alt,
      o.attributes["data-notale-media"],
      o.style["object-fit"],
      o.style["object-position"],
      o.style["clip-path"],
      o.attributes.controls,
      o.attributes.muted,
      o.attributes.loop,
    ],
  );
export function mediaDraft(object: MediaObject): MediaDraft {
  const a = object.attributes,
    m = readMediaSettings(object);
  return {
    alt: a.alt ?? "",
    fit: m.fit,
    positionX: String(m.positionX),
    positionY: String(m.positionY),
    top: String(m.crop.top),
    right: String(m.crop.right),
    bottom: String(m.crop.bottom),
    left: String(m.crop.left),
    startAt: String(m.startAt),
    endAt: m.endAt === null ? "" : String(m.endAt),
    volume: String(Number((m.volume * 100).toFixed(6))),
    rate: String(m.rate),
    startStep: m.startStep === null ? "" : String(m.startStep),
    muted: m.muted,
    loop: m.loop,
    controls: m.controls,
  };
}
const mediaLabels: Partial<Record<keyof MediaDraft, string>> = {
  positionX: "水平焦点",
  positionY: "垂直焦点",
  top: "上边裁切",
  right: "右边裁切",
  bottom: "下边裁切",
  left: "左边裁切",
  startAt: "开始时间",
  endAt: "结束时间",
  volume: "音量",
  rate: "播放速度",
  startStep: "开始步骤",
};
export function mediaDraftPatch(draft: MediaDraft) {
  const number = (key: keyof MediaDraft) => {
    const value = String(draft[key]);
    if (!value.trim() || !Number.isFinite(Number(value)))
      throw Error(`${mediaLabels[key] ?? "媒体参数"}需要填写有效数值`);
    return Number(value);
  };
  const result = mediaSettingsSchema.safeParse({
    fit: draft.fit,
    positionX: number("positionX"),
    positionY: number("positionY"),
    crop: {
      top: number("top"),
      right: number("right"),
      bottom: number("bottom"),
      left: number("left"),
    },
    startAt: number("startAt"),
    endAt: draft.endAt.trim() ? number("endAt") : null,
    volume: number("volume") / 100,
    rate: number("rate"),
    startStep: draft.startStep.trim() ? number("startStep") : null,
    muted: draft.muted,
    loop: draft.loop,
    controls: draft.controls,
  });
  if (!result.success) {
    const issue = result.error.issues[0],
      field = String(issue.path.at(-1) ?? "");
    const messages: Record<string, string> = {
      crop: "裁切后需要保留可见区域",
      positionX: "水平焦点应在 0–100% 之间",
      positionY: "垂直焦点应在 0–100% 之间",
      top: "上边裁切应在 0–99% 之间",
      right: "右边裁切应在 0–99% 之间",
      bottom: "下边裁切应在 0–99% 之间",
      left: "左边裁切应在 0–99% 之间",
      startAt: "开始时间应在 0–86400 秒之间",
      endAt: "结束时间应大于 0 且不超过 86400 秒",
      volume: "音量应在 0–100% 之间",
      rate: "播放速度应在 0.25–4 倍之间",
      startStep: "开始步骤应为 0–500 的整数",
      fit: "请选择有效的取景方式",
    };
    throw Error(messages[field] ?? "结束时间需要晚于开始时间");
  }
  return { alt: draft.alt, settings: result.data };
}

/** Submit only edited fields so imported CSS and unexposed settings survive. */
export function mediaDraftChanges(draft: MediaDraft, baseline: MediaDraft) {
  const next = mediaDraftPatch(draft);
  const before = mediaDraftPatch(baseline);
  const settings = Object.fromEntries(
    Object.entries(next.settings).filter(
      ([key, value]) =>
        JSON.stringify(value) !==
        JSON.stringify(before.settings[key as keyof typeof before.settings]),
    ),
  ) as Partial<typeof next.settings>;
  if (settings.positionX !== undefined || settings.positionY !== undefined) {
    settings.positionX = next.settings.positionX;
    settings.positionY = next.settings.positionY;
  }
  return {
    ...(next.alt !== before.alt ? { alt: next.alt } : {}),
    ...(Object.keys(settings).length ? { settings } : {}),
  };
}

export function createMediaInspector(context: {
  source: () => Source;
  commands: (commands: Command[]) => Promise<unknown>;
  replace: (object: MediaObject, poster: boolean) => void;
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
      object = source.object,
      scope = sourceKey(source),
      changed = scope !== current.scope;
    let draft = current.draft,
      error = changed ? "" : current.error;
    if (changed) session++;
    const capturedSession = session;
    if (changed || JSON.stringify(draft) === draftBaseline) {
      try {
        draft = object ? mediaDraft(object) : undefined;
        baseline = mediaKey(object);
        draftBaseline = JSON.stringify(draft);
      } catch (cause) {
        draft = undefined;
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    const valid = () =>
      owner === token &&
      capturedSession === session &&
      scope === sourceKey(context.source());
    publish({
      scope,
      tag: object?.tag ?? "",
      draft,
      busy: changed ? false : current.busy,
      locked: !!object?.locked,
      customPosition: !!object && !mediaGeometryCapabilities(object).position,
      customCrop: !!object && !mediaGeometryCapabilities(object).crop,
      notice: changed ? "" : current.notice,
      error,
      change: (patch) => {
        if (valid() && !current.busy && !current.locked && current.draft)
          publish({
            ...current,
            draft: { ...current.draft, ...patch },
            error: "",
          });
      },
      replace: (poster) => {
        if (!valid() || current.busy || current.locked) return;
        const object = context.source().object;
        if (object && (!poster || object.tag === "video"))
          context.replace(object, poster);
      },
      save: async () => {
        if (
          !valid() ||
          current.busy ||
          current.locked ||
          !current.draft ||
          JSON.stringify(current.draft) === draftBaseline
        )
          return;
        publish({ ...current, busy: true, error: "" });
        try {
          const latest = context.source(),
            object = latest.object;
          if (!object || object.locked) throw Error("媒体不存在或已锁定");
          if (mediaKey(object) !== baseline)
            throw Error("媒体设置已变化，输入已保留，请重新选择后核对");
          const patch = mediaDraftChanges(
            current.draft,
            JSON.parse(draftBaseline),
          );
          if (!Object.keys(patch).length) return;
          const capability = mediaGeometryCapabilities(object);
          if (
            (!capability.position && patch.settings?.positionX !== undefined) ||
            (!capability.crop && patch.settings?.crop !== undefined)
          )
            throw Error("当前取景使用自定义样式，暂不支持百分比编辑");
          await context.commands([
            {
              type: "media.update",
              slideId: latest.pageId,
              target: object.id,
              patch,
            },
          ]);
          if (valid()) {
            baseline = mediaKey(context.source().object);
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
    notice(message: string) {
      if (owner === token) publish({ ...current, notice: message });
    },
    dispose() {
      if (owner === token) {
        publish(initial);
        owner = undefined;
      }
    },
  };
}
