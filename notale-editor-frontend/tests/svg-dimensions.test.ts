import { test } from "node:test";
import assert from "node:assert/strict";
import { svgDimensions } from "../src/state/svg-dimensions";
test("SVG intrinsic size preserves viewBox ratio and converts absolute units", () => {
  assert.deepEqual(svgDimensions("100%", "100%", "0 0 200 100"), {
    width: 200,
    height: 100,
    validViewBox: true,
  });
  assert.deepEqual(svgDimensions("1in", null, "-20, -10, 200, 100"), {
    width: 96,
    height: 48,
    validViewBox: true,
  });
  assert.deepEqual(svgDimensions(null, "72pt", "0\n0\n200\n100"), {
    width: 192,
    height: 96,
    validViewBox: true,
  });
  assert.equal(svgDimensions("25.4mm", "2.54cm", null).width, 96);
  assert.equal(svgDimensions("25.4mm", "2.54cm", null).height, 96);
  assert.deepEqual(svgDimensions("-1", "0", "0 0 -10 0"), {
    width: 600,
    height: 400,
    validViewBox: false,
  });
  assert.deepEqual(svgDimensions("300px", "100px", "0 0 200 100"), {
    width: 300,
    height: 100,
    validViewBox: true,
  });
});
