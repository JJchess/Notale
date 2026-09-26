import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMediaInspector,
  mediaInspectorState,
  mediaDraft,
  mediaDraftPatch,
  mediaDraftChanges,
} from "../src/state/media-inspector";
test("media drafts retain edits, validate playback and reject stale sources", async () => {
  const object = {
    id: "media",
    tag: "video",
    attributes: { src: "movie.mp4", alt: "Before" },
    style: {},
  };
  let pageId = "page",
    writes: any[] = [];
  const controller = createMediaInspector({
    source: () => ({ documentId: "doc", pageId, object }),
    commands: async (commands) => {
      writes.push(...commands);
    },
    replace: () => {},
  });
  controller.render();
  await mediaInspectorState.getSnapshot().save?.();
  assert.equal(
    writes.length,
    0,
    "opening media settings must not write defaults",
  );
  mediaInspectorState.getSnapshot().change?.({ alt: "Temporary" });
  mediaInspectorState.getSnapshot().change?.({ alt: "Before" });
  await mediaInspectorState.getSnapshot().save?.();
  assert.equal(writes.length, 0, "reverting a draft must not add history");
  mediaInspectorState.getSnapshot().change?.({ alt: "Draft", volume: "50" });
  controller.render();
  assert.equal(mediaInspectorState.getSnapshot().draft?.alt, "Draft");
  await mediaInspectorState.getSnapshot().save?.();
  assert.equal(writes[0].patch.settings.volume, 0.5);
  await mediaInspectorState.getSnapshot().save?.();
  assert.equal(writes.length, 1, "confirmed settings must not save twice");
  const draft = mediaDraft(object);
  assert.equal(draft.volume, "100");
  assert.equal(mediaDraftPatch({ ...draft, volume: "0" }).settings.volume, 0);
  assert.equal(mediaDraftPatch({ ...draft, volume: "100" }).settings.volume, 1);
  const quiet = mediaDraft({
    ...object,
    attributes: {
      ...object.attributes,
      "data-notale-media": JSON.stringify({ volume: 0.35 }),
    },
  });
  assert.equal(quiet.volume, "35");
  assert.equal(mediaDraftPatch(quiet).settings.volume, 0.35);
  assert.equal(mediaDraftPatch(draft).settings.endAt, null);
  assert.throws(
    () => mediaDraftPatch({ ...draft, volume: "" }),
    /音量需要填写有效数值/,
  );
  assert.throws(() => mediaDraftPatch({ ...draft, volume: "101" }), /音量应在/);
  assert.throws(
    () => mediaDraftPatch({ ...draft, startAt: "10", endAt: "5" }),
    /结束时间需要晚于/,
  );
  assert.throws(
    () => mediaDraftPatch({ ...draft, top: "60", bottom: "60" }),
    /保留可见区域/,
  );
  mediaInspectorState.getSnapshot().change?.({ alt: "Local" });
  object.attributes.src = "other.mp4";
  controller.render();
  await mediaInspectorState.getSnapshot().save?.();
  assert.equal(writes.length, 1);
  assert.match(mediaInspectorState.getSnapshot().error, /已变化/);
  const old = mediaInspectorState.getSnapshot();
  pageId = "other";
  await old.save?.();
  assert.equal(writes.length, 1);
  controller.dispose();
});

test("media callbacks from an earlier selection cannot affect a reopened session", async () => {
  let id = "a",
    rejectSave!: (error: Error) => void,
    writes = 0;
  const pending = new Promise<void>((_, reject) => {
    rejectSave = reject;
  });
  const controller = createMediaInspector({
    source: () => ({
      documentId: "doc",
      pageId: "page",
      object: { id, tag: "video", attributes: { src: id + ".mp4" }, style: {} },
    }),
    commands: () => {
      writes++;
      return pending;
    },
    replace: () => {},
  });
  try {
    controller.render();
    const old = mediaInspectorState.getSnapshot();
    old.change?.({ alt: "Old" });
    const saving = old.save?.();
    id = "b";
    controller.render();
    id = "a";
    controller.render();
    mediaInspectorState.getSnapshot().change?.({ alt: "New" });
    old.change?.({ alt: "Stale callback" });
    assert.equal(mediaInspectorState.getSnapshot().draft?.alt, "New");
    rejectSave(Error("Old request failed"));
    await saving;
    assert.equal(mediaInspectorState.getSnapshot().error, "");
    assert.equal(mediaInspectorState.getSnapshot().busy, false);
    assert.equal(mediaInspectorState.getSnapshot().draft?.alt, "New");
    await old.save?.();
    assert.equal(writes, 1);
  } finally {
    controller.dispose();
  }
});

