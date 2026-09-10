# Mini scrollbar polish — 2026-09-09

归档状态：2026-09-09 用户验收通过，全部 mini 已归档。见[归档记录](../mini-1600-audit/ARCHIVE.md)。

19 minis with local scrolling now include their own `mini-scrollbars.css` in both runnable pages and sample bundles. Scrollbars use transparent tracks, rounded 4 px visible thumbs inside an 8 px interaction area, and inherit the surrounding text color at 28% opacity (46% hover, 62% active). Horizontal and vertical bars share the treatment. Firefox uses native thin scrollbars; forced-color mode uses system colors.

Population Clock has an independent mini so the full source stays intact. Its navigation and provenance links were adjusted for the new directory. All full selected-source SHA-256 hashes match the before snapshot.

## Verification

- `checks.json`: all 19 modified minis remain 1600 × 900 with no document scroll or runtime/resource errors in Chromium. Every visible overflowing container scrolls, uses an 8 px bar and transparent track. Population Clock was checked with its long dialog in dark and light modes; thumb colors change with the theme.
- Expanded maze alphabetical list and artist song list passed wheel scrolling with the document stationary. The shelf data needed an explicit load wait in the test; the targeted rerun passed native horizontal thumb dragging (`expanded-checks.json`).
- Three directly relevant bundle/routing/dependency unit tests passed. All 104 generated bundles passed consistency checking. The 51-item mini gallery was regenerated.
- Screenshots reviewed: wrestler index and Population Clock dialog; additional screenshots cover the photo journal, book shelves, wealth ledger and light dialog.

The CSS fallback for Firefox is included but was not browser-tested in this pass. Previous functional audit results remain historical in `../mini-1600-audit/`; no unrelated interaction suite was repeated for this styling change.
