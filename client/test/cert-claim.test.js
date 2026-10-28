import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { certClaimState, CLAIM_BADGES } from '../src/lib/requests.js';

describe('certificate request: is the sacrament verified?', () => {
  const member = (extra = {}) => ({ id: 1, has_baptism: true, has_confirmation: false, has_matrimony: true, verifications: [], ...extra });

  test('not linked to a member yet', () => {
    assert.equal(certClaimState({ cert_type: 'baptism', member: null }), null);
    assert.equal(certClaimState(null), null);
  });

  test('claimed but not checked against the register', () => {
    assert.equal(certClaimState({ cert_type: 'baptism', member: member() }), 'unverified');
    // A verification of another sacrament doesn't count.
    assert.equal(certClaimState({ cert_type: 'baptism', member: member({ verifications: [{ sacrament: 'matrimony' }] }) }), 'unverified');
  });

  test('verified', () => {
    assert.equal(certClaimState({ cert_type: 'baptism', member: member({ verifications: [{ sacrament: 'baptism' }] }) }), 'verified');
    assert.equal(certClaimState({ cert_type: 'matrimony', member: member({ verifications: [{ sacrament: 'matrimony' }] }) }), 'verified');
  });

  test('no such sacrament on the member record', () => {
    assert.equal(certClaimState({ cert_type: 'confirmation', member: member() }), 'none');
  });

  test('every state has a badge', () => {
    assert.equal(CLAIM_BADGES.verified.label, 'Verified claim');
    assert.equal(CLAIM_BADGES.unverified.label, 'Not yet verified claim');
    assert.ok(CLAIM_BADGES.none.label);
  });
});
