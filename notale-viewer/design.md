# Design — Notale Viewer

A locked design system for the viewer (`/`, `/s/[sessionId]`, `/runs/[runId]`). Every page reads this file before styling.
Values live in `app/tokens.css`; pages reference tokens by name, never raw values.

## Genre
modern-minimal, **utilitarian** register: the lecture is the product on screen; everything around it is small, quiet control.
The same system as the editor (`notale-editor-frontend/src/editor.css`) — a lecture moves from here into the editor, so the two must read as one tool.

## Macrostructure family
- App pages (session, run): **Workbench app shell** — the lecture fills the main area; the conversation or progress sits beside it as a panel.
- Start page (`/`): a working surface, not a hero — one column (max 760px) centred horizontally in the upper third: the question and the box, recent sessions under it; text stays left-aligned in the column. No full-screen centred splash.

## Theme
The editor's colours, as OKLCH: paper `oklch(95.4% 0.004 301)` · surface white · ink `oklch(27.8% 0.013 299)` · muted `oklch(56.5% 0.016 300)` ·
rule `oklch(91.3% 0.008 301)` · accent (action purple) `oklch(50.7% 0.278 288)` · accent-soft `oklch(94.6% 0.022 303)` · focus `oklch(61.7% 0.205 298)`.
Green `oklch(62.1% 0.140 153)` is a **state** colour only (a page is done), never decoration.

## Typography
- One family: Inter + PingFang SC (the editor's stack). Hierarchy by weight and size, not by a second face. No serif, no italics in headings.
- Mono for version numbers, counts and timings, with tabular figures.

## Spacing
4-point named scale (`--space-*`). Panels pad `--space-md`–`--space-lg`; controls sit on 28–32 px targets.

## Motion
150–220 ms, `--ease-out`, transform/opacity only. No entrance animations; nothing reveals on scroll. `prefers-reduced-motion`: all motion off.

## Microinteractions stance
- Silent success: a finished version simply appears; no toasts.
- Focus ring `--color-focus`, 2 px, appears instantly.
- Hover changes background tint only; no scale, no glow.

## CTA voice
- Primary: filled accent square button, `--radius-control` + 2 px, icon only with a label (send).
- Secondary: text or hairline-bordered button in ink-2; options offered by the assistant are hairline accent pills.

## What pages MUST share
Tokens, the single type family, the wordmark (`N` mark + NOTALE), the composer component, the button voice.

## What pages MAY differ on
Panel content (conversation vs. progress) and the start page's column layout.
