# Research Notes — v2 Art Direction, Rhythm, and Reader Awareness

These notes explain why the runtime Skill is structured the way it is. They should not be loaded for normal generation.

## Primary-source findings from The Pudding

### 1. There is no single "Pudding visual style"

The Pudding describes visual journalism as lacking an established pattern language and says the team deliberately experiments with unfamiliar visual approaches. This supports a Skill that generates **project-specific art direction**, not one reusable house template.

Source: https://pudding.cool/about/

Recent examples also make the diversity obvious:

- MOW / lawn mowing game — playable game/system world
  https://pudding.cool/2026/06/mow/
- Growing Up With K-Pop — personal/cultural story with photos, cover art, bubbles, stars, era markers and illustration
  https://pudding.cool/2026/05/kpop-generations/
- A Journey Through Infertility — an interactive illustrated journey with parallel Parent/Child perspectives; credits an independent isometric illustration/world concept and notes UX inspiration from Monument Valley
  https://pudding.cool/2026/03/ivf/
- A History of Menus is a Menu of History — archival menus as the primary visual material with swipe/keyboard progression
  https://pudding.cool/2026/06/menu-story/
- Common Threads / musical motifs — audio-first invitation plus recurring timeline motifs and step navigation
  https://pudding.cool/2025/12/motifs/

The transferable principle is **subject-native art direction**: the visual language is chosen to embody the subject and interaction model.

### 2. Reference-driven design, message before visualization

The Pudding's design guide recommends looking at strong visualization work, archiving screenshots with notes about what specifically works, deciding the message first, and designing static visualizations outside code before implementation.

Source: https://pudding.cool/process/how-to-make-dope-shit-part-2/

For this Skill, that research behavior is mainly used during Skill construction. At runtime it is compressed into the ArtDirectionSpec + grammar library so the agent does not need to browse references every time.

### 3. Storytelling is visual and temporal, not just writing

The Pudding's storytelling guide says key insights tend to be supported by charts rather than text-heavy exposition. It describes scrollytelling as fluid and enjoyable partly because each step promises a new visual change, and tapping/stepping as useful for highly structured, bite-sized arguments.

Source: https://pudding.cool/process/how-to-make-dope-shit-part-3/

This motivates the RhythmSpec and the requirement that slide states be explicit and independently renderable.

### 4. Visuals should inform AND entertain

The Pudding describes itself as choosing topics where visuals inform and entertain. Its pitch page also emphasizes a "soul" beneath the data and asks why an idea is uniquely a visual data story.

Sources:
- https://pudding.cool/about/
- https://pudding.cool/pitch/

This motivates the Skill's "world the reader can act inside" standard rather than treating interaction as chrome.

## What is inference, not an official Pudding rule

The following are our distilled engineering/design abstractions, not official Pudding terminology:

- `PlayableWorld`
- `ReaderTrace`
- `PersonalizedNarrative`
- `ArtDirectionSpec`
- six-channel `RhythmSpec`
- beat names such as `rupture`, `breath`, `echo`
- the eight art-direction families
- one-pass numeric thresholds

They are derived to make a coding agent more deterministic and to adapt web visual-essay craft to fixed 16:9 HTML-native lecture scenes.

## Why rhythm is explicit

A strong interactive story can feel musical because multiple channels vary over time:

- visual density
- element scale
- animation activity
- reader participation
- color energy
- text load

The v2 Skill treats this as a deck-level waveform. This avoids the common AI failure where every page is individually polished but the sequence feels mechanically uniform.

## Why art direction is explicit

AI often conflates "variety" with changing style on every page. The target here is the opposite:

**coherent world, varied states.**

The section receives one primary art direction whose motifs, materials, typography roles, and motion verbs stay coherent. Rhythm comes from changing the *role and intensity* of that vocabulary, not replacing it slide by slide.

## Why reader trace matters

MOW demonstrates a powerful interaction pattern: the reader performs a task rather than merely reading about it. The next step for lecture generation is to systematically preserve those actions and use them later as valid evidence or comparison material.

The Skill deliberately restricts personalized claims to observed events/derived metrics and forbids psychological or sensitive-trait inference from telemetry.
