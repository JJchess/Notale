# Notale Viewer

Next.js client for creating Notale generation runs, following durable SSE progress, and previewing generated static artifacts.

Run the backend first:

```bash
cd ../notale-ts
npm run dev -- serve
```

Then start the viewer:

```bash
cd ../notale-viewer
npm run dev
```

Set `NOTALE_API_URL` when the backend is not at `http://127.0.0.1:4321`.

The viewer installs and builds on its own. Its small local protocol-v1 declarations describe the HTTP boundary; it has no `file:` dependency on `notale-ts`. The home screen creates runs and lists recent durable tasks. A run page replays prior events, follows live SSE updates, restores after refresh, previews each completed page, and opens the final static lecture.
