/**
 * store-kit Play publisher — listing text, store details, icon, phone + tablet
 * screenshots and feature graphic for every locale, in one Play edit.
 *
 * Run from the skill folder with --root=<repo> (one-time: npm ci in the kit folder).
 * Everything app-specific is in app_store/store-kit.json:
 *   package, icon, play.locales [{ play, text, images }], play.details (optional)
 *
 * Text  <- app_store/android/<text>/{title,short_description,full_description}.txt
 * Images<- app_store/screenshots/{play-phone,play-7,play-10,play-feature}/<images>/*.png
 * `images.deleteall` runs first per image type, so a rerun replaces, never stacks.
 * Refuses to push while app_store/screenshots/placeholders.json lists missing frames.
 *
 * Not pushed: privacy URL (Console → App content) and release notes (need a
 * release on a track; paste app_store/android/<locale>/changelogs/ by hand).
 *
 * Credentials (one of): GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / GOOGLE_PLAY_SERVICE_ACCOUNT_PATH
 * (the JSON key from Google Cloud). Service account needs Release manager.
 *
 *   --dry-run      validate, discard the edit
 *   --text-only    text + details only
 *   --images-only  screenshots + feature graphic only (no text, details or icon)
 *   (no flag)      COMMITS everything — goes live immediately
 *   node <skill>/kit/publish-play-listing.mjs --root=<repo> [--dry-run]
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { google } from 'googleapis';
import sharp from 'sharp';

const rootArg = process.argv.find((a) => a.startsWith('--root='))?.split('=')[1];
const ROOT = rootArg ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = JSON.parse(readFileSync(join(ROOT, 'app_store', 'store-kit.json'), 'utf8'));
const PACKAGE_NAME = KIT.package;

/** Play locale -> android/<text>/ copy and screenshots/<target>/<images>/ frames. */
const LOCALES = KIT.play.locales;

const ICON_PATH = join(ROOT, KIT.icon ?? 'assets/icon.png');
const PLAY_ICON_SIZE = 512;
const SHOT_ROOT = join(ROOT, 'app_store', 'screenshots');

/** Store contact / default language (optional) — mirrors store.config.json + support page. */
const STORE_DETAILS = KIT.play.details ?? null;

/** imageType -> render target folder. Order here is the order they push. */
const IMAGE_SETS = [
  { type: 'phoneScreenshots', target: 'play-phone', label: 'phone screenshots' },
  { type: 'sevenInchScreenshots', target: 'play-7', label: '7" tablet screenshots' },
  { type: 'tenInchScreenshots', target: 'play-10', label: '10" tablet screenshots' },
  { type: 'featureGraphic', target: 'play-feature', label: 'feature graphic', single: true },
];

async function loadPlayIcon() {
  return sharp(ICON_PATH).resize(PLAY_ICON_SIZE, PLAY_ICON_SIZE).png().toBuffer();
}

function loadCredentials() {
  const inline = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline);
  const path = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH;
  if (path) return JSON.parse(readFileSync(path, 'utf8'));
  console.error(
    'Missing credentials. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (key contents) or ' +
      'GOOGLE_PLAY_SERVICE_ACCOUNT_PATH (path to the key file).',
  );
  process.exit(1);
}

function readListing(locale) {
  const dir = join(ROOT, 'app_store', 'android', locale.text);
  const read = (f) => readFileSync(join(dir, f), 'utf8').trim();
  const listing = {
    language: locale.play,
    title: read('title.txt'),
    shortDescription: read('short_description.txt'),
    fullDescription: read('full_description.txt'),
  };

  // Play rejects overlong fields with an opaque 400; fail here instead.
  const caps = { title: 30, shortDescription: 80, fullDescription: 4000 };
  for (const [field, cap] of Object.entries(caps)) {
    if (listing[field].length > cap) {
      throw new Error(
        `${locale.play}/${field} is ${listing[field].length} chars, cap is ${cap}`,
      );
    }
  }
  return listing;
}

/** Sorted PNGs in a dir — filename order is the listing order (01-…, 02-…). */
function loadPngBuffers(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()
    .map((f) => readFileSync(join(dir, f)));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function replaceImages(publisher, editId, language, imageType, buffers) {
  await publisher.edits.images
    .deleteall({ packageName: PACKAGE_NAME, editId, language, imageType })
    .catch(() => {});
  for (const buf of buffers) {
    let lastErr;
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await publisher.edits.images.upload({
          packageName: PACKAGE_NAME,
          editId,
          language,
          imageType,
          media: { mimeType: 'image/png', body: Readable.from(buf) },
        });
        lastErr = null;
        // Pace uploads — Play often 500s when hammered.
        await sleep(400);
        break;
      } catch (err) {
        lastErr = err;
        const status = err?.status ?? err?.code;
        if (status !== 500 && status !== 503 && status !== 429) throw err;
        const waitMs = 2000 * attempt;
        console.warn(
          `  ↻ retry ${attempt}/6 ${language} ${imageType} after ${status} (${waitMs}ms)`,
        );
        await sleep(waitMs);
      }
    }
    if (lastErr) throw lastErr;
  }
}

