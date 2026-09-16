import { commitSchema, type AnimationSpec } from "@notale/editor/browser";
const initial = {
  effect: "fade-in",
  "animation-step": "1",
  duration: "0.6",
  delay: "0",
  trigger: "click",
  "trigger-target": "",
  dx: "-120",
  dy: "0",
  easing: "ease-out",
  "animation-repeat": "1",
  "effect-direction": "left",
  keyframes: '[{"opacity":0,"offset":0},{"opacity":1,"offset":1}]',
};
export type AnimationField = keyof typeof initial;
/** Authoring values retain text drafts; conversion to the document protocol happens once. */
export class AnimationDraft {
  private values: Record<AnimationField, string> = { ...initial };
  private reversed = false;
  formFocused = false;
  focused: AnimationField | undefined;
  focus(field: AnimationField | undefined) {
    this.focused = field;
  }
  private revision = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.revision;
  getServerSnapshot = () => 0;
  private emit() {
    this.revision++;
    this.listeners.forEach((listener) => listener());
  }
  get reverse() {
    return this.reversed;
  }
  set reverse(value: boolean) {
    if (value !== this.reversed) {
      this.reversed = value;
      this.emit();
    }
  }
  has(id: string): id is AnimationField {
    return Object.hasOwn(initial, id);
  }
  get(id: AnimationField) {
    return this.values[id];
  }
  set(id: AnimationField, value: unknown) {
    const next = String(value ?? "");
    if (next !== this.values[id]) {
      this.values = { ...this.values, [id]: next };
      this.emit();
    }
  }
  read(
    id: string,
    target: string,
    path: { x: number; y: number }[],
    chartStateId?: string,
  ): AnimationSpec {
    const value = this.values;
    const numeric = (field: AnimationField) => {
      if (!value[field].trim() || !Number.isFinite(Number(value[field])))
        throw Error("动画参数必须为有效数字");
      return Number(value[field]);
    };
    const command = commitSchema.shape.commands.element.parse({
      type: "animation.set",
      slideId: "draft",
      animation: {
        id,
        target,
        effect: value.effect,
        step: numeric("animation-step"),
        duration: Math.round(numeric("duration") * 1000),
        delay: Math.round(numeric("delay") * 1000),
        trigger: value.trigger,
        ...(value.trigger === "object"
          ? { triggerTarget: value["trigger-target"] }
          : {}),
        dx: numeric("dx"),
        dy: numeric("dy"),
        easing: value.easing,
        repeat: numeric("animation-repeat"),
        autoReverse: this.reverse,
        effectDirection: value["effect-direction"],
        ...(value.effect === "motion" ? { path } : {}),
        ...(value.effect === "custom"
          ? { keyframes: JSON.parse(value.keyframes) }
          : {}),
        ...(value.effect === "chart-state" ? { chartStateId } : {}),
      },
    });
    if (command.type !== "animation.set") throw Error("动画命令类型无效");
    return command.animation;
  }
}

/** Apply explicit form intent to the latest cue instead of replaying stale form values. */
export function editAnimationField(
  current: AnimationSpec,
  incoming: AnimationSpec,
  field: string,
): AnimationSpec {
  if (
    ["path", "keyframes", "effect-direction", "dx", "dy"].includes(field) &&
    current.effect !== incoming.effect
  )
    throw Error("动画效果已变化，请重新选择后编辑");
  if (field === "effect")
    return { ...incoming, id: current.id, target: current.target };
  const fields: Record<string, readonly (keyof AnimationSpec)[]> = {
    duration: ["duration"],
    delay: ["delay"],
    "animation-step": ["step"],
    trigger: ["trigger", "triggerTarget", "step"],
    "trigger-target": ["triggerTarget"],
    dx: ["dx"],
    dy: ["dy"],
    easing: ["easing"],
    "animation-repeat": ["repeat"],
    "animation-reverse": ["autoReverse"],
    "effect-direction": ["effectDirection", "dx", "dy"],
    keyframes: ["keyframes"],
    path: ["path"],
  };
  const keys = fields[field];
  if (!keys) throw Error("不支持的动画参数");
  const next = structuredClone(current);
  for (const key of keys) {
    const value = incoming[key];
    if (value === undefined) Reflect.deleteProperty(next, key);
    else Reflect.set(next, key, structuredClone(value));
  }
  return next;
}

export function animationDraftFields(animation:AnimationSpec):Record<AnimationField,string>{
 return {effect:animation.effect,'animation-step':String(animation.step),duration:String(animation.duration/1000),delay:String(animation.delay/1000),trigger:animation.trigger,'trigger-target':animation.triggerTarget??'',dx:String(animation.dx),dy:String(animation.dy),easing:animation.easing,'animation-repeat':String(animation.repeat??1),'effect-direction':animation.effectDirection??'left',keyframes:JSON.stringify(animation.keyframes??[{opacity:0,offset:0},{opacity:1,offset:1}],null,2)};
}
