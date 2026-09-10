# 一位歌手，多少种重复？

Approved by the user on 2026-09-07. Formal category: `page/chart`.

Individual song points and a shared reference distribution connect within-group variation to a population baseline.

Source: https://github.com/the-pudding/song-repetition, commit `3e2682daf581f82741691257d0fe896b50298c8b`.

Original media, fonts, data and implementation are retained locally. [Original review](../../provenance/REVIEW.md) · [Asset manifest](../../provenance/assets.json). Manifest paths are relative to the original candidate; unchanged runtime assets remain under pages/, archived originals under provenance/.

This is a scoped, runnable sample extracted from the original work, not the complete original article. Framework samples include their compiled browser build and editable author source. Serve this directory over HTTP.


Mini retains every artist and histogram row, the original force simulation, word wrapping and scores, search/random/reset, keyboard song detail and mobile scroll. It removes disabled displacement-debug graphics, an unused HTML tooltip, hidden article controls and duplicate axis generation. The page owns all artist selection. Teardown stops pending simulation, resize and transition work.

At 1600×900, artist controls and the full chart occupy parallel columns. Only the song index scrolls locally. The chart uses a 520px base and retains its 1.3× expansion for large discographies, 27px circles, original force simulation and all 461 artists.
