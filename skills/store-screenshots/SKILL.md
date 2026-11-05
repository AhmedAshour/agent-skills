---
name: store-screenshots
description: >-
  Make App Store and Google Play screenshots in every listing language: capture real screens from the iOS
  simulator / Android emulator per language (RTL included), render exact-size framed screenshots with captions
  (iPhone 6.9", 6.5", iPad 13", Play phone, 7"/10" tablet) plus the Play feature graphic 1024×500 from one HTML
  template, then upload them to App Store Connect and Play by API. Two ready styles: "caption + phone" and
  "lifted cards". Use when someone says store screenshots, feature graphic, framed screenshots, localized
  screenshots, screenshot captions, or "upload the screenshots".
---

# Store screenshots — every size, every language, one command

Pipeline: **raw captures per language → `captions.json` → `kit/render.mjs` → exact-size PNGs → upload**.
Raws are never cropped or captioned by hand; change captions/raws/template and re-render.

## One-time setup

```bash
cd <this-skill>/kit && npm ci && npx playwright install chromium
```

Run everything with `--root=<app repo>`; the kit needs no install inside the app repo.
`<skill>` below = the folder this SKILL.md is in. Working examples of both styles (fake app, English/German/Arabic):
`examples/demo-app` and `examples/lifted-cards-demo` in the repo this skill came from.

## Repo layout it expects

```
app_store/
  store-kit.json                 # see kit/store-kit.example.json (package, icon, rawDir, play.locales, apple{})
  raw/<locale>/<screen>.png      # captures (falls back to raw/<screen>.png)
  screenshot-tool/
    template.html                # the style (copy from styles/<style>/)
    feature.html                 # optional Play feature graphic template
    captions.json                # screens + text per locale
    fonts/*.ttf                  # the app's fonts, local files (never node_modules paths)
  screenshots/                   # OUTPUT: <target>/<locale>/<n>-<screen>.png + placeholders.json
  android/<locale>/…txt          # Play listing text (store-listings skill)
```

`captions.json`:

```json
{
  "screens": [ { "screen": "home", "theme": "paper" }, { "screen": "result", "theme": "ink" } ],
  "featureGraphic": { "screen": "home",
    "en-US": { "caption": "Plan less.\nDo more.", "l1": "Plan less.", "l2": "Do more.", "sub": "A calm planner" } },
  "locales": {
    "en-US": { "home":   { "caption": "Your day\nat a glance", "sub": "Everything due today, in one list" },
               "result": { "caption": "See your\nprogress grow", "sub": "Streaks and weekly totals" } },
    "ar-SA": { "_dir": "rtl", "_lang": "ar", "home": { "caption": "…", "sub": "…" }, "result": { "caption": "…", "sub": "…" } }
  }
}
```

Locale folder names = the `captions.json` keys. `store-kit.json` maps them to store codes
(`play.locales[{play:"ar", text:"ar", images:"ar-SA"}]`, `apple.locales {"ar-SA":"ar-SA","en-GB":"en-US"}`), so one
render folder can feed several store languages (e.g. en-US images for en-GB, en-AU).

## 1. Pick a style (ask the owner for a new app)

Show both previews in `styles/previews/` and ask:
- **Caption + phone** (`styles/caption-phone/`): two-line headline + one sub on a tinted ground, the full real screen in a
  phone. Best when the screen itself is the proof.
- **Lifted cards** (`styles/lifted-cards/`): short outcome headline with a marked second line, tilted phone, the 1–2 key
  cards lifted out bigger. Best when screens are busy and the value is one element. Full how-to in its README.

Copy the style's files into `app_store/screenshot-tool/` and `styles/fonts/` into `app_store/screenshot-tool/fonts/`
(Plus Jakarta Sans, Manrope for Cyrillic, IBM Plex Sans Arabic — all OFL), or use the app's own TTFs. Change only the
BRAND blocks (colours, `@font-face`, font per language). `featureGraphic` uses `caption` in caption-phone and `l1`/`l2`
in lifted-cards (its `feature.html` also wants a `wordmark.svg`).

## 2. Capture raws per language

- Use the **largest** phone: iPhone 6.9" simulator (1320×2868 native) and/or an Android 1080×1920+ emulator.
  Downscaling is fine, upscaling looks soft.
- Clean status bar: `xcrun simctl status_bar booted override --time "9:41" --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`.
  Android: `adb shell settings put global sysui_demo_allowed 1` + demo mode broadcasts.
- **Real, lived-in data**: log in with the review/demo account, seed a few days of history. Empty states sell nothing.
- **Switch the app language per locale and capture again.** An English screen inside the Arabic/German listing looks
  lazy and RTL apps mirror their layout. Captures expose untranslated strings — fix them in the app, don't paint over.
- After switching to RTL, re-read element positions — tab bars are mirrored, old tap coordinates are wrong.
- Hide dev tools (Expo dev-client gear / "Tools" button) or capture a Release build.
- Commands: `xcrun simctl io booted screenshot raw/en-US/home.png`, `adb exec-out screencap -p > raw/de-DE/home.png`.
  Driving the UI: `axe` (iOS, `brew install cameroncooke/axe/axe`) or `mobilecli` (`npm i -g @mobilenext/mobilecli`:
  `dump ui`, `io tap X,Y` in points, `url scheme://route`). `styles/lifted-cards/capture.sh` has helpers
  (`bar`, `shot`, `tap`, `tapl <label>`, `scrollto <label> <y>`, `lbl <lang> <key> <i18n.json>`).
- Deep links on iOS sim show a SpringBoard "Open in …?" dialog — tap Open or it ends up in later shots.
- Name files exactly as the `screen` ids in `captions.json`.

## 3. Render

```bash
node <skill>/kit/render.mjs --root=<repo>                    # all sizes, all locales, feature graphic
node <skill>/kit/render.mjs --root=<repo> --target=ios-6.9   # one size: ios-6.9 ios-6.5 ios-ipad play-phone play-7 play-10 feature
node <skill>/kit/render.mjs --root=<repo> --locale=de-DE
```

| Target | Size | Store slot |
|---|---|---|
| ios-6.9 | 1320×2868 | `APP_IPHONE_67` — required |
| ios-6.5 | 1242×2688 | `APP_IPHONE_65` — optional/legacy |
| ios-ipad | 2048×2732 | `APP_IPAD_PRO_3GEN_129` — required if the app supports iPad |
| play-phone | 1080×1920 | phoneScreenshots (2–8) |
| play-7 / play-10 | 1200×1920 / 1600×2560 | tablet screenshots (if tablet layouts) |
| feature | 1024×500 | Play feature graphic — required |

- Sizes are exact on purpose: Apple rejects near-misses.
- The run **fails if a font doesn't load** (otherwise an off-brand fallback face ships silently).
- `screenshots/placeholders.json` must say `"missing": []` — the uploaders refuse otherwise.
- Filename order = listing order. **Strongest proof in the first two frames**; most people never swipe further.

## 4. Look before uploading

Make a contact sheet of every locale × screen and check: right language in captions AND in the app UI, no cut-off
text (German/Russian run long — shorten the caption rather than shrink it), RTL frames mirrored, no dev UI, no
personal data, nothing the app doesn't actually do. Show the owner before the first upload.

## 5. Upload

**Apple** (replaces the set on every locale of the editable version, waits until Apple reports COMPLETE):
```bash
node <skill>/kit/asc-screenshots.mjs --root=<repo> --dry-run
node <skill>/kit/asc-screenshots.mjs --root=<repo>
node <skill>/kit/asc-screenshots.mjs --root=<repo> --target=ios-ipad --type=APP_IPAD_PRO_3GEN_129   # iPad set
```
Needs `apple.appId` + `apple.locales` in `store-kit.json` and the ASC key env (see store-ready). There's no
`--help`: any run without `--dry-run` uploads. Re-check `assetDeliveryState` a minute later. When you create a
new App Store version, old sets with old UI carry over — replace every display type you uploaded before.

**Play** (one edit for all locales; deletes then re-uploads, so reruns don't stack):
```bash
GOOGLE_PLAY_SERVICE_ACCOUNT_PATH=key.json node <skill>/kit/publish-play-listing.mjs --root=<repo> --images-only --dry-run
GOOGLE_PLAY_SERVICE_ACCOUNT_PATH=key.json node <skill>/kit/publish-play-listing.mjs --root=<repo> --images-only
```
A commit **goes live** on a published app — only with the owner's OK. Without `--images-only` it also pushes the text,
store details and the 512×512 icon (see store-listings).

## iPad without an iPad layout

A phone screenshot stretched onto an iPad canvas risks a 2.3 rejection. Options: real iPad simulator captures; an Expo
app's web build at tablet width (`npx expo start --web`, browser at 2752×2064 with zoom 2); or set
`supportsTablet: false` if it isn't really an iPad app.

## Don't

- Round or approximate sizes, upscale small captures, or hand-edit generated PNGs.
- Load template fonts from `node_modules` — use local `fonts/*.ttf`.
- Show UI, prices, or claims the shipping app doesn't have; show other people's real data.
- Draw Arabic/Hebrew captions with PIL (no shaping) — the HTML template renders them correctly in Chrome.
