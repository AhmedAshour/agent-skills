---
name: store-listings
description: >-
  Write and ship App Store + Google Play listing text in many languages: title, subtitle, keywords, promo text,
  short and full description, What's New. Covers field limits, what each store indexes, per-language keyword
  research (not word-for-word translation), RTL/long-language checks, locale code mapping between App Store
  Connect and Play, required legal lines (EULA for subscriptions), metadata policy traps, and pushing everything
  by API from files in the repo (scripts/push-asc-listing.mjs for Apple, store-screenshots kit publisher for Play).
  Use when someone says store listing, localize the listing, translate the store page, keywords, ASO, description,
  What's New, release notes, or "add German/Arabic/… to the store".
---

# Store listings in every language

One folder per language in the repo is the source of truth; scripts push it to both stores. Never type text straight
into the consoles — the next API push overwrites it.

```
app_store/
  store-kit.json                       # package, apple.appId, apple.urls{privacy,support,marketing}, play.locales
  ios/<asc-locale>/                    # Apple
    name.txt  subtitle.txt  keywords.txt  description.txt  promotional_text.txt  whats_new.txt
  android/<play-locale>/               # Google Play
    title.txt  short_description.txt  full_description.txt
```

## 1. Pick the languages

- Ship a language only if the **app UI** supports it (a German listing for an English-only app gets bad reviews),
  unless it's deliberate ASO and the description says the app is in English.
- Use the owner's store data (impressions/downloads by country) and where the target users live.
- Apple tip: each storefront also indexes some extra localizations (e.g. the US storefront indexes English (US) and
  Spanish (Mexico)). Unused extra locales give a second keyword pool — check Apple's current list before relying on it.

## 2. Field limits and what's indexed

| | App Store | Google Play |
|---|---|---|
| Title / name | 30 — indexed | 30 — indexed |
| Subtitle / short description | 30 — indexed | 80 — indexed, shown under the title |
| Keywords | 100 chars, comma-separated, **no spaces**, indexed, hidden | — (none) |
| Promotional text | 170, not indexed, editable without a new version | — |
| Description | 4000, **not indexed** — persuasion only | 4000, **indexed** — use search terms in natural sentences |
| What's New | 4000, per version (not on 1.0) | 500 per release |

Apple: title + subtitle + keywords are **one pool** — never repeat a word across them, singular/plural count as one,
don't add the app's category name or "app". The script warns on repeats.

## 3. Writing each language (the part that matters)

- **Research, don't translate keywords.** For each language find what people actually type (store autocomplete,
  competitors' titles/subtitles in that country, Apple search `https://itunes.apple.com/search?term=<q>&country=<cc>&entity=software`,
  Play search with `&gl=<CC>&hl=<lang>`). A literal translation of an English keyword is often a word nobody searches.
- Write description copy natively: lead with the job the app does, then 3–5 short benefit lines, then trust
  (privacy, no ads, offline — only if true). Have a native speaker or a strong model + back-translation check it.
- Keep the **brand name untranslated**; the descriptor after it ("Brand: Habit Tracker") is translated.
- Long languages (German, Finnish, Russian) hit 30 chars fast — rewrite shorter, don't truncate mid-word.
- RTL (Arabic, Hebrew, Farsi): plain text works; avoid mixing Latin brand + numbers at line starts (bidi flips them);
  check the result in the store preview.
- Same facts everywhere: one locale must not promise a feature another doesn't, and every claim must be true of the
  shipping binary and the privacy policy. "Could a reviewer falsify it in five minutes?" → cut it.
- **Subscriptions**: end every Apple description (every locale) with localized lines
  `Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/` (or your own EULA) and
  `Privacy Policy: <url>` — missing = automated 3.1.2 rejection.
- **What's New**: before writing, list what shipped since the last live version (git log / merged PRs). Big
  user-visible bullets only, short, no internals; "Fixes and polish" only if there's nothing bigger. Same bullets in
  every language.

## 4. Policy traps

