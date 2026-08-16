---
name: make-illustration
description: Use when a page needs a picture of something that has no photograph and no exact geometry — an atmosphere, a setting, a material, a metaphor, a stylised object standing in for an idea.
---

# Make an illustration

Generates a picture and saves it next to the page. One command, no setup.

```bash
python3 <skill-dir>/scripts/gen.py "<prompt>" --out pages/assets/img/<name>.png
```

Defaults to 2048×1152 (16:9, matches the 1600×900 canvas). `--size WxH` to change,
`--n 3` for several variations to choose from. Every generated file is logged with its
prompt in `illustrations.json` next to it, so you can trace later what produced what.

## The one rule that matters

**Never let generated pixels carry information the reader must read or verify.**

Tested behaviour of this model: asked for a labelled neuron diagram, it returned a correct
structure — inputs, weights, summation node, activation function, output, arrows in the
right order — but printed `Weight 2` twice and never printed `Weight 3`. The picture looked
authoritative and was wrong.

So:

- Labels, values, axis ticks, formulas, captions, legends → put them in HTML on top of the
  picture, never inside it. Position them absolutely over the image.
- Anything the reader is meant to check — a mechanism, a sequence, a quantity, a structure
  with a right answer — should be drawn with page code, not generated. A diagram that has an
  exact correct form is cheaper and safer to build directly.
- Identifiable people, documented places, real events, museum objects → these have real
  photographs; find one rather than inventing it.

## Every output carries an "AI生成" label

Tested: the label is stamped into the bottom-right corner of every image and `no watermark`
in the prompt does not remove it. It is a required generated-content marker, so treat it as
part of the picture rather than something to work around.

Design for it: keep the bottom-right corner clear of anything the reader needs, and do not
place overlaid copy, a legend, or a focal subject there. If a particular page cannot tolerate
a corner mark, that page wants a drawn or photographed picture instead.

## What it is good at

- Atmosphere and setting: a landscape, a laboratory interior, weather, a time of day
- Material and texture: paper, metal, fabric, rock, fluid
- Metaphor and mood: an image standing in for an abstract idea where no literal picture exists
- Stylised objects where nothing is being asserted: a generic tree, a generic city, a shape

## Writing the prompt

State the subject, the framing, the treatment, and the background, in that order. Say what
should be absent — most failures are things that crept in.

```
a wide empty laboratory bench at dawn, cold light from one window,
matte surfaces, muted palette, no people, no text, no logos, shallow depth of field
```

Add `no text, no labels, no watermark` to every prompt. The model prints stray words
otherwise, and stray words in a lecture read as content.

## Keeping a set coherent

Pages generated independently drift apart. Fix the treatment once — palette, light
direction, camera distance, level of stylisation — and repeat that same clause verbatim in
every prompt across the deck. Varying only the subject keeps the set recognisable as one
world.

## Checking the result

Look at the file before shipping it. The failure modes are visible in a glance: stray text,
a subject that is not what was asked, a composition with no room for the overlaid copy,
a treatment that does not match the other pages. Regenerate rather than accept — it costs
one call.
