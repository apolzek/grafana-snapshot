import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, it } from 'node:test';
import { createAssertion } from '../../scripts/publish-cws.mjs';

describe('createAssertion', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = {
    client_email: 'publisher@project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };

  it('builds a JWT for the Chrome Web Store scope, signed with the service account key', () => {
    const jwt = createAssertion(key, 1_700_000_000);
    const [header, claims, signature] = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), { alg: 'RS256', typ: 'JWT' });
    assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), {
      iss: 'publisher@project.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/chromewebstore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    assert.equal(verifier.verify(publicKey, signature, 'base64url'), true);
  });
});
