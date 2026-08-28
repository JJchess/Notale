---
name: get-photo-ref
description: "Find, verify, and document real photo evidence for named people, places, artifacts. Not for invented or generic imagery."
---

# Collect Visual References

Treat media as evidence, not decoration. Finish with a small local candidate set, a chosen asset, and enough provenance to audit it later.

## Reference routing

Before the first search, script run, or page mutation—including `Write`, `Edit`, `Patch`, or a modifying `Bash` command—read [source-routing.md](references/source-routing.md). Do not load unrelated references.

## 1. Define the evidence job

Write one sentence naming what the image must prove or let the learner inspect. Record:

- the exact subject, period, place, and viewpoint;
- the page region and intended crop;
- the feature that must remain visible;
- whether a photograph, scan, archival frame, or short clip is required.

Do not search for a mood when the page needs a fact. Do not use this workflow for generic atmosphere or a subject with no real-world referent; use `get-illustration` instead.

## 2. Choose the source route

Prefer authoritative collections for factual subjects. Use stock sources only for contemporary generic activity. Search with concrete nouns, names, dates, institutions, and view directions; avoid aesthetic adjectives until relevance is established.

Run the bundled adapter from the page workspace:

```bash
python3 <skill-dir>/scripts/webmedia.py "Apollo 11 lunar module on Moon NASA" \
  --type image --source nasa,wikimedia --count 8 --json
```

Download only the shortlist:

```bash
python3 <skill-dir>/scripts/webmedia.py "Acheulean hand axe museum" \
  --type image --source wikimedia,openverse --count 4 --download \
  --out assets/img/hand-axe-candidates
```

## 3. Triage before styling

Reject candidates that fail identity, date, viewpoint, resolution, or license. Inspect the actual file rather than trusting a thumbnail or title. Keep two or three materially different candidates when composition is undecided; do not flood the builder with near-duplicates.

For every retained asset, preserve the source page, creator or institution, license, and original title. Keep `attribution.json` beside downloaded files. Never infer a license from a search result.

## 4. Fit evidence to the page

Select by instructional usefulness first and visual fit second. Specify:

- destination path under `assets/img/`;
- crop and focal point;
- what may not be cropped out;
- concise alt text describing the evidence;
- a low-interference attribution location such as `title` or a source drawer.

Do not put source bureaucracy in the teaching hierarchy. Do not distort aspect ratio, erase context that changes meaning, or use an image as a full background when the learner must inspect detail.

## 5. Deliver and verify

Return a short asset manifest with the chosen file and backups. Open the page through the same local route used for delivery and verify:

- existing scaffold links and scripts still point to their real paths; preserve valid `assets/...` wiring when rewriting the document;
- the file loads without a network request;
- the chosen evidence is legible at the actual crop;
- attribution still identifies the source;
- the image does not contradict nearby labels or claims.

A Render that reports a missing resource, JavaScript error, clipping, or overflow is a failed delivery. Repair every reported failure and Render again before finishing.

If no candidate satisfies the evidence job, report the gap. Never substitute a generated image for documented evidence without explicitly changing the page's claim.
