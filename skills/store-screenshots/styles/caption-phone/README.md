# Caption + phone style

Two-line headline (line 2 in the accent colour) + one-line sub on a tinted ground, the real screen straight in a phone
that runs off the bottom. Per-screen `theme` (`paper` / `ink`) in `captions.json`. Preview: `../previews/caption-phone.jpg`.
Working example: `examples/demo-app` in this repo.

1. Copy `template.html` to `<repo>/app_store/screenshot-tool/` and `../fonts/` to `<repo>/app_store/screenshot-tool/fonts/`
   (or your own TTFs).
2. Edit only the BRAND parts: the two theme colour blocks, `@font-face`, and `FONT_FOR` (font per language).
3. RTL languages: `"_dir": "rtl"` on that locale in `captions.json`; the template mirrors itself.
4. No `feature.html`? The template renders the Play feature graphic itself (`featureGraphic` in `captions.json`,
   `caption` + `sub` per locale).
5. Capture raws, render with the kit (see ../../SKILL.md).
