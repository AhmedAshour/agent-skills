#!/usr/bin/env node
/**
 * store-kit App Store screenshot publisher — replaces the iPhone screenshot set on every ASC localization
 * of the editable version with app_store/screenshots/<target>/<folder>/*.png (filename order = listing order).
 * For apps that don't push screenshots through EAS metadata (store.config.js); same API, no EAS.
 *
 *   node <skill>/kit/asc-screenshots.mjs --root=<repo> --dry-run
 *   node <skill>/kit/asc-screenshots.mjs --root=<repo>          # replaces live draft sets
 *   … --target=ios-ipad --type=APP_IPAD_PRO_3GEN_129                                    # the iPad set (supportsTablet apps)
 *
 * app_store/store-kit.json:
 *   "apple": { "appId": "6823517214", "target": "ios-6.9", "displayType": "APP_IPHONE_67",
 *              "locales": { "de-DE": "de-DE", "en-GB": "en-US" } }   ASC locale -> render folder
 * Credentials: env ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH (path to AuthKey_XXXX.p8),
 * or a config.env file with those lines at ASC_CONFIG (default ~/.config/asc/config.env).
 * Only touches an editable version (PREPARE_FOR_SUBMISSION / rejected); refuses placeholders.
 */
import { createHash, createSign } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ROOT = path.resolve(arg('root') ?? '.');
const dry = process.argv.includes('--dry-run');
const kit = JSON.parse(readFileSync(path.join(ROOT, 'app_store/store-kit.json'), 'utf8'));
const A = kit.apple ?? {};
if (!A.appId || !A.locales) throw new Error('store-kit.json needs apple.appId and apple.locales');
// --target=ios-ipad --type=APP_IPAD_PRO_3GEN_129 uploads a second set (iPad) with the same config.
const TARGET = arg('target') ?? A.target ?? 'ios-6.9', TYPE = arg('type') ?? A.displayType ?? 'APP_IPHONE_67';
const SHOTS = path.join(ROOT, 'app_store/screenshots', TARGET);

const missing = JSON.parse(readFileSync(path.join(ROOT, 'app_store/screenshots/placeholders.json'), 'utf8')).missing ?? [];
if (missing.length) throw new Error(`Refusing: placeholder frames (${missing.join(', ')}) — add captures and re-render`);

// ── ASC JWT (ES256): env vars first, else ASC_CONFIG / ~/.config/asc/config.env
const HOME = process.env.HOME, CFG = process.env.ASC_CONFIG ?? path.join(HOME, '.config/asc/config.env');
const fileEnv = existsSync(CFG) ? Object.fromEntries(readFileSync(CFG, 'utf8')
  .split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).replace(/^export /, ''), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])) : {};
const env = { ...fileEnv, ...Object.fromEntries(['ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_PRIVATE_KEY_PATH'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
if (!env.ASC_ISSUER_ID || !env.ASC_KEY_ID || !env.ASC_PRIVATE_KEY_PATH) throw new Error('Set ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH (env or ' + CFG + ')');
const keyPath = env.ASC_PRIVATE_KEY_PATH.replace(/^~/, HOME);
const KEY = readFileSync(keyPath.startsWith('/') ? keyPath : path.join(path.dirname(CFG), keyPath));
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' }), b = b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  return `${h}.${b}.${createSign('SHA256').update(`${h}.${b}`).sign({ key: KEY, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(method, p, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, { method, headers: { Authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
const versions = (await api('GET', `/v1/apps/${A.appId}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
const ver = versions.find((v) => EDITABLE.includes(v.attributes.appStoreState));
if (!ver) throw new Error(`No editable iOS version (states: ${versions.map((v) => `${v.attributes.versionString}:${v.attributes.appStoreState}`).join(', ')})`);
console.log(`${A.appId} version ${ver.attributes.versionString} (${ver.attributes.appStoreState})${dry ? ' — dry run' : ''}`);

const locs = (await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data;
for (const loc of locs) {
  const L = loc.attributes.locale, folder = A.locales[L];
  if (!folder) { console.log(`  · ${L} — not in apple.locales, untouched`); continue; }
  const dir = path.join(SHOTS, folder);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort() : [];
  if (!files.length) { console.log(`  ⚠ ${L} — no renders in ${TARGET}/${folder}, untouched`); continue; }
  const old = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data.filter((s) => s.attributes.screenshotDisplayType === TYPE);
  if (dry) { console.log(`  ✓ ${L} — would replace ${old.length} set(s) with ${files.length} from ${folder}`); continue; }
  for (const s of old) await api('DELETE', `/v1/appScreenshotSets/${s.id}`);
  const set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: TYPE }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data.id;
  const ids = [];
  for (const f of files) {
    const buf = readFileSync(path.join(dir, f));
    const d = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: f, fileSize: buf.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set } } } } })).data;
    for (const op of d.attributes.uploadOperations) {
      await fetch(op.url, { method: op.method, headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])), body: buf.subarray(op.offset, op.offset + op.length) });
    }
    await api('PATCH', `/v1/appScreenshots/${d.id}`, { data: { type: 'appScreenshots', id: d.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(buf).digest('hex') } } });
    ids.push(d.id);
  }
  // Apple processes asynchronously — wait so a broken file shows up here, not in review
  let states = [];
  for (let i = 0; i < 24; i++) {
    states = await Promise.all(ids.map(async (id) => (await api('GET', `/v1/appScreenshots/${id}`)).data.attributes.assetDeliveryState?.state));
    if (states.every((s) => s === 'COMPLETE' || s === 'FAILED')) break;
    await sleep(5000);
  }
  const bad = states.filter((s) => s !== 'COMPLETE').length;
  console.log(`  ${bad ? '✗' : '✓'} ${L} — ${files.length} uploaded from ${folder}${bad ? `, ${bad} not COMPLETE (${states.join(',')})` : ''}`);
  if (bad) process.exitCode = 1;
}
