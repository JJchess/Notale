from __future__ import annotations

from typing import Dict

VISUAL_TRIGGERS_ZH = [
    "演示",
    "可视化",
    "图表",
    "交互式",
    "交互",
    "仿真",
    "模拟",
    "动画",
    "流程图",
    "界面",
    "组件",
    "展示",
]

VISUAL_TRIGGERS_EN = [
    "visual",
    "widget",
    "chart",
    "diagram",
    "interactive",
    "simulation",
    "dashboard",
    "graph",
]

WIDGET_TYPES = (
    "interactive",
    "chart",
    "chart_interactive",
    "mockup",
    "art",
    "art_interactive",
    "diagram",
)

# Last-resort fallbacks, used ONLY when the guideline fragments are missing on disk
# (see bundler.py for the real guidance). Keep aligned with the aesthetic-direction
# system: committed style per subject, craft rules, self-contained panels.
MODULE_GUIDANCE: Dict[str, str] = {
    "interactive": (
        "Build an explorable demo with clear controls. Prefer sliders, buttons, toggles, or draggable inputs. "
        "Show one core interaction rather than many unrelated controls. Every control gets hover/active states "
        "and a transition; state changes animate visibly."
    ),
    "chart": (
        "Focus on data readability. Good axes, legends, labels, and readable color contrast matter more than decoration. "
        "Prefer lightweight SVG or canvas charts over heavy libraries unless truly needed. Use tabular-nums for values."
    ),
    "chart_interactive": (
        "Combine a chart with one or two meaningful controls such as filter, range, or comparison toggle. "
        "Interaction must change the data view clearly, with animated transitions."
    ),
    "mockup": (
        "Render a clean UI mockup with cards, forms, panels, and layout hierarchy. "
        "No fake browser chrome and no unnecessary filler copy."
    ),
    "art": (
        "Create a visual scene or illustration with pure HTML/SVG/CSS/JS. Commit to one palette "
        "(1 background + 3-5 hues), layer shapes for depth, and add one signature detail."
    ),
    "art_interactive": (
        "Create a visual scene with one simple playful interaction, such as play/pause, scrub, or hover reaction."
    ),
    "diagram": (
        "Produce a structural SVG or HTML diagram with a very clear information hierarchy. "
        "Keep text sparse and use arrows, grouping, or lanes only when they clarify meaning."
    ),
}

CORE_GUIDANCE = """
You create inline visual content for chat. The output must be a self-contained HTML fragment.

Hard rules:
- Return fragment only. No <!doctype>, <html>, <head>, or <body>.
- Pick ONE aesthetic direction matched to the subject's mood and commit fully: palette, type, motion. A widget about physics, a poem, and a finance chart should not look alike.
- Unless the widget should blend with the host UI, wrap content in one root panel <div> carrying its own background and ink colors so it reads correctly in light and dark host modes.
- Every clickable element gets hover + active states and a ~150ms transition.
- Animate only transform/opacity (plus canvas redraws). Gradients and shadows are allowed but disciplined: 2-stop related-hue gradients, layered-soft or hard-offset shadows.
- Use normal readable text sizes. Never smaller than 11px. Round every displayed number.
- Keep external dependencies to zero unless unavoidable.
- Prefer structure order: <style> then markup then <script>.
- The fragment must contain at least one of: <div>, <svg>, <canvas>, <style>.
- Keep it robust inside an iframe with sandbox='allow-scripts'.
- Use only light explanatory text inside the widget. No long essay inside the widget.
- If there is interaction, wire it with plain browser JavaScript.
""".strip()
