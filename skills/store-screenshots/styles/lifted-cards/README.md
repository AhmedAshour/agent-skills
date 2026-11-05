# Lifted-cards style

Preview: `../previews/lifted-cards.jpg`. Huge short outcome headline, one marked phrase, UI cards floating out of the phone.

## The look

- **Ground** warm paper (`--paper`), **headline** ink, **line 2** in the brand colour on a pale marker (`--mark`).
- **Copy**: line 1 + line 2 = one outcome, 2–4 words each ("Pass the exam." / "With a plan."). Sub = one short line.
  Sell the result, not the feature. Never claim more than the app does.
- **Phone**: real capture, 74% of frame width, tilted ±3.5° (alternating by screen order), may bleed off the bottom.
- **Cards**: the 1–2 elements that carry the message, cut from the same capture, shown at 86% width, ±1.6°. The last
  screen can be a straight phone with no cards.
- RTL locales: `_dir: rtl` in `captions.json`, with a font that has the script (e.g. IBM Plex Sans Arabic).
  Cyrillic needs a face that has it (Plus Jakarta Sans doesn't → Manrope).

## Steps

1. `app_store/store-kit.json` from `../../kit/store-kit.example.json`.
2. Copy into `<repo>/app_store/screenshot-tool/`: `template.html`, `feature.html`, `lift.example.json` → `lift.json`,
   `captions.example.json` → `captions.json`. Put the TTFs the template names in `fonts/` (Google Fonts downloads)
   and the app's wordmark in `wordmark.svg`. Edit only the **BRAND** blocks (colours, `@font-face`, `FONT_FOR`).
3. **Make the app look alive**: demo account, seeded progress, every visible string translated.
4. **Capture** per app language: `export U=<sim udid> OUT=/tmp/raw; source capture.sh; bar`, then drive with
   `tapl`/`tap`/`scrollto`/`waitfor` and `shot <set>_<screen>` (`en_today`, `ar_score` …). Script the flow per language
   with translated labels (`lbl ar 'Fix these' src/i18n/ar.json`) so every set has the same scroll positions.
   Needs `axe` (`brew install cameroncooke/axe/axe`) and Python Pillow.
5. **Prep**: `python3 prep-raw.py --root=<repo> --src=/tmp/raw` → cleaned raws in `<rawDir>/<folder>/` and
   `lift-debug.jpg` with numbered card candidates. Put the numbers you want per screen in `lift.json` → `lift`
   (per set if they differ, or explicit `[x,y,w,h]`), rerun, check the red boxes.
6. **Render**: `node ../../kit/render.mjs --root=<repo> --target=ios-6.9`, then `play-phone`, `feature`. Contact-sheet
   every locale and show the owner before uploading.

## Capture gotchas

- Expo dev-client gear (top right) shows in every capture: `prep-raw.py` paints it out (`devGear: true`).
- Status bar can turn white after a dark screen and stay white → `statusBar.donor` pastes a strip from a good capture.
- Typing with no focused field sends keys to the dev client (opens the dev menu). Check the field has focus first.
- AI/dynamic content varies per run → card boxes differ per language; that's why picks are per capture.
- Tab bar positions change between languages — tap by label (`tapl`), not coordinates.
