import type { Command, Snapshot } from "@notale/editor/browser";
export interface NotesModel {
  session: symbol;
  key: string;
  documentId: string;
  pageId: string;
  baseline: string;
  value: string;
  dirty: boolean;
  busy: boolean;
  error: string;
  conflict?: string;
}
interface Context {
  snapshot: () => Snapshot | undefined;
  pageId: () => string;
  subscribe: (listener: () => void) => () => void;
  commands: (commands: Command[]) => Promise<unknown>;
  present: () => Promise<unknown>;
  canAutosave?: () => boolean;
}
const loaded = new Set<string>();
const drafts = new Map<string, { baseline: string; value: string }>();
let model: NotesModel | undefined, owner: symbol | undefined;
const listeners = new Set<() => void>();
export const notesState = {
  getSnapshot: () => model,
  getServerSnapshot: () => undefined,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
function publish(next: NotesModel | undefined) {
  model = next;
  listeners.forEach((listener) => listener());
}
class NotesChangedError extends Error {}
export const notesActions = {
  composing: (_source: NotesModel, _active: boolean) => {},
  edit: (_source: NotesModel, _value: string) => {},
  save: async (_source: NotesModel) => {},
  present: async () => {},
  resolve: async (_source: NotesModel, _keepMine: boolean) => {},
};
export function bindNotesEditor(context: Context) {
  const token = Symbol();
  owner = token;
  let signature = "";
  const saves = new Set<Promise<void>>();
  const pendingKeys = new Set<string>();
  let flushing: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let composingKey: string | undefined;
  function cancelAutosave() { clearTimeout(timer); timer = undefined; }
  function scheduleAutosave() {
    cancelAutosave();
    if (owner !== token || composingKey) return;
    const doc = context.snapshot()?.document;
    if (!doc?.slides.some(page => drafts.has(JSON.stringify([doc.id, page.id])))) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (owner !== token || composingKey) return;
      if (context.canAutosave && !context.canAutosave()) { scheduleAutosave(); return; }
      void flushOnce().catch(cause => {
        if (owner !== token) return;
        if (cause instanceof NotesChangedError) scheduleAutosave();
        else if (model) publish({...model, error: cause instanceof Error ? cause.message : String(cause)});
      });
    }, 650);
  }
  function flushOnce() {
    cancelAutosave();
    if (!flushing) {
      flushing = flush();
      void flushing.then(() => { flushing = undefined; }, () => { flushing = undefined; });
    }
    return flushing;
  }
  function readDraft(key: string) {
    if (loaded.has(key) || typeof localStorage === "undefined") return;
    const raw = localStorage.getItem("notale-notes-draft:" + key);
    if (raw) {
      const draft = JSON.parse(raw);
      if (typeof draft.baseline !== "string" || typeof draft.value !== "string")
        throw Error("Invalid notes draft");
      drafts.set(key, draft);
    }
    loaded.add(key);
  }

  function refresh() {
    if (owner !== token) return;
    const doc = context.snapshot()?.document,
      page = doc?.slides.find((page) => page.id === context.pageId());
    if (!doc || !page) {
      publish(undefined);
      return;
    }
    const key = JSON.stringify([doc.id, page.id]),
      nextSignature = JSON.stringify([key, page.notes]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    let storageError = "";
    try {
      readDraft(key);
    } catch {
      storageError = "无法读取本机备注草稿，请暂勿关闭原编辑页面";
    }
    const draft = drafts.get(key);
    if (composingKey && composingKey !== key) composingKey = undefined;
    const conflict = draft && !pendingKeys.has(key) && page.notes !== draft.baseline && page.notes !== draft.value ? page.notes : undefined;
    publish({
      session: token,
      key,
      documentId: doc.id,
      pageId: page.id,
      baseline: draft?.baseline ?? page.notes,
      value: draft?.value ?? page.notes,
      dirty: !!draft,
      busy: pendingKeys.has(key),
      conflict,
      error: storageError || (conflict !== undefined ? "备注已被其他修改更新，请选择保留哪份内容" : model?.key === key ? model.error : ""),
    });
  }
  function persist(source: NotesModel) {
    loaded.add(source.key);
    try {
      if (typeof localStorage !== "undefined") {
        if (source.dirty)
          localStorage.setItem(
            "notale-notes-draft:" + source.key,
            JSON.stringify({ baseline: source.baseline, value: source.value }),
          );
        else localStorage.removeItem("notale-notes-draft:" + source.key);
      }
    } catch {
      source.error = "备注草稿暂时无法写入本机，请保存后再关闭页面";
    }
  }
  function active(source: NotesModel) {
    if (
      owner !== token ||
      source.session !== token ||
      model?.key !== source.key
    )
      throw Error("页面已切换，备注草稿已保留");
  }
  notesActions.composing = (source, isActive) => {
    active(source);
    composingKey = isActive ? source.key : undefined;
    if (isActive) cancelAutosave(); else scheduleAutosave();
  };
  notesActions.edit = (source, value) => {
    active(source);
    const page = context
      .snapshot()
      ?.document.slides.find((page) => page.id === source.pageId);
    // An in-flight save may still replace the baseline; keep edits until it settles.
    const dirty =
      pendingKeys.has(source.key) || !!model!.busy || value !== page?.notes;
    const next = {
      ...model!,
      value,
      dirty,
      error: "",
      ...(dirty ? {} : { baseline: value, conflict: undefined }),
    };
    if (dirty) drafts.set(next.key, { baseline: next.baseline, value });
    else drafts.delete(next.key);
    persist(next);
    publish(next);
    scheduleAutosave();
  };
  async function save(source: NotesModel) {
    active(source);
    if (model!.busy || pendingKeys.has(source.key)) return;
    if (model!.value !== source.value)
      throw Error("备注输入已变化，请重新保存");
    const current = context.snapshot()?.document,
      page = current?.slides.find((page) => page.id === source.pageId);
    if (current?.id !== source.documentId || !page)
      throw Error("备注页面已不存在");
    if (page.notes !== source.baseline && page.notes !== source.value) {
      publish({
        ...model!,
        conflict: page.notes,
        error: "备注已被其他修改更新，请选择保留哪份内容",
      });
      return;
    }
    pendingKeys.add(source.key);
    publish({ ...model!, busy: true, error: "", conflict: undefined });
    try {
      if (page.notes !== source.value)
        await context.commands([
          {
            type: "slide.update",
            slideId: source.pageId,
            patch: { notes: source.value },
          },
        ]);
      const retained = drafts.get(source.key);
      if (retained?.value === source.value) {
        drafts.delete(source.key);
        const next = {
          ...source,
          baseline: source.value,
          dirty: false,
          busy: false,
          error: "",
        };
        persist(next);
        if (owner === token && model?.key === source.key) publish(next);
      } else if (retained) {
        retained.baseline = source.value;
        const next = {
          ...source,
          baseline: source.value,
          value: retained.value,
          dirty: true,
          busy: false,
          error: "",
        };
        persist(next);
        if (owner === token && model?.key === source.key) publish(next);
      }
    } catch (cause) {
      if (owner === token && model?.key === source.key)
        publish({
          ...model,
          busy: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
    } finally {
      pendingKeys.delete(source.key);
      if (owner === token && model?.key === source.key && model.busy)
        publish({ ...model, busy: false });
    }
  }
  notesActions.save = (source) => {
    const pending = save(source);
    saves.add(pending);
    void pending.then(
      () => saves.delete(pending),
      () => saves.delete(pending),
    );
    return pending;
  };
  notesActions.resolve = async (source, keepMine) => {
    active(source);
    const doc = context.snapshot()?.document,
      page = doc?.slides.find((page) => page.id === source.pageId);
    if (doc?.id !== source.documentId || !page) throw Error("备注页面已不存在");
    const next = {
      ...model!,
      baseline: page.notes,
      value: keepMine ? model!.value : page.notes,
      dirty: keepMine,
      error: "",
      conflict: undefined,
    };
    if (keepMine)
      drafts.set(next.key, { baseline: next.baseline, value: next.value });
    else drafts.delete(next.key);
    persist(next);
    publish(next);
    if (keepMine) await notesActions.save(next);
    scheduleAutosave();
  };
  notesActions.present = async () => {
    if (owner === token) await context.present();
  };
  async function flush() {
    const documentId = context.snapshot()?.document.id;
    const assertDocument = () => {
      if (owner !== token || context.snapshot()?.document.id !== documentId)
        throw Error("讲义已切换，请重试当前操作");
    };
    assertDocument();
    while (saves.size) {
      await Promise.all([...saves]);
      assertDocument();
    }
    const doc = context.snapshot()?.document;
    if (!doc) return;
    const captured: NotesModel[] = [];
    for (const [index, page] of doc.slides.entries()) {
      const key = JSON.stringify([doc.id, page.id]);
      try {
        readDraft(key);
      } catch {
        throw Error(`第 ${index + 1} 页备注草稿无法读取，请检查后重试`);
      }
      const draft = drafts.get(key);
      if (!draft) continue;
      if (page.notes !== draft.baseline && page.notes !== draft.value) {
        const message = `第 ${index + 1} 页备注存在冲突，请在该页备注中选择保留的内容`;
        if (model?.key === key)
          publish({ ...model, conflict: page.notes, error: message });
        throw Error(message);
      }
      captured.push({
        session: token,
        key,
        documentId: doc.id,
        pageId: page.id,
        ...draft,
        dirty: true,
        busy: false,
        error: "",
      });
    }
    const changes: Command[] = captured
      .filter(
        (source) =>
          doc.slides.find((page) => page.id === source.pageId)!.notes !==
          source.value,
      )
      .map((source) => ({
        type: "slide.update",
        slideId: source.pageId,
        patch: { notes: source.value },
      }));
    for (const source of captured) pendingKeys.add(source.key);
    const current = captured.find((source) => source.key === model?.key);
    if (current && model) publish({ ...model, busy: true, error: "" });
    try {
      if (changes.length) await context.commands(changes);
      for (const source of captured) {
        const retained = drafts.get(source.key);
        if (!retained) continue;
        const dirty = retained.value !== source.value;
        const next = {
          ...source,
          baseline: source.value,
          value: retained.value,
          dirty,
          busy: false,
          error: "",
        };
        if (dirty)
          drafts.set(source.key, {
            baseline: next.baseline,
            value: next.value,
          });
        else drafts.delete(source.key);
        persist(next);
        if (owner === token && model?.key === source.key) publish(next);
      }
      assertDocument();
      // Keep newer input pending rather than consuming a stale document snapshot.
      if (
        doc.slides.some((page) => drafts.has(JSON.stringify([doc.id, page.id])))
      )
        throw new NotesChangedError("备注输入已变化，请重试当前操作");
    } finally {
      for (const source of captured) pendingKeys.delete(source.key);
      if (owner === token && model?.busy) publish({ ...model, busy: false });
    }
  }
  const unsubscribe = context.subscribe(refresh);
  refresh();
  scheduleAutosave();
  return {
    value(pageId: string) {
      if (owner !== token) throw Error("编辑会话已关闭");
      const doc = context.snapshot()?.document;
      const page = doc?.slides.find((page) => page.id === pageId);
      if (!doc || !page) throw Error("备注页面已不存在");
      const key = JSON.stringify([doc.id, page.id]);
      try {
        readDraft(key);
      } catch {
        throw Error("备注草稿无法读取，请检查后重试");
      }
      return drafts.get(key)?.value ?? page.notes;
    },
    flush: flushOnce,
    dispose() {
      cancelAutosave();
      unsubscribe();
      if (owner === token) {
        owner = undefined;
        publish(undefined);
      }
    },
  };
}
