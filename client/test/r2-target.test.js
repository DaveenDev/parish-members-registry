import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeR2 } from '../../.github/scripts/r2-target.mjs';

const ID = '0123456789abcdef0123456789abcdef';
const ENDPOINT = `https://${ID}.r2.cloudflarestorage.com`;
const KEY = 'fedcba9876543210fedcba9876543210';
const r2 = (accountId, bucket = 'parish-backups') => normalizeR2({ accountId, bucket, accessKeyId: KEY });

describe('backup: tidying R2_ACCOUNT_ID and R2_BACKUP_BUCKET', () => {
  test('a correct Account ID and bucket pass unchanged', () => {
    assert.deepEqual(r2(ID), { endpoint: ENDPOINT, account: ID, bucket: 'parish-backups', notes: [] });
  });

  test('spaces, quotes and capitals are removed', () => {
    assert.equal(r2(` "${ID.toUpperCase()}"\n`).endpoint, ENDPOINT);
    assert.equal(r2(ID, " 'parish-backups' ").bucket, 'parish-backups');
  });

  test('the Account ID is taken out of a pasted address', () => {
    assert.equal(r2(ENDPOINT).endpoint, ENDPOINT);
    assert.equal(r2(`${ID}.r2.cloudflarestorage.com`).endpoint, ENDPOINT);
    assert.equal(r2(`https://dash.cloudflare.com/${ID}/r2/overview`).endpoint, ENDPOINT);
    assert.match(r2(ENDPOINT).notes.join(), /S3 API address/);
  });

  test('the EU jurisdiction of a pasted address is kept', () => {
    assert.equal(r2(`https://${ID}.eu.r2.cloudflarestorage.com`).endpoint, `https://${ID}.eu.r2.cloudflarestorage.com`);
  });

  test('the bucket name is taken out of a pasted address or path', () => {
    assert.equal(r2(ID, `${ENDPOINT}/parish-backups`).bucket, 'parish-backups');
    assert.equal(r2(ID, 's3://parish-backups/database/').bucket, 'parish-backups');
    assert.equal(r2(`${ENDPOINT}/parish-backups`, '').bucket, 'parish-backups');
  });

  test('what is wrong is said without repeating the secret', () => {
    const cases = [
      [r2(''), /empty/],
      [r2('not-an-account-id'), /32-character.*17 characters.*aren't digits/],
      [r2(ID.slice(0, 31)), /31 characters/],
      [r2(KEY), /same as R2_ACCESS_KEY_ID/],
      [r2('https://pub-0123456789abcdef0123456789abcdef.r2.dev'), /public r2\.dev/],
      [r2('https://example.com/abc'), /not an address/],
      [r2(ID, 'Parish Backups!'), /bucket's name/],
      [r2(ID, ''), /R2_BACKUP_BUCKET is empty/],
    ];
    for (const [{ error }, expected] of cases) {
      assert.match(error ?? '', expected);
      assert.ok(!error.includes(ID) && !error.includes(KEY) && !error.includes('not-an-account-id'), error);
    }
  });
});
