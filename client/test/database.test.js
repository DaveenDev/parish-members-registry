import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { LIVE_PROJECT_ID, projectIdFromUrl, isTrainingDatabase } from '../src/lib/database.js';

describe('training site: which database the site is on', () => {
  test('reads the project ID from a Supabase URL', () => {
    assert.equal(projectIdFromUrl('https://qyoyuukpdjrwfhovtrwd.supabase.co'), 'qyoyuukpdjrwfhovtrwd');
    assert.equal(projectIdFromUrl('https://qyoyuukpdjrwfhovtrwd.supabase.co/'), 'qyoyuukpdjrwfhovtrwd');
    assert.equal(projectIdFromUrl('http://127.0.0.1:54321'), '');
    assert.equal(projectIdFromUrl('not a url'), '');
    assert.equal(projectIdFromUrl(undefined), '');
  });

  test('the live project is not a training database', () => {
    assert.equal(isTrainingDatabase(`https://${LIVE_PROJECT_ID}.supabase.co`), false);
    assert.equal(isTrainingDatabase(`https://${LIVE_PROJECT_ID.toUpperCase()}.supabase.co`), false);
  });

  test('the test project and a local Supabase are training databases', () => {
    assert.equal(isTrainingDatabase('https://qyoyuukpdjrwfhovtrwd.supabase.co'), true);
    assert.equal(isTrainingDatabase('http://127.0.0.1:54321'), true);
  });

  test('no URL set shows no banner', () => {
    assert.equal(isTrainingDatabase(''), false);
    assert.equal(isTrainingDatabase(undefined), false);
  });
});
