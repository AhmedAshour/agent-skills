---
name: store-ready
description: >-
  Start here to get an app onto the App Store AND Google Play and through review on the first try: the
  checklist in order, every rejection we already hit and its fix, App Store Connect setup by API (listing,
  categories, age rating, price, availability, review notes, submit), the forms that only exist in the web UIs
  (App Privacy, Play app creation, App content, Data safety), Android signing, closed testing, and held
  releases. Use when someone says "put the app on the stores", "submit iOS and Android", "first store release",
  "prepare for review", "demo account for reviewers", "why was it rejected", or asks what's missing before review.
  Listing text in many languages → store-listings skill. Screenshots → store-screenshots skill.
---

# Store-ready: one app, both stores, through review first time

Orchestrator. Order matters; each step says which file/skill has the details.

## 0. Before anything

- Find the ids: bundle id / package name, ASC app id (`node scripts/asc.mjs GET '/v1/apps?filter[bundleId]=<id>'`),
  Play package (`node scripts/play.mjs POST <pkg>/edits '{}'` → 404 = not on Play yet).
- Credentials (never commit them):
  - **App Store Connect API key**: ASC › Users and Access › Integrations › Team Keys, role App Manager (Admin for
    pricing/agreements). Set `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_PRIVATE_KEY_PATH` (or put those lines in
    `~/.config/asc/config.env`). The `.p8` downloads once.
  - **Play service account**: Google Cloud › IAM › Service account › JSON key; enable *Google Play Android
    Developer API*; invite its email in Play Console › Users and permissions (Release manager, or admin for the
    app). `export GOOGLE_PLAY_SERVICE_ACCOUNT_PATH=/path/key.json` (also read as `SA=`).
- Ask the owner only what's theirs: **release on approval or hold** (default hold: iOS `releaseType: MANUAL`,
  Play managed publishing / closed track) and the **screenshot style** for a new app.
- Have the owner signed in to App Store Connect and Play Console in a browser: App Privacy and Play's App
  content forms have no API.

## 1. The binary itself must pass review (most rejections live here)

| Need | Rule it avoids | How |
|---|---|---|
| **Reviewer access with real-looking data** | Apple 2.1 / Play "App access": a login wall with no working login = instant reject | Best: an **example-data / demo mode inside the app** that needs no server, plus a fixed review login that lands in it. Seeded server accounts expire or get wiped; a client-side mode doesn't. Demo must never reach real users' data. |
| **Delete account inside the app** | Apple 5.1.1(v), Play account-deletion policy (any app that creates accounts) | Settings › Delete account → confirm → server delete. A web link is only the fallback. Also give Play a web URL for deletion (Data safety asks). |
| **No dead ends** | 2.1 / 4.0 | Demo mode turns off pushes with a sentence, hides internal/server options, keeps support/feedback working. Nothing behind VPN/private servers. |
| **App Tracking Transparency, if you track or show personalized ads** | 2.1 / 5.1.2 — we were rejected because the ATT prompt didn't show **on iPad** | Request ATT when the app is **active** (AppState `active`), *before* the ads consent (UMP) form, and test on an iPad simulator. No tracking → don't add ATT and answer "No tracking" in App Privacy. |
| **Privacy policy covers the app** | 5.1.1 / Play User Data | Names what the app keeps: account, push token, crash/analytics SDKs, processors. Public URL, no login. |
| **Support URL** | ASC requires it | Real page: email + how to sign in, sign out, delete the account. |
| **Payments** | 3.1.1 | Digital goods only through IAP / Play Billing (RevenueCat is fine). No "buy on our website" text or links in the app. |
| **Subscriptions** | 3.1.2 — we got an automated reject within a day | Put a **Terms of Use (EULA) link + Privacy link in the App Store description of every locale** (privacy URL field alone is not enough). Standard EULA: `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`. Paywall shows price, period, auto-renew, restore, terms + privacy links. |
| **Subscription must give ongoing value** | 3.1.2(a) | A "supporter" sub that unlocks nothing ongoing is at risk; tie it to a real ongoing benefit or limit. |
| **Export compliance** | build stuck "Missing compliance" | `ITSAppUsesNonExemptEncryption = false` in Info.plist (Expo: `ios.config.usesNonExemptEncryption: false`) when you only use HTTPS. |
| **iPad** | 2.3 / 2.1 | `supportsTablet: true` ⇒ Apple tests on iPad and wants **iPad 13" screenshots**. Not a real iPad app → set it false. |
| **Permission strings** | 5.1.1 | Every `NS…UsageDescription` says *why* in a full sentence ("to scan the barcode on food labels"), never "needed". |
| **Sign in with Apple** | 4.8 | Offering Google/Facebook login on iOS ⇒ also offer Sign in with Apple (or another privacy login option). |
| **Placeholder / beta content** | 2.1 / 2.3 | No "test", "beta", lorem, broken links, empty tabs in the binary or the screenshots. |