- **Play metadata policy**: no "free", "best", "#1", "top", "new", prices, promos, ALL CAPS, emoji or repeated symbols in
  the **title** (or icon); no ranking/award claims without source; no keyword lists in descriptions; no other apps'
  names. Violations = rejection or suspension.
- **Apple**: no other apps' or brands' names in keywords (2.3.7), no prices in title/subtitle/screenshots
  ("Free" in the name is rejected), no mention of Android/other platforms, no "beta/test".
- Health, finance, kids, religion, user-generated content: say plainly what the app does **not** claim; add a
  disclaimer that matches the in-app one.

## 5. Locale codes (they differ per store)

| Language | App Store Connect | Google Play |
|---|---|---|
| English US / UK | `en-US` / `en-GB` | `en-US` / `en-GB` |
| German | `de-DE` | `de-DE` |
| French / Canada | `fr-FR` / `fr-CA` | `fr-FR` / `fr-CA` |
| Spanish Spain / LatAm | `es-ES` / `es-MX` | `es-ES` / `es-419` |
| Portuguese Brazil / Portugal | `pt-BR` / `pt-PT` | `pt-BR` / `pt-PT` |
| Arabic | `ar-SA` | `ar` |
| Hebrew | `he` | `iw-IL` |
| Turkish | `tr` | `tr-TR` |
| Russian / Ukrainian | `ru` / `uk` | `ru-RU` / `uk` |
| Indonesian / Malay | `id` / `ms` | `id` / `ms` |
| Dutch | `nl-NL` | `nl-NL` |
| Italian | `it` | `it-IT` |
| Polish | `pl` | `pl-PL` |
| Japanese / Korean | `ja` / `ko` | `ja-JP` / `ko-KR` |
| Chinese Simplified / Traditional | `zh-Hans` / `zh-Hant` | `zh-CN` / `zh-TW` |
| Hindi | `hi` | `hi-IN` |
| Vietnamese / Thai | `vi` / `th` | `vi` / `th` |

Folder names = the store's code. In `store-kit.json` map Play codes to text and image folders:
`"play": { "locales": [ { "play": "ar", "text": "ar", "images": "ar-SA" } ] }`.

## 6. Push

**Apple** (draft on the editable version; nothing is public until the version is released):
```bash
node <skill>/scripts/push-asc-listing.mjs --root=<repo> --dry-run    # checks lengths + keyword repeats, lists changes
node <skill>/scripts/push-asc-listing.mjs --root=<repo>
```
Creates missing locales (needs `name.txt`), patches the rest, sets privacy/support/marketing URLs from
`store-kit.json apple.urls`. An editable version must exist (create it in ASC or `POST /v1/appStoreVersions`).
Name/subtitle/privacy can only change when a version is editable. Promotional text can change any time.

**Play** (text + images + details + icon in one edit; **goes live on a published app**, so dry-run first and get the
owner's OK):
```bash
GOOGLE_PLAY_SERVICE_ACCOUNT_PATH=key.json node <store-screenshots skill>/kit/publish-play-listing.mjs --root=<repo> --dry-run
GOOGLE_PLAY_SERVICE_ACCOUNT_PATH=key.json node <store-screenshots skill>/kit/publish-play-listing.mjs --root=<repo> --text-only
```
`--text-only` = text + store details; no flag = text + images + icon. Play's "translations" toggle in the Console is
machine translation — turn it off for languages you ship by hand. Play release notes go with a release on a track
(`edits.tracks` `releaseNotes[{language,text}]`), not the listing.

## Checklist

- [ ] Every shipped language has all files; app UI supports it (or deliberate)
- [ ] Apple: no word repeated across name/subtitle/keywords; keywords researched per language, ≤100, no spaces
- [ ] Play: search terms in the full description as natural sentences; short description specific, not a slogan
- [ ] Claims true for the shipping build; same facts in every language
- [ ] Subscriptions: EULA + privacy lines in every Apple description
- [ ] Policy traps (no Free/#1/emoji in Play title, no competitor names)
- [ ] Dry-runs clean, then push; read back in the consoles
- [ ] Screenshots exist for every listed language (store-screenshots skill)

More copy craft: [aso-and-claims.md](aso-and-claims.md).
