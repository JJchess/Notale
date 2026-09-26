# Version-pinned upstream license supplements

These texts fill omissions in installed npm package archives. Each manifest entry records the exact npm name/version, registry metadata endpoint, published gitHead, immutable upstream URL and SHA-256. The collector uses a supplement only for that exact installed version when no local full text was found, and refuses modified text whose hash differs.

css-styled 1.0.8: the npm registry identifies commit 8b2cb322f05db9c5eed93702864a6fd62b99eeae in daybrush/css-styled. Its root LICENSE contains the full MIT grant and 2019 Daybrush copyright notice, retained verbatim here.

A text found in another package or a font fixture is not substituted for the package's own license. Unresolved entries remain in notice-review.json. This directory does not establish that every bundled dependency or optional native library has completed review.

brotli 1.3.3 decoder supplement: seven installed dec/*.js files declare Copyright 2013 Google Inc. and Apache-2.0 despite the package-level MIT declaration. Their headers and whole-source hashes are preserved with the canonical Apache license text. This entry is supplemental: it is always included for the matching version but does not clear the package-level full-text gap. notice-review.json exposes completeTextFound so a partial notice cannot be mistaken for full package coverage.

Declared-standard supplements for brotli, dfa, fontkit, croact and croact-css-styled retain the exact installed package's MIT declaration, metadata hash and author attribution; Croact source copyright headers are also retained. They include the standard MIT grant, identified with the SPDX MIT source, and explicitly do not claim to be recovered upstream LICENSE files. No missing copyright years are invented. completeTextFound stays false while declaredTermsIncluded records the added terms. Brotli's separate Apache decoder supplement remains necessary. These two evidence types must not be conflated when reporting coverage.
