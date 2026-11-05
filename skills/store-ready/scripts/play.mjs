#!/usr/bin/env node
// Google Play Developer API, one call: SA=<service-account.json> node play.mjs <METHOD> <package/path…> [json-body]
// e.g. node play.mjs POST com.example.app/edits '{}'   (404 "Package not found" = app not created, or no AAB uploaded yet)
// Service account: the JSON key of a Google Cloud service account invited in Play Console › Users and permissions.
import fs from 'fs'; import crypto from 'crypto';
const sa = JSON.parse(fs.readFileSync(process.env.SA ?? process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000);
const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 });
const jwt = u + '.' + crypto.sign('sha256', Buffer.from(u), sa.private_key).toString('base64url');
const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) })).json();
const [method, path, body] = process.argv.slice(2);
const r = await fetch('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + path, { method, headers: { authorization: 'Bearer ' + t.access_token, 'content-type': 'application/json' }, body: body || undefined });
console.log(r.status, (await r.text()).slice(0, parseInt(process.env.MAX || '6000')));
