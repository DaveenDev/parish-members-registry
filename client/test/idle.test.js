import test from 'node:test';
import assert from 'node:assert/strict';

import { idleState } from '../src/lib/idle.js';

test('active, then a one-minute warning, then signed out', () => {
  const opts = { limitMs: 20 * 60000, warnMs: 60000 };
  assert.equal(idleState(0, 5 * 60000, opts).state, 'active');
  assert.deepEqual(idleState(0, 19 * 60000 + 30000, opts), { state: 'warning', secondsLeft: 30 });
  assert.equal(idleState(0, 20 * 60000, opts).state, 'expired');
});
