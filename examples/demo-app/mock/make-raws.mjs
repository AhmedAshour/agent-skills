// Renders the fake demo screens as if captured on a 6.9" iPhone (1320x2868), into both styles' inputs:
//   app_store/raw/<locale>/<screen>.png   (caption-phone reads these directly)
//   mock/captures/<set>_<screen>.png      (lifted-cards: prep-raw.py --src=mock/captures)
// Run: node mock/make-raws.mjs   (uses the kit's playwright: cd skills/store-screenshots/kit && npm ci)
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(HERE, '../../../skills/store-screenshots/kit/package.json'));
const { chromium } = require('playwright');

const LOCALES = { en: 'en-US', de: 'de-DE', ar: 'ar-SA' };
const SCREENS = ['today', 'progress', 'add'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
await mkdir(path.join(HERE, 'captures'), { recursive: true });
for (const [lang, folder] of Object.entries(LOCALES)) {
  await mkdir(path.join(HERE, '../app_store/raw', folder), { recursive: true });
  for (const screen of SCREENS) {
    await page.goto(`${pathToFileURL(path.join(HERE, 'screen.html')).href}?lang=${lang}&screen=${screen}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(HERE, '../app_store/raw', folder, `${screen}.png`) });
    await page.screenshot({ path: path.join(HERE, 'captures', `${lang}_${screen}.png`) });
  }
}
await browser.close();
console.log('raws written');
