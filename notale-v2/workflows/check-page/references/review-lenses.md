# Review lenses

## Composition

- Identify the first, second, and final fixation. If all regions compete, repair hierarchy.
- Check whether comparison shares a baseline, process has direction, causality has arrows, and generalization visibly joins evidence to a claim.
- Treat repeated cards as a warning: grouping should encode a relationship, not merely contain text.
- Check alignment, balance, intentional empty space, and edge tension at the rendered size.

## Typography

- Separate title, claim, explanation, label, value, control, and annotation roles.
- Keep Chinese line breaks semantic; avoid orphan punctuation and single-character last lines.
- Keep paragraph measures readable and labels close to their referents.
- Verify projected size after stage scaling, not only CSS declarations.
- Give formulas enough base size for nested KaTeX glyphs.
- Cross-check visible prose against `workflows/scrub-copy-slop.md`: opening filler, transition filler, unearned praise-frame claims, and unsourced citations.

## Interaction and states

- Make the primary action visually discoverable.
- Show immediate feedback on the object or relationship being changed.
- Test minimum, maximum, invalid, completion, wrong-answer, and reset states when reachable.
- Keep fixed prose true under every allowed input.
- Ensure keyboard and touch users can reach the same outcome.

## Visual system

- Use one radius rule, one spacing rhythm, and a small number of emphasis levels.
- Remove decoration that does not clarify subject, hierarchy, state, or atmosphere.
- Prefer the subject's materials and instruments over generic gradients and dashboard styling.
- Check that motion has an explanatory job and that reduced motion preserves information.
- Cross-check against `workflows/scrub-visual-slop.md`: gradient-fill headings, three-column icon grids, colored side-stripe borders, italic display headings, fabricated numbers with no traceable source, redrawn device/browser chrome, decorative-only sparklines/rings.

## Evidence format

Write each finding as:

```text
[severity] visible symptom -> learner cost -> likely cause -> smallest coherent repair
```

Do not list implementation trivia without a learner-facing consequence.

