import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindImageCrop,
  imageCropActions,
  imageCropState,
} from "../src/state/image-crop-editor";
test("crop sessions reject stale targets and save only crop settings", async () => {
  let key = "one",
    sent: any,
    resolve!: (value: any) => void;
  const context = {
    selected: () => ({
      id: "image",
      tag: "img",
      locked: false,
      attributes: { src: "image.png" },
      style: { "object-position": "20% 30%", "clip-path": "inset(5% 10%)" },
    }),
    key: () => key,
    slideId: () => "page",
    preview: () => "https://example.com/page.html",
    capture: () =>
      new Promise<any>((r) => {
        resolve = r;
      }),
    commands: async (commands: any) => {
      sent = commands;
    },
  };
  const first = bindImageCrop(context);
  first.open();
  const draft = imageCropState.getSnapshot().editing!;
  assert.equal(draft.settings.positionY, 30);
  assert.deepEqual(draft.settings.crop, {
    top: 5,
    right: 10,
    bottom: 5,
    left: 10,
  });
  key = "two";
  await assert.rejects(
    imageCropActions.save(draft.id, draft.settings),
    /页面已变化/,
  );
  assert.equal(sent, undefined);
  first.dispose();
  resolve({ computedStyles: { image: { width: "100", height: "100" } } });
  await Promise.resolve();
  assert.equal(imageCropState.getSnapshot().editing, undefined);
  const next = bindImageCrop(context);
  next.open();
  const current = imageCropState.getSnapshot().editing!;
  await imageCropActions.save(current.id, current.settings);
  assert.equal(sent, undefined, "unchanged crop must not create a revision");
  assert.equal(imageCropState.getSnapshot().editing, undefined);
  next.open();
  const changed = imageCropState.getSnapshot().editing!;
  await imageCropActions.save(changed.id, {
    ...changed.settings,
    positionX: 60,
  });
  assert.deepEqual((sent as any)[0].patch.settings, { positionX: 60, positionY: 30 });
  next.dispose();
});

test("crop drafts reject changed source geometry but tolerate unrelated object attributes", async () => {
  let writes = 0;
  const object = {
    id: "image",
    tag: "img",
    locked: false,
    attributes: { src: "image.png", alt: "Before" },
    style: { "object-position": "20% 30%" },
  };
  const binding = bindImageCrop({
    selected: () => object,
    key: () => "doc/page/image",
    slideId: () => "page",
    preview: () => "https://example.com/page.html",
    capture: async () => ({ computedStyles: {} }),
    commands: async () => {
      writes++;
    },
  });
  try {
    binding.open();
    let draft = imageCropState.getSnapshot().editing!;
    object.attributes.alt = "Unrelated description";
    await imageCropActions.save(draft.id, { ...draft.settings, positionX: 40 });
    assert.equal(writes, 1);
    binding.open();
    draft = imageCropState.getSnapshot().editing!;
    object.style["object-position"] = "70% 80%";
    await assert.rejects(
      imageCropActions.save(draft.id, { ...draft.settings, positionX: 50 }),
      /草稿已保留/,
    );
    assert.equal(writes, 1);
    assert.equal(imageCropState.getSnapshot().editing?.id, draft.id);
    binding.open();
    draft = imageCropState.getSnapshot().editing!;
    object.attributes.src = "replacement.png";
    await assert.rejects(
      imageCropActions.save(draft.id, { ...draft.settings, positionX: 50 }),
      /资源已变化/,
    );
    assert.equal(writes, 1);
  } finally {
    binding.dispose();
  }
});
