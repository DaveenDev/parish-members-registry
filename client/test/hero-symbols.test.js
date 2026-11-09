import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_HERO_POSITION, DEFAULT_HERO_SYMBOL, HERO_POSITIONS, HERO_SYMBOLS, HERO_SYMBOL_OFF,
  heroPositionLabel, heroPositionOf, heroSymbolLabel, heroSymbolOf,
} from '../src/lib/heroSymbols.js';
import { describeActivity } from '../src/lib/activity.js';

test('eleven objects to choose from, the crucifix first and the default', () => {
  assert.equal(HERO_SYMBOLS.length, 11);
  assert.equal(HERO_SYMBOLS[0].key, 'crucifix');
  assert.equal(DEFAULT_HERO_SYMBOL, 'crucifix');
  assert.equal(new Set(HERO_SYMBOLS.map((s) => s.key)).size, 11);
});

test('nothing saved, or something unknown, shows the crucifix; off stays off', () => {
  assert.equal(heroSymbolOf(null), 'crucifix');
  assert.equal(heroSymbolOf(''), 'crucifix');
  assert.equal(heroSymbolOf('unicorn'), 'crucifix');
  assert.equal(heroSymbolOf(' Dove '), 'dove');
  assert.equal(heroSymbolOf('off'), HERO_SYMBOL_OFF);
  assert.equal(heroSymbolLabel('off'), 'Off');
  assert.equal(heroSymbolLabel('sacred-heart'), 'Sacred Heart');
  assert.equal(heroSymbolOf('our-lady'), 'our-lady');
  assert.equal(heroSymbolOf('saint-male'), 'saint-male');
  assert.equal(heroSymbolLabel('saint-male'), 'Male Saint');
  assert.equal(heroSymbolLabel('saint-female'), 'Female Saint');
});

test('every object has a builder in the scene, and fits the database check', () => {
  const scene = readFileSync(new URL('../src/components/site/heroGloryScene.js', import.meta.url), 'utf8');
  const builders = scene.slice(scene.indexOf('const BUILDERS = {'));
  for (const { key } of HERO_SYMBOLS) {
    assert.match(builders, new RegExp(`['\\s]${key}'?:`), key);
    assert.match(key, /^[a-z-]{1,30}$/);
  }
});

test('the activity log names the object', () => {
  const d = describeActivity({ action: 'update', table_name: 'parish_settings', changes: { hero_symbol: [null, 'rosary'] } });
  assert.deepEqual(d.lines, ['Home page 3D object: Crucifix → Rosary']);
});

test('position: left, center or right; nothing saved or unknown is left', () => {
  assert.deepEqual(HERO_POSITIONS.map((p) => p.key), ['left', 'center', 'right']);
  assert.equal(DEFAULT_HERO_POSITION, 'left');
  assert.equal(heroPositionOf(null), 'left');
  assert.equal(heroPositionOf('middle'), 'left');
  assert.equal(heroPositionOf(' Right '), 'right');
  assert.equal(heroPositionLabel('center'), 'Center');
});

test('every position fits the database check', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0118_hero_position.sql', import.meta.url), 'utf8');
  const check = sql.slice(sql.indexOf('hero_position in ('));
  for (const { key } of HERO_POSITIONS) assert.ok(check.startsWith('hero_position in (') && check.split(')')[0].includes(`'${key}'`), key);
});

test('the activity log names the position', () => {
  const d = describeActivity({ action: 'update', table_name: 'parish_settings', changes: { hero_position: [null, 'right'] } });
  assert.deepEqual(d.lines, ['Home page 3D position: Left → Right']);
});
