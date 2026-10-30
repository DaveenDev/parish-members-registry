import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError, shouldReload } from '../src/lib/chunkReload.js';

test('isChunkLoadError: the browsers\' messages for a failed page download', () => {
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Simbahan-abc.js')), true);
  assert.equal(isChunkLoadError(new TypeError('Importing a module script failed.')), true);
  assert.equal(isChunkLoadError(new Error('error loading dynamically imported module')), true);
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
  assert.equal(isChunkLoadError(null), false);
});

test('shouldReload: once a minute at most, so an offline phone does not loop', () => {
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(shouldReload(storage, 1_000_000), true);
  assert.equal(shouldReload(storage, 1_030_000), false);
  assert.equal(shouldReload(storage, 1_061_000), true);
});

test('shouldReload: no storage, no reload', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() {} };
  assert.equal(shouldReload(broken), false);
});
