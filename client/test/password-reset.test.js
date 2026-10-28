import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { isRecoverySession, resetErrorMessage, resetRedirectUrl, RESET_PATH } from '../src/lib/passwordReset.js';

/** A fake Supabase access token with these claims (only the payload matters here). */
const token = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
const NOW = Date.UTC(2026, 9, 3, 1, 0, 0);
const at = (minutesAgo) => Math.floor((NOW - minutesAgo * 60000) / 1000);

describe('isRecoverySession', () => {
  test('true for a session from a reset link, within the hour', () => {
    assert.equal(isRecoverySession({ access_token: token({ amr: [{ method: 'recovery', timestamp: at(5) }] }) }, NOW), true);
  });
  test('false for a password sign-in, an old link, or no session', () => {
    assert.equal(isRecoverySession({ access_token: token({ amr: [{ method: 'password', timestamp: at(5) }] }) }, NOW), false);
    assert.equal(isRecoverySession({ access_token: token({ amr: [{ method: 'recovery', timestamp: at(90) }] }) }, NOW), false);
    assert.equal(isRecoverySession(null, NOW), false);
    assert.equal(isRecoverySession({ access_token: 'not-a-jwt' }, NOW), false);
  });
});

describe('reset links and messages', () => {
  test('the link lands on the reset page of this site', () => {
    assert.equal(resetRedirectUrl('https://guadalupe-muaan.vercel.app/'), `https://guadalupe-muaan.vercel.app${RESET_PATH}`);
  });
  test('turns Supabase errors into plain words', () => {
    assert.equal(resetErrorMessage({ message: 'For security purposes, you can only request this after 42 seconds.' }), 'Please wait 42 seconds before asking for another link.');
    assert.match(resetErrorMessage({ status: 429, message: 'email rate limit exceeded' }), /try again in an hour/);
    assert.match(resetErrorMessage({ message: 'Error sending recovery email' }), /couldn't be sent/);
  });
});
