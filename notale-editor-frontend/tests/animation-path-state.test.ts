import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAnimationPath,
  animationPathState,
  updateMotionPath,
  motionPresets,
} from "../src/state/animation-path";
test("motion path commits isolated values once and rejects stale gestures", () => {
  let commits = 0;
  const owner = createAnimationPath(() => commits++);
  const source = animationPathState.getSnapshot();
  updateMotionPath(source, motionPresets.arc, "arc");
  assert.equal(commits, 1);
  assert.equal(owner.get().length, 5);
  assert.throws(() => updateMotionPath(source, motionPresets.line), /已变化/);
  const copy = owner.get();
  copy[1].x = 999;
  assert.equal(owner.get()[1].x, 45);
  const current = animationPathState.getSnapshot();
  assert.throws(
    () =>
      updateMotionPath(current, [
        { x: 0, y: 0 },
        { x: NaN, y: 0 },
      ]),
    /有效/,
  );
  assert.equal(commits, 1);
  owner.dispose();
  assert.throws(() => updateMotionPath(current, motionPresets.line), /已变化/);
});

test("unchanged coordinates do not save or invalidate the active path", () => {
  let commits = 0;
  const owner = createAnimationPath(() => commits++);
  const source = animationPathState.getSnapshot();
  updateMotionPath(source, structuredClone(source.points), "custom");
  assert.equal(commits, 0);
  assert.equal(animationPathState.getSnapshot(), source);
  updateMotionPath(source, [
    { x: 0, y: 0 },
    { x: 210, y: 0 },
  ]);
  assert.equal(commits, 1);
  assert.throws(() => updateMotionPath(source, source.points), /已变化/);
  owner.dispose();
});
