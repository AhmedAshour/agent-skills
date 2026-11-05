#!/usr/bin/env node
/**
 * store-kit render — App Store + Play screenshots, Play feature graphic, and the
 * iOS 27 creative assets (header + search card), from raw device captures.
 *
 * Run from the skill folder with --root=<repo> (one-time: npm ci in the kit folder).
 * Per-app look lives in the repo (template.html, feature.html, header.html,
 * search.html, captions.json, creative.json) — never in this file.
 *
 *   node <skill>/kit/render.mjs --root=<repo> [--locale=de-DE] [--target=ios-6.9|ios-6.5|ios-ipad|play-phone|play-7|play-10|feature|creative]
 *
 * Input:  <rawDir>/<locale>/<screen>.png  (falls back to <rawDir>/<screen>.png)
 *         rawDir = app_store/store-kit.json "rawDir", default app_store/raw
 * Output: app_store/screenshots/<target>/<locale>/<n>-<screen>.png
 *         app_store/screenshots/play-feature/<locale>/feature-graphic.png
 *         app_store/screenshots/ios-header|ios-search/<locale>/{header,search}.png
 *         app_store/screenshots/placeholders.json  ({ missing: [...] } — publishers refuse non-empty)
 *
 * Folders are always the captions.json locale key; each publisher maps them to
 * store language codes (store-kit.json play.locales / store.config.js).
 *
 * Template contract (template.html): ?caption ?sub ?screen ?cw ?ch ?img ?tablet=1
 * ?theme ?focus ?dir (locale._dir, default ltr) ?lang (locale._lang or first 2
 * letters). feature.html, if present, gets ?l1 ?l2 ?sub ?img ?lang ?dir from
 * featureGraphic[locale]; otherwise template.html renders it with ?feature=1.
 *
 * Sizes are exact on purpose — ASC rejects 1284×2778 where it wants 1320×2868.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, access, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// --root=<repo> runs the kit's own copy against any repo (agents, no repo install);
// the synced copy inside a repo resolves its root from its own location (CI).
const rootArg = process.argv.find((a) => a.startsWith('--root='))?.split('=')[1];
const ROOT = rootArg ? path.resolve(rootArg) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = path.join(ROOT, 'app_store/screenshot-tool');
const OUT = path.join(ROOT, 'app_store/screenshots');

const TARGETS = {
  'ios-6.9':    { w: 1320, h: 2868 },               // APP_IPHONE_67 — Apple's required slot
  'ios-6.5':    { w: 1242, h: 2688 },               // APP_IPHONE_65
  'ios-ipad':   { w: 2048, h: 2732, tablet: true }, // APP_IPAD_PRO_3GEN_129 (simulated)
  'play-phone': { w: 1080, h: 1920 },
  'play-7':     { w: 1200, h: 1920, tablet: true }, // sevenInchScreenshots
  'play-10':    { w: 1600, h: 2560, tablet: true }, // tenInchScreenshots
};
const FEATURE = { w: 1024, h: 500 };
const CREATIVE = { header: { w: 3840, h: 1646 }, search: { w: 3840, h: 2560 } };

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const exists = (p) => access(p).then(() => true, () => false);
const readJson = async (p, fallback) => ((await exists(p)) ? JSON.parse(await readFile(p, 'utf8')) : fallback);

async function clearPngs(dir) {
  for (const f of await readdir(dir).catch(() => [])) {
    if (f.toLowerCase().endsWith('.png')) await unlink(path.join(dir, f));
  }
}

/** Waits for fonts + capture; returns families that failed to load (a silent
 *  fallback font is how an off-brand frame ships — fail the run instead). */
async function settle(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const img = document.querySelector('.screen img, img');
    if (img && img.getAttribute('src') && !img.complete) {
      await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
    }
    if (typeof fitDevice === 'function') fitDevice();
    if (typeof fit === 'function') fit();
    return [...document.fonts].filter((f) => f.status === 'error').map((f) => `${f.family} ${f.weight}`);
  });
}