test("media updates preserve unrelated imported presentation and playback fields", () => {
  const original = mediaDraft({
    id: "photo",
    tag: "img",
    attributes: {},
    style: {
      "object-fit": "cover",
      "object-position": "20% 30%",
      "clip-path": "inset(5% 10%)",
    },
  });
  assert.deepEqual(mediaDraftChanges({ ...original, alt: "説明" }, original), {
    alt: "説明",
  });
  assert.deepEqual(mediaDraftChanges({ ...original, volume: "50" }, original), {
    settings: { volume: 0.5 },
  });
  assert.deepEqual(
    mediaDraftChanges({ ...original, positionX: "25" }, original),
    { settings: { positionX: 25, positionY: 30 } },
  );
  assert.deepEqual(
    mediaDraftChanges({ ...original, volume: "100.0" }, original),
    {},
  );
});

test("imported geometry overrides stale defaults and retains untouched axes and crop edges", () => {
  const object = {
    id: "image",
    tag: "img",
    attributes: {
      "data-notale-media": JSON.stringify({ positionX: 50, positionY: 50 }),
    },
    style: {
      "object-fit": "cover",
      "object-position": "20% 30%",
      "clip-path": "inset(5% 10% 15%)",
    },
  };
  const draft = mediaDraft(object);
  assert.equal(draft.positionX, "20");
  assert.equal(draft.positionY, "30");
  assert.deepEqual(
    [draft.top, draft.right, draft.bottom, draft.left],
    ["5", "10", "15", "10"],
  );
  assert.deepEqual(mediaDraftChanges({ ...draft, positionX: "40" }, draft), {
    settings: { positionX: 40, positionY: 30 },
  });
  assert.deepEqual(mediaDraftChanges({ ...draft, top: "7" }, draft), {
    settings: { crop: { top: 7, right: 10, bottom: 15, left: 10 } },
  });
  for (const [css, x, y] of [
    ["left top", "0", "0"],
    ["bottom right", "100", "100"],
    ["top", "50", "0"],
    ["25%", "25", "50"],
    ["center left", "0", "50"],
  ]) {
    const value = mediaDraft({ ...object, style: { "object-position": css } });
    assert.deepEqual([value.positionX, value.positionY], [x, y]);
  }
});

test("custom geometry stays untouched while unrelated media settings remain editable", async () => {
  const object = {
    id: "photo",
    tag: "img",
    attributes: { src: "photo.png" },
    style: {
      "object-position": "20px 30px",
      "clip-path": "polygon(0 0, 100% 0, 50% 100%)",
    },
  };
  const writes: unknown[] = [];
  const binding = createMediaInspector({
    source: () => ({ documentId: "doc", pageId: "page", object }),
    commands: async (commands) => {
      writes.push(...commands);
    },
    replace: () => {},
  });
  try {
    binding.render();
    assert.equal(mediaInspectorState.getSnapshot().customPosition, true);
    assert.equal(mediaInspectorState.getSnapshot().customCrop, true);
    mediaInspectorState.getSnapshot().change?.({ alt: "Updated description" });
    await mediaInspectorState.getSnapshot().save?.();
    assert.deepEqual((writes[0] as any).patch, { alt: "Updated description" });
    mediaInspectorState.getSnapshot().change?.({ positionX: "40" });
    await mediaInspectorState.getSnapshot().save?.();
    assert.equal(writes.length, 1);
    assert.match(mediaInspectorState.getSnapshot().error, /自定义样式/);
  } finally {
    binding.dispose();
  }
});
