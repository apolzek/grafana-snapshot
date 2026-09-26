// Uploads the packaged extension to the Chrome Web Store and submits it for review,
// using the Chrome Web Store API v2 with a service account.
//
//   CWS_PUBLISHER_ID=...        Developer Dashboard > Publisher > Settings
//   CWS_EXTENSION_ID=...        the item's ID (after the first, manual upload)
//   CWS_SERVICE_ACCOUNT_KEY=... the service account's JSON key (file contents)
//   node scripts/publish-cws.mjs [path/to/extension.zip] [--upload-only]
//
// See docs/publishing.md for the one-time setup.
import { createSign } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const base64url = (input) => Buffer.from(input).toString('base64url');

/** Signed JWT assertion for Google's OAuth 2.0 service-account flow. */
export function createAssertion(key, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(key.private_key, 'base64url')}`;
}

async function request(url, init, what) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${what} failed (HTTP ${res.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

async function accessToken(key) {
  const body = await request(
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: createAssertion(key),
      }),
    },
    'Token request'
  );
  return body.access_token;
}

async function main() {
  const args = process.argv.slice(2);
  const uploadOnly = args.includes('--upload-only');
  const { CWS_PUBLISHER_ID: publisher, CWS_EXTENSION_ID: extension, CWS_SERVICE_ACCOUNT_KEY: rawKey } = process.env;
  if (!publisher || !extension || !rawKey) {
    throw new Error('CWS_PUBLISHER_ID, CWS_EXTENSION_ID and CWS_SERVICE_ACCOUNT_KEY must be set (see docs/publishing.md)');
  }

  const root = path.resolve(import.meta.dirname, '..');
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const zipPath = args.find((a) => !a.startsWith('--')) || path.join(root, `grafana-snapshot-${version}.zip`);
  const zip = await fs.readFile(zipPath);

  const token = await accessToken(JSON.parse(rawKey));
  const auth = { authorization: `Bearer ${token}` };
  const item = `${API}/v2/publishers/${publisher}/items/${extension}`;

  console.log(`Uploading ${path.basename(zipPath)} (${zip.length} bytes)…`);
  const upload = await request(
    `${API}/upload/v2/publishers/${publisher}/items/${extension}:upload`,
    { method: 'POST', headers: { ...auth, 'content-type': 'application/zip' }, body: zip },
    'Upload'
  );
  let state = upload.uploadState;
  for (let i = 0; state === 'IN_PROGRESS' && i < 30; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const status = await request(`${item}:fetchStatus`, { headers: auth }, 'Status check');
    state = status.lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new Error(`Upload did not succeed: ${JSON.stringify(upload)}`);
  console.log(`Uploaded version ${upload.crxVersion || version}.`);

  if (uploadOnly) {
    console.log('Upload only: not submitting for review.');
    return;
  }
  const published = await request(
    `${item}:publish`,
    { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' },
    'Publish'
  );
  console.log('Submitted for review:', JSON.stringify(published));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
