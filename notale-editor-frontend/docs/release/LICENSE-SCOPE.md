# Editor license scope

The LICENSE files in notale-editor and notale-editor-frontend apply to original Notale editor code and original templates. The selected license is [MIT, as published by OSI](https://opensource.org/license/mit).

They do not relicense third-party code, bundled libraries, fonts, reference-derived assets, user lectures or other monorepo projects. Existing third-party copyright and license notices remain applicable. Source fixtures and copied examples still require provenance review before public release; placing a LICENSE file beside them does not establish ownership.

Current distribution review distinguishes:

- Browser bundles containing dependencies such as ECharts, Reveal, text/vector engines and their dependencies: collect embedded/upstream notices and include required license texts in distribution.
- npm-installed optional Sharp/libvips binaries: retain the package's license/source information; do not assume the MIT license of the application replaces their LGPL or mixed terms. Platform-specific installation is described in [Sharp installation documentation](https://sharp.pixelplumbing.com/install/).
- Original templates: generated from repository source with system fonts, without bundled font files or reference images.
- Legacy refined templates: not part of the v1 public catalog; their local presence still requires exclusion from release artifacts and review of the Git publication scope.

This document records scope and outstanding review, not a declaration that all release obligations have been satisfied. See the dependency inventory and asset provenance report.
