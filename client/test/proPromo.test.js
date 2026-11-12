import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ALL_TIPS_KEY, DAY_MS, SHOWCASE_KEY, TIPS, accountAgeDays, askMailto, audienceFor, hiddenUntil, isHidden,
  pageKey, pickShowcase, pickTip, seesPro, tipKey,
} from '../src/lib/proPromo.js';

const NOW = Date.parse('2026-12-01T09:00:00Z');
const base = { access: 'full', isDemo: false, accountAgeDays: 400, owned: [], dismissals: {}, now: NOW, shownPages: [], shownToday: 0, lastShown: {}, shownThisSession: false };
const tip = (o) => pickTip({ pathname: '/admin/requests', tab: 'certificates', ...base, ...o });
const showcase = (o) => pickShowcase({ pathname: '/admin', ...base, ...o });

test('PROMO-01 read only and GKK leader accounts get no card and no showcase', () => {
  for (const access of ['read_only', 'gkk_leader', 'none']) {
    assert.equal(tip({ access }), null, access);
    assert.equal(showcase({ access }), null, access);
    assert.equal(seesPro(access), false, access);
  }
});

test('PROMO-02 Website & requests gets cards only on the Requests pages, never the showcase', () => {
  assert.equal(tip({ access: 'website' })?.id, 'registers-certificates');
  assert.equal(tip({ access: 'website', tab: 'blood' })?.id, 'sms-blood');
  assert.equal(tip({ access: 'website', pathname: '/admin/website', tab: 'mass' }), null);
  assert.equal(tip({ access: 'website', pathname: '/admin' }), null, 'not on the Dashboard');
  assert.equal(showcase({ access: 'website' }), null);
});

test('PROMO-03 an account 20 days old gets nothing; 21 days, it does', () => {
  assert.equal(tip({ accountAgeDays: 20 }), null);
  assert.equal(showcase({ accountAgeDays: 20 }), null);
  assert.ok(tip({ accountAgeDays: 21 }));
  assert.ok(showcase({ accountAgeDays: 21 }));
  assert.equal(tip({ accountAgeDays: null }), null, 'an unknown age is treated as new');
  assert.equal(accountAgeDays('2026-11-11T09:00:00Z', NOW), 20);
  assert.equal(accountAgeDays('2026-11-10T09:00:00Z', NOW), 21);
  assert.equal(accountAgeDays(undefined, NOW), null);
});

test('PROMO-04 showcase hidden on day 0 is not shown on day 29, and is on day 30', () => {
  const dismissals = { [SHOWCASE_KEY]: hiddenUntil(NOW, 30) };
  assert.equal(showcase({ dismissals, now: NOW }), null);
  assert.equal(showcase({ dismissals, now: NOW + 29 * DAY_MS }), null);
  assert.equal(showcase({ dismissals, now: NOW + 30 * DAY_MS })?.length, 3);
});

test('PROMO-05 a card hidden for 30 days does not stop the other cards', () => {
  const dismissals = { [tipKey('registers-certificates')]: hiddenUntil(NOW, 30) };
  assert.equal(tip({ dismissals }), null);
  assert.equal(tip({ dismissals, tab: 'blood' })?.id, 'sms-blood');
  assert.equal(tip({ dismissals, pathname: '/admin/sacraments', tab: undefined })?.id, 'registers-sacraments');
  assert.equal(tip({ dismissals, now: NOW + 30 * DAY_MS })?.id, 'registers-certificates');
});

test('PROMO-06 "Don\'t show PRO tips" hides every card for 90 days, not the showcase', () => {
  const dismissals = { [ALL_TIPS_KEY]: hiddenUntil(NOW, 90) };
  for (const t of TIPS) assert.equal(tip({ dismissals, pathname: t.path, tab: t.tab }), null, t.id);
  assert.equal(tip({ dismissals, pathname: '/admin' }), null);
  assert.equal(tip({ dismissals, now: NOW + 89 * DAY_MS }), null);
  assert.ok(tip({ dismissals, now: NOW + 90 * DAY_MS }));
  assert.equal(showcase({ dismissals })?.length, 3);
});

