# iOS submit-for-review (App Store Connect API)

Use `scripts/asc.mjs <METHOD> <path> [body]` for every call below.

## Don't use `appStoreVersionSubmissions`

`POST /v1/appStoreVersionSubmissions` → `403 … does not allow 'CREATE'`. Apple moved submit to **`reviewSubmissions`**.

## Discover state first

```http
GET /v1/apps/{appId}/appStoreVersions?limit=15
GET /v1/builds?filter[app]={appId}&sort=-uploadedDate&limit=10&fields[builds]=version,uploadedDate,processingState,expired
```

| Signal | Meaning |
| --- | --- |
| Version `READY_FOR_SALE` | Live version — the What's New baseline |
| Version `PREPARE_FOR_SUBMISSION` | Editable — attach the build here |
| Version `WAITING_FOR_REVIEW` | Already submitted |
| Build `processingState: VALID` | Safe to attach |
| Build `expired: true` | Unusable |

Always query ASC; don't trust the version in git.

## Step A — What's New + attach build

```http
PATCH /v1/appStoreVersionLocalizations/{locId}
{ "data": { "type": "appStoreVersionLocalizations", "id": "…", "attributes": { "whatsNew": "• …\n• …" } } }

PATCH /v1/appStoreVersions/{versionId}/relationships/build
{ "data": { "type": "builds", "id": "{buildId}" } }
```

Patch **every** locale (a first version has no What's New). Attach the build **before** adding the submission item.

## Step B — three-step submission

1. Create:
```http
POST /v1/reviewSubmissions
{ "data": { "type": "reviewSubmissions", "attributes": { "platform": "IOS" },
  "relationships": { "app": { "data": { "type": "apps", "id": "{appId}" } } } } }
```
   Comes back `READY_FOR_REVIEW` with zero items — not submitted yet. Existing ones:
   `GET /v1/apps/{appId}/reviewSubmissions?filter[platform]=IOS` (an empty leftover can be reused).

2. Add the version:
```http
POST /v1/reviewSubmissionItems
{ "data": { "type": "reviewSubmissionItems", "relationships": {
  "reviewSubmission": { "data": { "type": "reviewSubmissions", "id": "{submissionId}" } },
  "appStoreVersion":  { "data": { "type": "appStoreVersions",  "id": "{versionId}" } } } } }
```
   A 409 here lists everything still missing (privacy, age rating, screenshots…). A one-off **HTTP 500** happens with
   a valid payload: retry the same POST once before changing anything.

3. Submit:
```http
PATCH /v1/reviewSubmissions/{submissionId}
{ "data": { "type": "reviewSubmissions", "id": "{submissionId}", "attributes": { "submitted": true } } }
```
   → `WAITING_FOR_REVIEW`. `409 … does not have any items` = step 2 didn't stick.

## After submit

- Bump the marketing version in the repo and push (see the fingerprint exception in SKILL.md).
- `releaseType: MANUAL` ⇒ approved builds sit at `PENDING_DEVELOPER_RELEASE` until someone releases.

## First subscriptions / IAP with a version

- All by API: create the draft reviewSubmission (step 1), then `POST /v1/reviewSubmissionItems` once per item with
  relationship `subscriptionGroupVersion` (id from `GET /v1/subscriptionGroups/{id}/versions`), `subscriptionVersion`
  (id from `GET /v1/subscriptions/{id}/versions`) or `inAppPurchaseVersion` (`GET /v2/inAppPurchases/{id}/versions`),
  then the `appStoreVersion` item, then `submitted: true`. Without the group: 409 "must be submitted with its
  subscription group version".
- Names/descriptions live on the version: `POST /v2/subscriptionLocalizations`, `/v2/subscriptionGroupLocalizations`,
  `/v2/inAppPurchaseLocalizations` with relationship `version`. An APPROVED version is locked; `POST
  /v1/subscriptionVersions` (etc.) makes a new one. The v1 localization, image and `*Submissions` endpoints are
  deprecated and removed in early 2027.
- Each subscription needs a review screenshot at an exact App Store size (e.g. 1242×2688, 1206×2622); wrong sizes go
  FAILED `IMAGE_INCORRECT_DIMENSIONS`. Wait for `assetDeliveryState.state == "COMPLETE"` (UPLOAD_COMPLETE isn't done).
- Auto-renewable sub ⇒ Terms of Use (EULA) + Privacy links in **every** locale's description (3.1.2).

## Resubmit after a rejection

- Read the reason in ASC web (App Review › the submission) — it's not in the API.
- Fix, then: `PATCH /v1/reviewSubmissionItems/{itemId}` `{"data":{"type":"reviewSubmissionItems","id":"…","attributes":{"resolved":true}}}`
  → `PATCH /v1/reviewSubmissions/{id}` `submitted: true`. Same build is fine if the fix was metadata/notes.
- **2.1 Information Needed**: answer in `appStoreReviewDetails.notes` (PATCH). If they ask for a video: record on a
  **real device starting from app launch**, then attach: `POST appStoreReviewAttachments` {fileName, fileSize,
  rel appStoreReviewDetail} → PUT each `uploadOperations` part → PATCH `uploaded:true` + md5 `sourceFileChecksum` →
  wait for `COMPLETE`. Or use "Reply to App Review" in the web UI.
- To swap assets that are locked while in review: `PATCH reviewSubmissions/{id}` `canceled: true` (withdraws the
  version; build + notes stay), change, resubmit.

## Checklist

- [ ] Build VALID and attached
- [ ] What's New on every locale (not on a 1.0)
- [ ] App Privacy published, age rating complete, price + availability set, review details with demo login
- [ ] `reviewSubmissions` → item → `submitted: true` → `WAITING_FOR_REVIEW`
- [ ] Marketing version bumped in the repo
