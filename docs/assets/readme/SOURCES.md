# README media sources

These assets were selected from the Notale team's approved October 18, 2026 media edition. They show the product's vision and real browser demonstrations. This directory intentionally contains only the media used by the two root READMEs.

| File | Origin and preparation |
| --- | --- |
| `hero-en.jpg`, `hero-zh.jpg` | Notale concept artwork: a creator conducting an interactive knowledge world. The approved, text-free wide illustration is unchanged; the existing HTML typography was rendered in English and Chinese and exported at 1600 × 681. This is a conceptual illustration, not a screenshot or a claim of mid-air gesture support. |
| `notale-lockup-dark.svg` | Notale's approved dark-background brand lockup. The light-background version is reused from `notale-viewer/public/brand/`. |
| `camera-projection.gif` | The approved `01-camera-projection` browser recording, 14.2 seconds. Camera, field-of-view, and clipping controls change the actual 3D scene and 2D projection. Re-encoded at 800 pixels wide / 9 fps; no actions or results were replaced. |
| `code-execution.gif` | The approved `04-code` recording of the included insertion-sort sample, approximately 20.7 seconds. The input changes from `[7, 3, 5, 3, 2, 6]` to `[8, 3, 6, 1, 5]`, and Pyodide executes Python in the browser. Re-encoded at 800 pixels wide / 8 fps. The sample's native trace playback runs at 2×; recording speed is unchanged. This is a sample demonstration, not newly generated model output. |
| `template.png` | The approved compact `08-template-comparison` composition, 1600 × 1100. Authentic template and generated-page captures from the six-page attention lecture. Source paper and template credits appear below and in the image. |
| `course.png` | The approved compact `11-llm-course` composition, 1600 × 1180. Authentic captures and all 33 pages from a separate, six-chapter outline task. It was not generated from the PDF/PPTX inputs shown in the template example. The overview does not imply that every code page was individually validated. |

The editor screenshot is reused from [`notale-editor-frontend/docs/release/screenshots/editor.png`](../../../notale-editor-frontend/docs/release/screenshots/editor.png).

## Template and paper attribution

- **Template:** [SlidesCarnival — Colorful Geometric / Dumaine](https://www.slidescarnival.com/template/dumaine-free-presentation-template/1120), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Content has been adapted. These third-party rights and attribution remain applicable to the template shown in `template.png`.
- **Content reference:** Vaswani et al., [*Attention Is All You Need*](https://arxiv.org/abs/1706.03762), 2017. The image presents Notale's generated explanation, not a reproduced figure from the paper.

## 中文说明

- 概念图表达“重塑知识的创作与学习方式”的愿景，不代表产品具备隔空手势功能。
- 两段 GIF 均取自已确认的真实浏览器录像，仅降低分辨率、帧率与调色板体积；未替换操作或计算结果。代码演示使用内置排序 sample。
- 论文与公开模板对应六页注意力讲义；33 页课程来自另一个独立大纲任务。二者的输入和产出不可混写。
- 模板采用 SlidesCarnival 的 Colorful Geometric / Dumaine，按 CC BY 4.0 保留署名、来源及改编说明。
