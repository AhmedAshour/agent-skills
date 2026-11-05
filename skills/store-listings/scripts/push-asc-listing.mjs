#!/usr/bin/env node
/**
 * Push App Store listing text for every locale from files, by the App Store Connect API.
 * Creates missing locales, patches existing ones. Only touches the editable version / appInfo.
 *
 *   node push-asc-listing.mjs --root=<repo> --dry-run     # validate + show what would change
 *   node push-asc-listing.mjs --root=<repo>               # write (draft until you submit)
 *   node push-asc-listing.mjs --root=<repo> --locale=de-DE
 *
 * Files: <repo>/app_store/ios/<asc-locale>/
 *   name.txt (≤30)  subtitle.txt (≤30)  keywords.txt (≤100, comma-separated)
 *   description.txt (≤4000)  promotional_text.txt (≤170)  whats_new.txt (≤4000, not on a first version)
 * Missing file = field left alone.
 * <repo>/app_store/store-kit.json: { "apple": { "appId": "123", "urls": { "privacy": "…", "support": "…", "marketing": "…" } } }
 *
 * Key: env ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH, or those lines in ASC_CONFIG (default ~/.config/asc/config.env).
 */
import { createSign } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const ROOT = path.resolve(arg('root') ?? '.');
const DRY = process.argv.includes('--dry-run');
const ONLY = arg('locale');
const kit = JSON.parse(readFileSync(path.join(ROOT, 'app_store/store-kit.json'), 'utf8'));
const APP = kit.apple?.appId; if (!APP) throw new Error('store-kit.json needs apple.appId');
const URLS = kit.apple?.urls ?? {};
const DIR = path.join(ROOT, 'app_store/ios');

// ── auth
const HOME = process.env.HOME, CFG = process.env.ASC_CONFIG ?? path.join(HOME, '.config/asc/config.env');
const fileEnv = existsSync(CFG) ? Object.fromEntries(readFileSync(CFG, 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).replace(/^export /, ''), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])) : {};
const env = { ...fileEnv, ...Object.fromEntries(['ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_PRIVATE_KEY_PATH'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
if (!env.ASC_ISSUER_ID || !env.ASC_KEY_ID || !env.ASC_PRIVATE_KEY_PATH) throw new Error(`Set ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH (env or ${CFG})`);
const KEY = readFileSync(env.ASC_PRIVATE_KEY_PATH.replace(/^~/, HOME));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' }), b = b64({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' });
  return `${h}.${b}.${createSign('SHA256').update(`${h}.${b}`).sign({ key: KEY, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(method, p, body) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`https://api.appstoreconnect.apple.com${p}`, { method, headers: { Authorization: `Bearer ${token()}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const t = await r.text();
    if (r.status >= 500 && i < 2) { await new Promise((s) => setTimeout(s, 2000)); continue; }
    if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${t.slice(0, 600)}`);
    return t ? JSON.parse(t) : {};
  }
}

// ── read + validate files
const CAPS = { name: 30, subtitle: 30, keywords: 100, description: 4000, promotional_text: 170, whats_new: 4000 };
const read = (loc, f) => { const p = path.join(DIR, loc, `${f}.txt`); return existsSync(p) ? readFileSync(p, 'utf8').trim() : undefined; };
const locales = readdirSync(DIR).filter((d) => !d.startsWith('.') && (!ONLY || d === ONLY));
const problems = [], data = {};
for (const loc of locales) {
  const d = Object.fromEntries(Object.keys(CAPS).map((f) => [f, read(loc, f)]).filter(([, v]) => v !== undefined));
  if (d.keywords) d.keywords = d.keywords.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).join(',');
  for (const [f, cap] of Object.entries(CAPS)) if (d[f] && [...d[f]].length > cap) problems.push(`${loc}/${f}: ${[...d[f]].length} > ${cap}`);
  if (d.keywords) {
    const used = new Set(`${d.name ?? ''} ${d.subtitle ?? ''}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const dup = d.keywords.toLowerCase().split(',').filter((k) => used.has(k));
    if (dup.length) console.warn(`  ! ${loc}: keywords repeat title/subtitle words (wasted): ${dup.join(', ')}`);
  }
  data[loc] = d;
}
if (problems.length) { console.error('Too long:\n  ' + problems.join('\n  ')); process.exit(1); }

// ── find editable appInfo + version
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY', 'WAITING_FOR_REVIEW'];
const infos = (await api('GET', `/v1/apps/${APP}/appInfos`)).data;
const info = infos.find((i) => !['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_INFO'].includes(i.attributes.state ?? i.attributes.appStoreState)) ?? infos[0];
const vers = (await api('GET', `/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=10`)).data;
const ver = vers.find((v) => EDITABLE.includes(v.attributes.appStoreState));
if (!ver) throw new Error(`No editable iOS version — create one first (states: ${vers.map((v) => `${v.attributes.versionString}:${v.attributes.appStoreState}`).join(', ')})`);
const firstVersion = !vers.some((v) => v.attributes.appStoreState === 'READY_FOR_SALE' || v.attributes.appStoreState === 'REPLACED_WITH_NEW_VERSION');
console.log(`app ${APP} · appInfo ${info.id} · version ${ver.attributes.versionString} (${ver.attributes.appStoreState})${DRY ? ' · DRY RUN' : ''}`);

const infoLocs = async () => Object.fromEntries((await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`)).data.map((l) => [l.attributes.locale, l]));
const verLocs = async () => Object.fromEntries((await api('GET', `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?limit=50`)).data.map((l) => [l.attributes.locale, l]));
let IL = await infoLocs(), VL = await verLocs();

for (const [loc, d] of Object.entries(data)) {
  const infoAttrs = Object.fromEntries(Object.entries({ name: d.name, subtitle: d.subtitle, privacyPolicyUrl: URLS.privacy }).filter(([, v]) => v !== undefined));
  const verAttrs = Object.fromEntries(Object.entries({
    description: d.description, keywords: d.keywords, promotionalText: d.promotional_text,
    whatsNew: firstVersion ? undefined : d.whats_new, supportUrl: URLS.support, marketingUrl: URLS.marketing,
  }).filter(([, v]) => v !== undefined));
  const isNew = !IL[loc];
  console.log(`${isNew ? '+ create' : '~ update'} ${loc}: ${[...Object.keys(infoAttrs), ...Object.keys(verAttrs)].join(', ')}`);
  if (DRY) continue;
  if (isNew) {
    if (!d.name) throw new Error(`${loc}: new locale needs name.txt`);
    await api('POST', '/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: { locale: loc, ...infoAttrs },
      relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } });
    VL = await verLocs(); // creating an appInfo locale usually creates the version locale too
  } else {
    await api('PATCH', `/v1/appInfoLocalizations/${IL[loc].id}`, { data: { type: 'appInfoLocalizations', id: IL[loc].id, attributes: infoAttrs } });
  }
  if (VL[loc]) {
    await api('PATCH', `/v1/appStoreVersionLocalizations/${VL[loc].id}`, { data: { type: 'appStoreVersionLocalizations', id: VL[loc].id, attributes: verAttrs } });
  } else {
    await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale: loc, ...verAttrs },
      relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: ver.id } } } } });
  }
}
if (!DRY) {
  IL = await infoLocs(); VL = await verLocs();
  const miss = Object.keys(data).filter((l) => !IL[l] || !VL[l]);
  console.log(miss.length ? `! not present after push: ${miss.join(', ')}` : `done: ${Object.keys(data).length} locales`);
}
