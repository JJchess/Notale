---
name: create-diagram
description: Author structural diagram, graph, flow, and timeline blocks for a LectureDoc lecture. Use graph for explicit named edges, branching, hierarchy, or convergence; diagram when a fixed shape carries the relationship; flow for one simple linear chain; timeline only for events with explicit times or stages. Use state-sim when understanding depends on intermediate states or transformations rather than a fixed relationship.
---

# Create structural diagrams

Choose the smallest visual grammar that preserves the evidence:

- Use `flow` for a single 2-7 node linear chain without branching.
- Use `timeline` only when each event has a real time or named stage.
- Use `diagram` only when cycle, level, progression, wrap, or center-surround placement has semantic meaning.
- Use `graph` whenever edges are explicit: trees, DAGs, branches, merges, and decision flowcharts.

Keep one dominant reading path, short node titles, consistent alignment, and sufficient whitespace. Labels explain relationships; decoration must not compete with topology. Never use a diagram to fake coordinates, quantitative trends, algorithm animation, or before/after state evidence. Route those to chart or the appropriate sim profile.

Treat each node as a visual label, never as a paragraph:

- Keep `title` at most 28 characters, `sub` at most 72, and their total at most 88. Move explanation, conditions, and examples to a caption/callout or another page.
- Use one semantic unit per node. A node must be scannable without shrinking the whole structure.
- If named edges matter, use `graph`; never add an `edges` field to `diagram` and assume the viewer will infer it.
- A dense table plus a dense graph is usually two evidence views, not a decorative two-column comparison. Give one a dominant area or split the page.
