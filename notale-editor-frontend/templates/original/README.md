# Original Notale teaching templates

Eight complete 1600×900 slides and eight independent 1040×540 diagrams, authored in `scripts/templates/prepare-original.ts`. All visible content consists of editable HTML text, shapes and SVG arrows. No reference images, font files, tracking scripts or remote resources are used. System font rendering can vary by platform.

The catalog is connected to the editor; the targeted original-template integration check covers page insertion, duplicate diagram identities, editable text, undo/redo, saved data and reopening the inserted page. Each manifest entry has a full-page JSON/HTML/PNG plus a `-diagram` JSON/HTML/PNG. Diagram payloads contain only the diagram, without page titles or footers; every element receives a stable source ID for insertion remapping.

Regenerate from the frontend directory after installing dependencies and Playwright Chromium:

```sh
npx playwright install chromium
npm run build:scripts
node .local/tooling/scripts/templates/prepare-original.js
```

Set CHROMIUM_PATH only when using an existing browser executable. The generation process writes only this original catalog and does not modify reference assets or stored lectures. PNG previews are generated from the same native HTML as the insertion payload.