test('PROMO-07 a PRO parish with Registers and Intentions: no showcase, no cards for them, SMS still shows', () => {
  const owned = ['registers', 'intentions'];
  assert.equal(showcase({ owned }), null);
  assert.equal(tip({ owned }), null, 'certificates card is for Registers');
  assert.equal(tip({ owned, pathname: '/admin/sacraments', tab: undefined }), null);
  assert.equal(tip({ owned, pathname: '/admin/website', tab: 'mass' }), null);
  assert.equal(tip({ owned, tab: 'blood' })?.id, 'sms-blood');
  // The Dashboard offers only what is missing.
  assert.ok(!['registers', 'intentions'].includes(tip({ owned, pathname: '/admin', tab: undefined }).module));
});

test('PROMO-08 three cards in a day, then none until the next day', () => {
  assert.ok(tip({ shownToday: 2 }));
  assert.equal(tip({ shownToday: 3 }), null);
});

test('one card per page per session, and the page\'s default tab counts as its first tab', () => {
  assert.equal(tip({ shownPages: [pageKey('/admin/requests', 'certificates')] }), null);
  assert.equal(tip({ tab: undefined })?.id, 'registers-certificates', 'Requests opens on Certificates');
  assert.equal(tip({ pathname: '/admin/website', tab: undefined })?.id, 'sms-announcements', 'Website opens on Announcements');
  assert.equal(tip({ pathname: '/admin/website', tab: 'bulletin' }), null, 'no card on other tabs');
  assert.equal(tip({ pathname: '/admin/reports/', tab: undefined })?.id, 'cashbook-reports');
  assert.equal(tip({ pathname: '/admin/households', tab: undefined }), null, 'no card where people enter data');
  assert.equal(tip({ pathname: '/admin/census', tab: undefined }), null);
});

test('the Dashboard shows the card shown least recently', () => {
  const lastShown = Object.fromEntries(TIPS.map((t, i) => [t.id, NOW - (i + 1) * 1000]));
  assert.equal(tip({ pathname: '/admin', tab: undefined, lastShown })?.id, TIPS[TIPS.length - 1].id);
  const never = { ...lastShown }; delete never['sms-blood'];
  assert.equal(tip({ pathname: '/admin', tab: undefined, lastShown: never })?.id, 'sms-blood');
});

test('the showcase: the Dashboard only, the first three modules, once a session, Clergy included', () => {
  assert.deepEqual(showcase().map((m) => m.id), ['registers', 'intentions', 'sms']);
  assert.equal(showcase({ pathname: '/admin/households' }), null);
  assert.equal(showcase({ shownThisSession: true }), null);
  assert.equal(showcase({ access: 'clergy' })?.length, 3);
  assert.deepEqual(audienceFor('clergy'), { tips: 'all', showcase: true });
});

test('the shared Demo login skips the new-account wait and the modules it lacks are offered', () => {
  assert.ok(tip({ isDemo: true, accountAgeDays: 0 }));
  assert.ok(showcase({ isDemo: true, accountAgeDays: 0 }));
});

test('isHidden: hidden until the end time, not at it', () => {
  assert.equal(isHidden({ a: NOW + 1 }, 'a', NOW), true);
  assert.equal(isHidden({ a: NOW }, 'a', NOW), false);
  assert.equal(isHidden({}, 'a', NOW), false);
  assert.equal(isHidden(undefined, 'a', NOW), false);
});

test('Ask about PRO: the parish and the ticked modules are in the email', () => {
  const url = askMailto('Our Lady of Guadalupe', ['sms', 'registers']);
  const body = decodeURIComponent(url.split('body=')[1]);
  assert.match(url, /^mailto:[^?]+\?subject=/);
  assert.match(body, /Parish: Our Lady of Guadalupe/);
  assert.match(body, /- Registers & certificates\n- Texts \(SMS\)/);
  assert.match(decodeURIComponent(askMailto('', []).split('body=')[1]), /none picked yet/);
});

test('0124 keeps each account\'s dismissals to itself', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0124_staff_dismissals.sql', import.meta.url), 'utf8');
  assert.match(sql, /primary key \(user_id, key\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /revoke all on staff_dismissals from anon/);
});