async function main() {
  const kit = await readJson(path.join(ROOT, 'app_store/store-kit.json'), {});
  const RAW = path.join(ROOT, kit.rawDir ?? 'app_store/raw');
  const cfg = JSON.parse(await readFile(path.join(HERE, 'captions.json'), 'utf8'));
  const creative = await readJson(path.join(HERE, 'creative.json'), null);

  const rawFor = async (locale, screen) => {
    for (const p of [path.join(RAW, locale, `${screen}.png`), path.join(RAW, `${screen}.png`)]) {
      if (await exists(p)) return p;
    }
    return null;
  };
  const dirOf = (locale) => cfg.locales[locale]?._dir ?? 'ltr';
  const langOf = (locale) => cfg.locales[locale]?._lang ?? locale.slice(0, 2);

  const onlyLocale = arg('locale');
  const onlyTarget = arg('target');
  const special = ['feature', 'creative'];
  const locales = Object.keys(cfg.locales).filter((l) => !onlyLocale || l === onlyLocale);
  const targets = Object.keys(TARGETS).filter((t) => !onlyTarget || t === onlyTarget);
  if (!locales.length) throw new Error(`No locale matched --locale=${onlyLocale}`);
  if (onlyTarget && !targets.length && !special.includes(onlyTarget)) {
    throw new Error(`No target matched --target=${onlyTarget}`);
  }

  const url = (file) => pathToFileURL(path.join(HERE, file)).href;
  const browser = await chromium.launch();
  const missing = new Set();
  const badFonts = new Set();
  let written = 0;
  const check = async (page) => (await settle(page)).forEach((f) => badFonts.add(f));

  try {
    for (const target of targets) {
      const { w, h, tablet } = TARGETS[target];
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      for (const locale of locales) {
        const dir = path.join(OUT, target, locale);
        await mkdir(dir, { recursive: true });
        await clearPngs(dir); // a screen reorder must not leave two "01-…"s
        for (const [i, { screen, theme, focus }] of cfg.screens.entries()) {
          const copy = cfg.locales[locale][screen];
          if (!copy) throw new Error(`captions.json: ${locale} is missing screen "${screen}"`);
          const rawPath = await rawFor(locale, screen);
          if (!rawPath) missing.add(`${locale}/${screen}`);
          const params = new URLSearchParams({
            caption: copy.caption, sub: copy.sub ?? '', screen,
            cw: String(w), ch: String(h), dir: dirOf(locale), lang: langOf(locale),
          });
          if (theme) params.set('theme', theme);
          if (focus) params.set('focus', focus);
          if (tablet) params.set('tablet', '1');
          if (rawPath) params.set('img', pathToFileURL(rawPath).href);
          await page.goto(`${url('template.html')}?${params}`, { waitUntil: 'load' });
          await check(page);
          await page.screenshot({ path: path.join(dir, `${String(i + 1).padStart(2, '0')}-${screen}.png`), type: 'png' });
          written++;
        }
      }
      await ctx.close();
    }

    // Play feature graphic — feature.html when the app has one, else template ?feature=1.
    if ((!onlyTarget || onlyTarget === 'feature') && cfg.featureGraphic) {
      const ownTemplate = await exists(path.join(HERE, 'feature.html'));
      const ctx = await browser.newContext({ viewport: { width: FEATURE.w, height: FEATURE.h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const heroScreen = cfg.featureGraphic.screen || cfg.screens[0].screen;
      const heroTheme = cfg.featureGraphic.theme || cfg.screens.find((s) => s.screen === heroScreen)?.theme;
      for (const locale of locales) {
        const copy = cfg.featureGraphic[locale];
        if (!copy) continue;
        const dir = path.join(OUT, 'play-feature', locale);
        await mkdir(dir, { recursive: true });
        const hero = await rawFor(locale, heroScreen);
        const params = ownTemplate
          ? new URLSearchParams({ l1: copy.l1 ?? '', l2: copy.l2 ?? '', sub: copy.sub ?? '' })
          : new URLSearchParams({ caption: copy.caption, sub: copy.sub ?? '', screen: heroScreen, feature: '1', cw: String(FEATURE.w), ch: String(FEATURE.h) });
        params.set('dir', dirOf(locale));
        params.set('lang', langOf(locale));
        if (!ownTemplate && heroTheme) params.set('theme', heroTheme);
        if (hero) params.set('img', pathToFileURL(hero).href);
        await page.goto(`${url(ownTemplate ? 'feature.html' : 'template.html')}?${params}`, { waitUntil: 'load' });
        await check(page);
        await page.screenshot({ path: path.join(dir, 'feature-graphic.png'), type: 'png' });
        written++;
      }
      await ctx.close();
    }

    // Optional: App Store product-page header + search assets (header.html / search.html + creative.json).
    if ((!onlyTarget || onlyTarget === 'creative') && creative) {
      const sharp = (await import('sharp')).default;
      for (const kind of ['header', 'search']) {
        if (!creative[kind] || !(await exists(path.join(HERE, `${kind}.html`)))) continue;
        const { w, h } = CREATIVE[kind];
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        for (const locale of Object.keys(creative[kind]).filter((l) => !l.startsWith('_') && (!onlyLocale || l === onlyLocale))) {
          const params = new URLSearchParams({ ...creative[kind][locale], lang: langOf(locale), dir: dirOf(locale) });
          const hero = await rawFor(locale, creative.searchScreen ?? cfg.screens[0].screen);
          if (kind === 'search' && hero) params.set('img', pathToFileURL(hero).href);
          await page.goto(`${url(`${kind}.html`)}?${params}`, { waitUntil: 'load' });
          await check(page);
          const dir = path.join(OUT, `ios-${kind}`, locale);
          await mkdir(dir, { recursive: true });
          // Apple rejects alpha.
          await sharp(await page.screenshot({ type: 'png' })).flatten({ background: '#ffffff' }).removeAlpha().png()
            .toFile(path.join(dir, `${kind}.png`));
          written++;
        }
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }

  // Written every run so a clean rerun clears an old warning. Publishers and
  // store.config.js refuse to push while this is non-empty.
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, 'placeholders.json'), `${JSON.stringify({ missing: [...missing].sort() }, null, 2)}\n`);
  console.log(`Wrote ${written} images to app_store/screenshots/`);
  if (badFonts.size) {
    console.error(`\n✗ Fonts failed to load: ${[...badFonts].join(', ')} — frames used a fallback face. ` +
      'Keep font files in app_store/screenshot-tool/fonts/ (not node_modules) and rerun.');
    process.exitCode = 1;
  }
  if (missing.size) {
    console.warn(`\n⚠  No capture for: ${[...missing].join(', ')} — striped PLACEHOLDER frames, do not upload.\n` +
      `   Add PNGs under ${path.relative(ROOT, RAW)}/<locale>/<screen>.png and rerun.`);
    process.exitCode = 1;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
