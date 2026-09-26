# Editable style reference slides

This folder is the source for the 40 PNGs in [../shots](../shots/). Each reference is a single 16:9 lecture page. The first eight approved layouts use `lecture.html`; the other 32 use `lecture-extra.html`. Their IDs match [../INDEX.md](../INDEX.md).

The CSS and SVG compositions are authored for the associated teaching topics. PNG assets in this folder are original subject images generated from text descriptions. The borrowed poster images were not supplied as image inputs.

From `notale-ts/`:

```sh
node resources/skills/style-director/source/build-slides.mjs
python3 resources/skills/style-director/build-previews.py
python3 resources/skills/style-director/build-image-cache.py
```

The first command needs the package's Playwright dependency and a Chromium browser installed by Playwright. Set `NOTALE_CHROMIUM_PATH` if the browser executable is elsewhere. The Python commands need Pillow. Review the resulting images before changing the runtime set; changing the source files alone does not update the PNGs or cache.
