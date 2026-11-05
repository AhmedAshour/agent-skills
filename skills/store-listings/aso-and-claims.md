# ASO and claims (any app)

Use with the main skill. Product-specific rules come from **the current repo**,
not from examples in other projects.

## Apple vs Play writing

**Apple**

- Title + subtitle + keywords = one indexed pool. Repeating a title word in
  keywords wastes characters.
- Description is sales + clarity only. Lead with the job-to-be-done, then proof,
  then trust/disclaimer if needed.
- Subtitle should reclaim the capability words you couldn’t fit in the title.

**Play**

- Full description is indexed — weave category and use-case terms into normal
  sentences.
- Short description is the scrap of text under the title in search; make it
  specific, not slogan-only.
- Light structure (line breaks, sparse emoji) is fine; HTML tags are not reliable.

## Title strategy

- Keep the highest-intent category token in the title when it fits (e.g. the
  noun users search).
- Avoid banned or weak title clutter: “Free”, pure hype, competitor names.
- If Apple rejects a bare name as non-unique, add a short truthful suffix; keep
  the same brand stem on Play/device if possible.

## Keywords (Apple)

- Comma-separated, no spaces after commas in the ASC field (EAS arrays are fine
  if the tool joins correctly).
- Prefer misspellings/synonyms and feature nouns not already in title/subtitle.
- Localize meaningfully (don’t paste English keywords into FR/DE).

## Claims hygiene

Before adding a sentence to any store:

1. Is it true of the **shipping** binary (not the roadmap)?
2. Does the in-app UI or privacy policy say the same thing?
3. Could a reviewer falsify it in five minutes?

Default **omit** rather than stretch: offline, “forever” pricing, medical/
religious authority, guaranteed accuracy, competitor digs that you can’t defend.

Disclaimers that limit liability (guidance ≠ certification, best effort, etc.)
belong in the description when the category warrants it — keep them plain and
consistent with the privacy policy.

## Screenshots as ASO

- Captions should match listing voice; localize every locale you ship.
- First frame: core loop. Second: main differentiator or trust proof.
- Don’t show UI the app doesn’t ship; don’t imply accounts/sync/features that
  are off or paid-only without labeling.

## Reviewer notes (Apple)

When the category is sensitive (health, kids, finance, religion, user-generated):

- Explain what the app **does not** claim.
- Say how to reach the main flow with no/demo account if applicable.
- Keep demo credentials out of git; use ASC’s secure fields if needed.

## Locales

Ship locales the product actually supports in-app. Updating EN only and leaving
stale FR/DE is worse than a deliberate “EN first” note to the user.

## When projects disagree

If `CLAUDE.md` / README / this skill conflict on a **product** claim, the
project doc wins. If they conflict on **store mechanics** (sizes, live vs draft),
prefer the project’s CI/scripts, then current Apple/Google docs, then this skill.

## Research recipes

- **App Store rank:** `https://itunes.apple.com/search?term=<q>&country=<cc>&entity=software&limit=50`, ~3 s between calls.
- **Play rank:** open `https://play.google.com/store/search?q=<q>&c=apps&gl=<GL>&hl=<hl>` and read the app ids of
  `a[href*="/store/apps/details?id="]` in page order (logged-in results are personalised, treat as approximate).
- **Play autocomplete:** type the seed into the search box on `play.google.com/store/apps?gl=<GL>&hl=<hl>` and read the
  suggestions (`[role=option]`).
- **Rival short descriptions:** on a Play details page `meta[name=description]` is the short description.