/** Mirror of the guard in store.config.js — placeholders must never go live. */
function assertNoPlaceholders() {
  const manifest = join(SHOT_ROOT, 'placeholders.json');
  if (!existsSync(manifest)) return;
  const { missing = [] } = JSON.parse(readFileSync(manifest, 'utf8'));
  if (missing.length) {
    throw new Error(
      `Refusing to publish: ${missing.length} screenshot(s) are placeholders ` +
        `(${missing.join(', ')}). Add the captures under app_store/raw/<locale>/ ` +
        'and rerun `npm run store:render`.',
    );
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const textOnly = process.argv.includes('--text-only');
  const imagesOnly = process.argv.includes('--images-only');
  if (textOnly && imagesOnly) throw new Error('--text-only and --images-only exclude each other');
  if (!textOnly) assertNoPlaceholders();

  const auth = new google.auth.GoogleAuth({
    credentials: loadCredentials(),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const publisher = google.androidpublisher({ version: 'v3', auth });

  const { data: edit } = await publisher.edits.insert({ packageName: PACKAGE_NAME });
  const editId = edit.id;
  if (!editId) throw new Error('Play API did not return an edit id');
  console.log(
    `Opened edit ${editId} for ${PACKAGE_NAME}` +
      `${dryRun ? ' (dry run)' : ''}${textOnly ? ' (text-only)' : ''}${imagesOnly ? ' (images-only)' : ''}`,
  );

  try {
    if (STORE_DETAILS && !imagesOnly) {
      await publisher.edits.details.patch({
        packageName: PACKAGE_NAME,
        editId,
        requestBody: STORE_DETAILS,
      });
      console.log(
        `  ✓ details — lang ${STORE_DETAILS.defaultLanguage}, ` +
          `${STORE_DETAILS.contactWebsite}, ${STORE_DETAILS.contactEmail}`,
      );
    }

    for (const locale of imagesOnly ? [] : LOCALES) {
      const listing = readListing(locale);
      await publisher.edits.listings.update({
        packageName: PACKAGE_NAME,
        editId,
        language: locale.play,
        requestBody: listing,
      });
      console.log(
        `  ✓ ${locale.play} — "${listing.title}" ` +
          `(short ${listing.shortDescription.length}, full ${listing.fullDescription.length})`,
      );
    }

    if (textOnly) {
      console.log('  ⏭ text-only — skipping icon, screenshots, feature graphic');
    } else {
      const icon = imagesOnly ? null : await loadPlayIcon();
      for (const locale of icon ? LOCALES : []) {
        await replaceImages(publisher, editId, locale.play, 'icon', [icon]);
        console.log(`  ✓ ${locale.play} — icon`);
      }

      for (const { type, target, label, single } of IMAGE_SETS) {
        for (const locale of LOCALES) {
          const buffers = loadPngBuffers(join(SHOT_ROOT, target, locale.images));
          if (!buffers.length) {
            console.warn(`  ⚠ ${locale.play} — no ${target} images (skip)`);
            continue;
          }
          // Play allows exactly one feature graphic per locale.
          const payload = single ? buffers.slice(0, 1) : buffers;
          await replaceImages(publisher, editId, locale.play, type, payload);
          console.log(`  ✓ ${locale.play} — ${payload.length} ${label}`);
        }
      }
    }

    try {
      await publisher.edits.validate({ packageName: PACKAGE_NAME, editId });
      console.log('Validated.');
    } catch (err) {
      const status = err?.status ?? err?.code;
      // Some Play accounts return 403 on validate even when listing edits succeed;
      // commit still applies the same draft.
      console.warn(
        `Validate skipped (${status ?? 'error'}: ${err?.message ?? err}). Proceeding to commit.`,
      );
    }

    if (dryRun) {
      await publisher.edits.delete({ packageName: PACKAGE_NAME, editId });
      console.log('Dry run — edit discarded, nothing published.');
      return;
    }

    await publisher.edits.commit({ packageName: PACKAGE_NAME, editId });
    console.log('Committed — live on Play Console.');
  } catch (e) {
    await publisher.edits.delete({ packageName: PACKAGE_NAME, editId }).catch(() => {});
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
