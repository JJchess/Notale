import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindTypography,
  typographyState,
} from "../src/state/typography-editor";
import {
  bindAppearance,
  appearanceState,
} from "../src/state/appearance-editor";

for (const kind of ["typography", "appearance"] as const)
  test(`${kind} rejects callbacks from a previous visit to the same selection`, () => {
    let selected = ["a"],
      revision = 0;
    const context = {
      key: () => JSON.stringify([selected, revision]),
      documentId: () => "doc",
      slideId: () => "slide",
      enabled: () => selected.length > 0,
      ready: () => true,
      ids: () => selected,
      selected: () => selected,
      objects: () =>
        ["a", "b"].map((id) => ({
          id,
          tag: "p",
          locked: false,
          style: {},
          attributes: {},
        })),
      capture: async () => ({ computedStyles: {} }),
      commands: async () => {},
      preview: () => {},
      commit: async () => {},
      cancel: async () => {},
      error: () => {},
    };
    const binding =
      kind === "typography" ? bindTypography(context) : bindAppearance(context);
    const command = () =>
      kind === "typography"
        ? () => typographyState.getSnapshot()!.commands({ "font-size": "20px" })
        : () =>
            appearanceState
              .getSnapshot()!
              .commands("opacity", { "appearance-opacity": "50" });
    // Capture the model itself, as React event handlers do.
    const snapshotCommand = () => {
      const m =
        kind === "typography"
          ? typographyState.getSnapshot()!
          : appearanceState.getSnapshot()!;
      return () =>
        kind === "typography"
          ? (
              m as NonNullable<ReturnType<typeof typographyState.getSnapshot>>
            ).commands({ "font-size": "20px" })
          : (
              m as NonNullable<ReturnType<typeof appearanceState.getSnapshot>>
            ).commands("opacity", { "appearance-opacity": "50" });
    };
    try {
      binding.render();
      const old = snapshotCommand();
      revision++;
      binding.render();
      assert.equal(old().length, 1);
      selected = ["b"];
      binding.render();
      selected = ["a"];
      binding.render();
      assert.throws(old, /选区已变化/);
      assert.equal(command()().length, 1);
      const beforeHide = snapshotCommand();
      selected = [];
      binding.render();
      selected = ["a"];
      binding.render();
      assert.throws(beforeHide, /选区已变化/);
      assert.equal(command()().length, 1);
    } finally {
      binding.disposeCapture();
    }
  });

test('typography command admission skips objects locked since capture',()=>{
 const objects=[{id:'a',locked:false,style:{}},{id:'b',locked:false,style:{}}];
 const binding=bindTypography({key:()=> 'key',documentId:()=> 'doc',slideId:()=> 'page',enabled:()=>true,ready:()=>true,ids:()=>['a','b'],objects:()=>objects,capture:async()=>({computedStyles:{}}),commands:async()=>{},preview:()=>{},commit:async()=>{},cancel:async()=>{},error:()=>{}});
 try{binding.render();const model=typographyState.getSnapshot()!;objects[1].locked=true;const commands=model.commands({'font-size':'32px'});assert.equal(commands.length,1);assert.equal((commands[0] as any).target,'a');objects[0].locked=true;assert.deepEqual(model.commands({'font-size':'32px'}),[]);}finally{binding.disposeCapture();}
});