Ship all of this **in the binary going to review**: OTA updates can't add native bits and review sees the bundled JS.

## 2. Versions

- Marketing version = ASC version string exactly (`1.0.0` ↔ `1.0.0`).
- Bump iOS build number and Android `versionCode` before every build.
- After an iOS submit, bump the marketing version in the repo and push, or the next build fails ("version already used").
  **Exception (Expo `runtimeVersion: fingerprint`)**: bumping `version` moves the runtime, so the build in review stops
  getting OTAs. Then bump right before the next store build instead.

## 3. Builds

- **iOS**: archive + upload (Xcode, `eas build` + `eas submit`, or fastlane). Wait for the build's
  `processingState: VALID` in ASC (`GET /v1/builds?filter[app]=<id>&sort=-uploadedDate&limit=5`).
  Check the new screens are really in the binary (Expo: `strings <App>.app/main.jsbundle | grep -c "<new text>"`).
- **Android**: a signed **.aab** with the app's **upload key** (`keytool -genkeypair -v -keystore upload.jks -alias upload
  -keyalg RSA -keysize 2048 -validity 10000`). Back the keystore + passwords up somewhere safe — losing it means a
  Play support ticket. Enroll in Play App Signing (default for new apps). Keep R8/ProGuard keep-rules for libs that need them.

## 4. App Store Connect by API (`scripts/asc.mjs`)

```bash
S=<path-to-this-skill>/scripts/asc.mjs
node $S GET  /v1/apps/<id>/appStoreVersions                 # editable version + its id
node $S GET  /v1/apps/<id>/appInfos                          # appInfo id (= ageRatingDeclaration id)
node $S PATCH /v1/appStoreVersions/<v> '{"data":{"type":"appStoreVersions","id":"<v>","attributes":{"versionString":"1.0.0","releaseType":"MANUAL","copyright":"2026 <Owner Name>"}}}'
node $S PATCH /v1/appInfoLocalizations/<l>          # name, subtitle (≤30), privacyPolicyUrl
node $S PATCH /v1/appStoreVersionLocalizations/<l>  # description, keywords (≤100), promotionalText, supportUrl, marketingUrl, whatsNew
node $S PATCH /v1/appInfos/<a>                      # relationships.primaryCategory / secondaryCategory (ids like UTILITIES, EDUCATION)
node $S PATCH /v1/apps/<id> '{"data":{"type":"apps","id":"<id>","attributes":{"contentRightsDeclaration":"DOES_NOT_USE_THIRD_PARTY_CONTENT"}}}'
```

- **Age rating** `PATCH /v1/ageRatingDeclarations/<appInfoId>` (the *editable* appInfo id, not the version id): yes/no
  items are booleans (`advertising, gambling, healthOrWellnessTopics, lootBox, messagingAndChat, parentalControls,
  ageAssurance, socialMedia, socialMediaAgeRestricted, unrestrictedWebAccess, userGeneratedContent`), the rest are level
  strings `"NONE"` — and **`contests` is a level string**. A `null` field (e.g. new `socialMedia`) blocks submission.
- **Price (free)**: `GET /v1/apps/<id>/appPricePoints?filter[territory]=USA&limit=1` (customerPrice 0.0) → `POST
  /v1/appPriceSchedules` (`baseTerritory USA`, `manualPrices` → included `appPrices` id `${p0}`, `startDate: null`).
- **Availability**: `POST /v2/appAvailabilities` with `availableInNewTerritories: true` and one included
  `territoryAvailabilities` (`available: true`) per id from `GET /v1/territories?limit=200`.
- **Review details**: `POST /v1/appStoreReviewDetails` (relationship `appStoreVersion`): contact name/phone/email,
  `demoAccountName/Password`, `demoAccountRequired: true`, notes = numbered steps to the demo data + where Delete account
  is + any external services/hardware/regions the reviewer needs to know.
- **Screenshots**: iPhone 6.9" (1320×2868) always; iPad 13" (2064×2752) when the app supports tablet → `store-screenshots`.
- **App Privacy = web UI only.** No API; submitting without it fails `STATE_ERROR.APP_DATA_USAGES_REQUIRED`. Answer
  for the whole app incl. SDKs (analytics, crash, ads). A typical sign-in app with a support form: Email Address +
  Customer Support, App Functionality, linked to user, not tracking. Then **Publish**.
- Attach build: `PATCH /v1/appStoreVersions/<v>/relationships/build`, then submit with the 3-step `reviewSubmissions`
  flow in [ios-submit.md](ios-submit.md) (the old `appStoreVersionSubmissions` CREATE returns 403).
  **Run the "add item" step early**: its 409 lists everything still missing — a free checklist.
- A 401 after a long run = the 18-minute JWT expired; just rerun.

## 5. Google Play

- **New app = Play Console web UI first**: Create app (name ≤30, default language, App, Free, declarations). Then
  **App content**: privacy policy, App access (review login + steps), Ads, Content rating questionnaire, Target
  audience, News, Data safety, Government, Financial features, Health. **Store settings**: category, email, website.
- **Data safety**: easiest via Data safety › *Export to CSV* → edit → *Import from CSV*. **Export once before
  changing anything** so you have a way back. After import, re-check each page ("Can users log in with accounts
  created outside the app?" is often left blank and blocks Next).
- **New personal developer accounts must run a closed test: 12+ testers opted in for 14 continuous days** before
  production access. Check the Dashboard on day one and start it immediately — it's the long pole.
- On an app never published, API releases must be `status: draft` ("Only releases with status draft may be created on
  draft app"); then press **Send changes for review** on Publishing overview.
- **Managed publishing can't be turned on before the first publish.** To hold the launch, send the first review through
  closed testing, not production.
- Closed testing on a draft app: countries are "Synced with production", so set countries on the production track (it
  stays empty). Needs a tester email list.
- Sending from Publishing overview while another change is "in review" **cancels and restarts that review** — check first.
- Play has **no discard for a saved, unsent change**: put the live value back and Save.
- An API listing commit can wipe descriptions typed in the Console: keep Play text in the repo and push it with the
  images (`store-listings` skill).
- Graphics: icon 512×512, feature graphic 1024×500, 2–8 phone screenshots (+7"/10" tablet if the app has tablet layouts).
- Production release `status: completed` (100%) unless a staged rollout is wanted.
- Expect: Apple ~1–2 days; Play first review up to 7 days.

## 6. Rejections we hit and how they were fixed

| Rejection | Cause | Fix |
|---|---|---|
| 3.1.2 "no functional link to the Terms of Use (EULA)" (automated, < 1 day) | Auto-renew sub, links only in the app | EULA + privacy lines appended to every locale's description, resubmitted same build |
| 2.1 ATT prompt not shown (iPad) | ATT requested too early / before the app was active | Request on AppState `active`, before the ads consent form; tested on iPad sim |
| 2.1 Information Needed | Reviewer couldn't see what the app does | Review notes rewritten: purpose, demo login, steps, external services, regions. Plus a **screen recording on a real device starting from app launch**, attached via `appStoreReviewAttachments` or "Reply to App Review" |
| `APP_DATA_USAGES_REQUIRED` on submit | App Privacy never published | Fill it in the web UI, press Publish |
| 409 on submit, `socialMedia` null | New age-rating field | PATCH the editable appInfo's ageRatingDeclaration |
| Sub review screenshot FAILED `IMAGE_INCORRECT_DIMENSIONS` | Not an exact App Store size | Use an iPhone capture at an exact size (1206×2622 or 1242×2688), re-upload, wait for `COMPLETE` |
| `FIRST_SUBSCRIPTION_MUST_BE_SUBMITTED_ON_VERSION` | First IAP/sub can't go alone | Create the reviewSubmission by API, add each sub **and the group** via ASC web "Add for Review", then add the version item and submit (details in ios-submit.md) |
| Play "Add a full description to save" | API listing commit wiped Console text | Push text from repo files together with images |

**Resubmit after a rejection (same build), by API:** PATCH the rejected `reviewSubmissionItems/<id>`
`{"attributes":{"resolved":true}}`, then PATCH `reviewSubmissions/<id>` `{"attributes":{"submitted":true}}`.
The rejection reason text is **not** in the API — read it in ASC web (App Review › submission).

## 7. Submit and hand back

- iOS: build VALID → attached → review details + App Privacy → `reviewSubmissions` → `WAITING_FOR_REVIEW`.
  MANUAL release ⇒ after approval someone presses Release.
- Play: release on the right track → **Send for review**. Managed publishing ⇒ publish after approval.
- Report: what's in review where, the review login, what the owner must still do (2FA/identity/payments), expected timing.

## Related skills in this pack

| Step | Skill |
|---|---|
| Store text in every language (title, subtitle, keywords, descriptions, What's New), push to both stores | `store-listings` |
| Capturing screens, rendering exact-size screenshots + feature graphic per language, uploading | `store-screenshots` |
| iOS submit / resubmit API details | [ios-submit.md](ios-submit.md) |
