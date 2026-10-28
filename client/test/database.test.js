import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { LIVE_PROJECT_ID, projectIdFromUrl, isDemoDatabase } from '../src/lib/database.js';

describe('demo site: which database the site is on', () => {
  test('reads the project ID from a Supabase URL', () => {
    assert.equal(projectIdFromUrl('https://qyoyuukpdjrwfhovtrwd.supabase.co'), 'qyoyuukpdjrwfhovtrwd');
    assert.equal(projectIdFromUrl('https://qyoyuukpdjrwfhovtrwd.supabase.co/'), 'qyoyuukpdjrwfhovtrwd');
    assert.equal(projectIdFromUrl('http://127.0.0.1:54321'), '');
    assert.equal(projectIdFromUrl('not a url'), '');
    assert.equal(projectIdFromUrl(undefined), '');
  });

  test('the live project is not a demo database', () => {
    assert.equal(isDemoDatabase(`https://${LIVE_PROJECT_ID}.supabase.co`), false);
    assert.equal(isDemoDatabase(`https://${LIVE_PROJECT_ID.toUpperCase()}.supabase.co`), false);
  });

  test('the test project and a local Supabase are demo databases', () => {
    assert.equal(isDemoDatabase('https://qyoyuukpdjrwfhovtrwd.supabase.co'), true);
    assert.equal(isDemoDatabase('http://127.0.0.1:54321'), true);
  });

  test('no URL set shows no banner', () => {
    assert.equal(isDemoDatabase(''), false);
    assert.equal(isDemoDatabase(undefined), false);
  });
});
