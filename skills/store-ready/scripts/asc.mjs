#!/usr/bin/env node
// App Store Connect API, one call: node asc.mjs <METHOD> <path> [json-body|@file.json]
// Key: env ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH (AuthKey_XXXX.p8), or the same lines in
// ASC_CONFIG (default ~/.config/asc/config.env). ES256 JWT, 18 min. MAX=<chars> trims the output.
import fs from 'fs'; import crypto from 'crypto'; import path from 'path';
const CFG = process.env.ASC_CONFIG ?? path.join(process.env.HOME, '.config/asc/config.env');
const fileEnv = fs.existsSync(CFG) ? Object.fromEntries(fs.readFileSync(CFG, 'utf8').split('\n')
  .filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).replace(/^export /, ''), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })) : {};
const env = { ...fileEnv, ...Object.fromEntries(['ASC_ISSUER_ID', 'ASC_KEY_ID', 'ASC_PRIVATE_KEY_PATH'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
if (!env.ASC_ISSUER_ID || !env.ASC_KEY_ID || !env.ASC_PRIVATE_KEY_PATH) { console.error('Set ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY_PATH (env or ' + CFG + ')'); process.exit(1); }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const head = b64({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' }), claims = b64({ iss: env.ASC_ISSUER_ID, aud: 'appstoreconnect-v1', exp: Math.floor(Date.now() / 1000) + 1100 });
const sig = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key: fs.readFileSync(env.ASC_PRIVATE_KEY_PATH.replace(/^~/, process.env.HOME)), dsaEncoding: 'ieee-p1363' }).toString('base64url');
let [method, p, body] = process.argv.slice(2);
if (body?.startsWith('@')) body = fs.readFileSync(body.slice(1), 'utf8');
const r = await fetch('https://api.appstoreconnect.apple.com' + p, { method, headers: { authorization: `Bearer ${head}.${claims}.${sig}`, 'content-type': 'application/json' }, body: body || undefined });
console.log(r.status); const t = await r.text(); console.log(t.slice(0, parseInt(process.env.MAX || '6000')));
