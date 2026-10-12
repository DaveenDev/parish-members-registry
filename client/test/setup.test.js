import test from 'node:test';
import assert from 'node:assert/strict';

import { SETUP_STEPS, localDay, markStep, popupDue, setupSaved, setupSteps, stepsLeft } from '../src/lib/setup.js';

const secretary = { access: 'full' };
const blank = { name: 'Our Lady of Guadalupe', address: '', contact: '', email: '', logo: null, hero_image: null, office_hours: null, mobile: '', map_url: '', latitude: null, longitude: null, secretary_messenger: null };
const none = { gkks: 0, mass: 0, sacraments: 0 };
const keys = (steps, doneBy) => steps.filter((s) => s.doneBy === doneBy).map((s) => s.key);

test('a new parish: every step is still to do', () => {
  const steps = setupSteps({ user: secretary, settings: blank, counts: none, saved: setupSaved(null) });
  assert.equal(steps.length, SETUP_STEPS.length);
  assert.equal(stepsLeft(steps), SETUP_STEPS.length);
});

test('a step ticks itself off once the parish has the setting', () => {
  const settings = {
    ...blank, logo: 'data:image/png;base64,x', address: 'Mua-an', mobile: '0917', email: 'o@x.ph',
    office_hours: [], latitude: 7.1, longitude: 125.6, secretary_messenger: 'olgqp.office',
  };
  const steps = setupSteps({ user: secretary, settings, counts: { gkks: 12, mass: 0, sacraments: 3 }, saved: setupSaved(null) });
  assert.deepEqual(keys(steps, 'parish'), ['logo', 'gkks', 'contact', 'hours', 'map', 'messenger', 'sacraments']);
  assert.deepEqual(keys(steps, ''), ['photo', 'mass']);
});

test('contact needs the address, a phone and the email', () => {
  const contact = (s) => setupSteps({ user: secretary, settings: { ...blank, ...s }, counts: none, saved: {} }).find((x) => x.key === 'contact').doneBy;
  assert.equal(contact({ address: 'Mua-an', email: 'o@x.ph' }), '');
  assert.equal(contact({ address: 'Mua-an', email: 'o@x.ph', contact: '(082) 123' }), 'parish');
});

test('counts that could not be read never tick a step', () => {
  const steps = setupSteps({ user: secretary, settings: blank, counts: null, saved: {} });
  assert.deepEqual(keys(steps, 'parish'), []);
});

test('a step the person marked done counts as done; unmarking brings it back', () => {
  let saved = markStep(setupSaved(null), 'photo', true);
  saved = markStep(saved, 'map', true);
  let steps = setupSteps({ user: secretary, settings: blank, counts: none, saved });
  assert.deepEqual(keys(steps, 'you'), ['photo', 'map']);
  assert.equal(stepsLeft(steps), SETUP_STEPS.length - 2);
  saved = markStep(saved, 'photo', false);
  steps = setupSteps({ user: secretary, settings: blank, counts: none, saved });
  assert.deepEqual(keys(steps, 'you'), ['map']);
});

test('each account sees only the steps it can do', () => {
  const website = setupSteps({ user: { access: 'website' }, settings: blank, counts: none, saved: {} }).map((s) => s.key);
  assert.deepEqual(website, ['contact', 'hours', 'map', 'messenger', 'mass', 'sacraments']);
  assert.deepEqual(setupSteps({ user: { access: 'gkk_leader' }, settings: blank, counts: none, saved: {} }), []);
  assert.deepEqual(setupSteps({ user: { access: 'clergy' }, settings: blank, counts: none, saved: {} }), []);
});

test('the saved checklist is read safely', () => {
  assert.deepEqual(setupSaved(null), { done: [], hide: false });
  assert.deepEqual(setupSaved({ done: ['logo', 3, null], hide: 1 }), { done: ['logo'], hide: true });
  assert.deepEqual(setupSaved({ done: 'logo' }), { done: [], hide: false });
});

test('the pop-up: once a day while something is left, until "Don\'t show again"', () => {
  const steps = setupSteps({ user: secretary, settings: blank, counts: none, saved: {} });
  const today = '2026-10-12';
  assert.equal(popupDue({ steps, saved: { hide: false }, lastShown: '', today }), true);
  assert.equal(popupDue({ steps, saved: { hide: false }, lastShown: '2026-10-11', today }), true);
  assert.equal(popupDue({ steps, saved: { hide: false }, lastShown: today, today }), false);
  assert.equal(popupDue({ steps, saved: { hide: true }, lastShown: '', today }), false);
  const allMarked = SETUP_STEPS.reduce((s, { key }) => markStep(s, key, true), setupSaved(null));
  const done = setupSteps({ user: secretary, settings: blank, counts: none, saved: allMarked });
  assert.equal(stepsLeft(done), 0);
  assert.equal(popupDue({ steps: done, saved: allMarked, lastShown: '', today }), false);
});

test('localDay is the date on this device\'s clock', () => {
  assert.equal(localDay(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});
