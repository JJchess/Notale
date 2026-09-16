import { test } from "node:test";
import assert from "node:assert/strict";
import {
  typographyStyle,
  typographySnapshot,
  fontFamilyLabel,
} from "../src/state/typography";
test("typography reports mixed values and normalizes dimensions and writing direction", () => {
  const model = typographySnapshot(["a", "b"], {
    a: { "font-size": "20px", "font-weight": "700", color: "rgb(1, 2, 3)" },
    b: { "font-size": "30px", "font-weight": "400", color: "rgb(1, 2, 3)" },
  });
  assert.equal(model.fields["font-size"].mixed, true);
  assert.equal(model.fields.color.value, "#010203");
  assert.equal(model.bold, "mixed");
  assert.equal(model.fields["line-height"].value, "");
  assert.deepEqual(typographyStyle("writing-mode", "vertical-rl"), {
    "writing-mode": "vertical-rl",
    "text-orientation": "upright",
  });
  assert.deepEqual(typographyStyle("letter-spacing", "-1.5"), {
    "letter-spacing": "-1.5px",
  });
  assert.deepEqual(typographyStyle("font-size", ""), { "font-size": "" });
  assert.throws(() => typographyStyle("font-size", "-1"), /请检查/);
});

test("font labels hide fallback stacks and preserve commas inside quoted names", () => {
  assert.equal(
    fontFamilyLabel(
      '"Noto Sans CJK SC Medium", "Noto Sans CJK SC", sans-serif',
    ),
    "Noto Sans CJK SC Medium",
  );
  assert.equal(
    fontFamilyLabel("'Font, with comma', serif"),
    "Font, with comma",
  );
  assert.equal(fontFamilyLabel("Arial, sans-serif"), "Arial");
  assert.equal(fontFamilyLabel(""), "");
});

import {typographyObjectStyle} from '../src/state/typography';
test('writing direction keeps managed fixed dimensions and preserves intrinsic sizing mode',()=>{
 const fixed={width:'400px',height:'100px','inline-size':'400px','block-size':'100px'};
 assert.deepEqual(typographyObjectStyle({'writing-mode':'vertical-rl'},fixed),{'writing-mode':'vertical-rl','inline-size':'100px','block-size':'400px'});
 assert.deepEqual(typographyObjectStyle({'writing-mode':'horizontal-tb'},{...fixed,'inline-size':'100px','block-size':'400px'}),{'writing-mode':'horizontal-tb','inline-size':'400px','block-size':'100px'});
 assert.deepEqual(typographyObjectStyle({'font-size':'24px'},fixed),{'font-size':'24px'});
 assert.deepEqual(typographyObjectStyle({'writing-mode':'vertical-rl'},{width:'max-content',height:'auto','inline-size':'max-content','block-size':'auto'}),{'writing-mode':'vertical-rl',width:'auto',height:'max-content','inline-size':'max-content','block-size':'auto'});
 assert.deepEqual(typographyObjectStyle({'writing-mode':''},fixed),{'writing-mode':'','inline-size':'','block-size':''});
});

test('resetting typography keeps intrinsic logical sizing independent of inherited direction',()=>{
 assert.deepEqual(typographyObjectStyle({'writing-mode':''},{width:'auto',height:'max-content','inline-size':'max-content','block-size':'auto'}),{'writing-mode':'',width:'',height:'','inline-size':'max-content','block-size':'auto'});
});
