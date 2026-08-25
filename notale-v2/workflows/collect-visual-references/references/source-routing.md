# Source routing

## Choose by evidence type

| Need | Start with | Avoid as first choice |
|---|---|---|
| Spacecraft, missions, astronomy | NASA, Wikimedia | generic stock |
| Historical object or document | Wikimedia, Internet Archive, Library of Congress | generated imitation |
| Museum object or specimen | museum collection pages, Openverse, Wikimedia | unlabeled reposts |
| Contemporary generic activity | Pexels, Pixabay | archival sources |
| Historical moving footage | Internet Archive, then extract a verified shot | treating a whole film as a clip |

Search source-native terminology. Add an institution, collection, catalog name, scientific name, date, or mission identifier before adding style words.

## Candidate record

Keep these fields for every retained candidate:

```text
file, subject, source, source_page, creator, license, original_title,
required_feature, proposed_crop, alt_text
```

Reject records missing a source page or usable license. Prefer the original institution page over an aggregator when both exist.

## Media boundaries

- A thumbnail is not a deliverable asset.
- A page URL is not necessarily a direct-download URL.
- Archival video is usually a complete film; identify and extract the needed interval.
- A technically reusable image can still be unusable if the crop removes the evidence.
- Preserve original files; derive crops as separate files when provenance matters.

