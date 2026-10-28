import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  PRAYER_MAX_DAYS, PRAYER_TYPES, PRAYER_TYPE_LABELS, isShownNow, needsAttention, prayerFrom, prayerPath, prayerTitle,
  prayerTypeLabel, prayerVisitorId, showUntilBounds, validShowUntil, validVisitorId, websiteState,
} from '../src/lib/prayers.js';
import { MEMBER_REQUEST_KINDS } from '../src/lib/notifications.js';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
const sql = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const WALL = sql('0100_prayer_wall.sql');

const shown = { allow_public: true, show_publicly: true, status: 'New', show_until: '2026-10-20', reviewed_at: '2026-10-01T00:00:00Z' };

describe('what shows on the prayer wall (prayer_request_is_public)', () => {
  test('asked for, approved, not archived, and its last day not passed', () => {
    assert.equal(isShownNow(shown, '2026-10-13'), true);
    assert.equal(isShownNow(shown, '2026-10-20'), true, 'still on its last day');
    assert.equal(isShownNow({ ...shown, status: 'Prayed for' }, '2026-10-13'), true, 'prayed for at Mass still shows');
  });

  test('anything else stays off', () => {
    assert.equal(isShownNow(shown, '2026-10-21'), false, 'after its last day');
    assert.equal(isShownNow({ ...shown, allow_public: false }, '2026-10-13'), false);
    assert.equal(isShownNow({ ...shown, show_publicly: false }, '2026-10-13'), false);
    assert.equal(isShownNow({ ...shown, status: 'Archived' }, '2026-10-13'), false);
    assert.equal(isShownNow({ ...shown, show_until: null }, '2026-10-13'), false, 'no date: the old requests from before 0035');
    assert.equal(isShownNow(null), false);
  });

  test('the SQL has the same rule', () => {
    assert.match(WALL, /r\.allow_public and r\.show_publicly and r\.status <> 'Archived'\s+and r\.show_until is not null and r\.show_until >= parish_today\(\)/);
  });
});

describe('what waits for staff (request_inbox_counts)', () => {
  test('a request for the website nobody has decided on', () => {
    const waiting = { allow_public: true, show_publicly: false, reviewed_at: null, status: 'New' };
    assert.equal(needsAttention(waiting), true);
    assert.equal(needsAttention({ ...waiting, status: 'Prayed for' }), true, 'praying for it at Mass is not deciding about the website');
    assert.equal(needsAttention({ ...waiting, reviewed_at: '2026-10-02T00:00:00Z' }), false, 'decided: not shown');
    assert.equal(needsAttention({ ...waiting, show_publicly: true }), false, 'decided: shown');
    assert.equal(needsAttention({ ...waiting, status: 'Archived' }), false);
  });

  test('a private one until it has been prayed for', () => {
    const priv = { allow_public: false, show_publicly: false, reviewed_at: null, status: 'New' };
    assert.equal(needsAttention(priv), true);
    assert.equal(needsAttention({ ...priv, status: 'Prayed for' }), false);
    assert.equal(needsAttention({ ...priv, status: 'Archived' }), false);
  });

  test('the badge, the morning summary and the client count the same', () => {
    const rule = /\(allow_public and not show_publicly and reviewed_at is null and status <> 'Archived'\)\s+or \(not allow_public and status = 'New'\)/g;
    assert.equal(WALL.match(rule)?.length, 2, 'request_inbox_counts() and send_morning_digest()');
  });
});

describe('where a request stands with the website (the admin badge)', () => {
  const today = '2026-10-13';
  test('each state', () => {
    assert.equal(websiteState({ allow_public: false, status: 'New' }, today), 'private');
    assert.equal(websiteState(shown, today), 'shown');
    assert.equal(websiteState({ ...shown, show_until: '2026-10-01' }, today), 'ended');
    assert.equal(websiteState({ ...shown, show_publicly: false, reviewed_at: null }, today), 'review');
    assert.equal(websiteState({ ...shown, show_publicly: false }, today), 'hidden');
    assert.equal(websiteState({ ...shown, status: 'Archived' }, today), 'hidden');
  });
});

describe('"show until"', () => {
  test(`from today up to ${PRAYER_MAX_DAYS} days ahead`, () => {
    assert.deepEqual(showUntilBounds('2026-10-13'), { min: '2026-10-13', max: '2027-01-11' });
    assert.equal(validShowUntil('2026-10-13', '2026-10-13'), true);
    assert.equal(validShowUntil('2027-01-11', '2026-10-13'), true);
    assert.equal(validShowUntil('2027-01-12', '2026-10-13'), false);
    assert.equal(validShowUntil('2026-10-12', '2026-10-13'), false);
    assert.equal(validShowUntil('', '2026-10-13'), false);
    assert.equal(validShowUntil('13/10/2026', '2026-10-13'), false);
  });

  test('submit_prayer_request() allows the same days', () => {
    assert.equal(PRAYER_MAX_DAYS, 90);
    assert.match(WALL, /until < parish_today\(\) or until > parish_today\(\) \+ 90/);
  });
});

describe('the kinds', () => {
  test('match the table\'s check constraint (0012), each with a Cebuano label', () => {
    const check = sql('0012_requests.sql').match(/intention_type in \(([^)]*)\)/)[1];
    assert.deepEqual(check.split(',').map((s) => s.trim().replace(/'/g, '')), PRAYER_TYPES);
    for (const t of PRAYER_TYPES) assert.ok(PRAYER_TYPE_LABELS[t], t);
    assert.equal(prayerTypeLabel('Something else'), PRAYER_TYPE_LABELS['Special intention']);
  });
});

describe('on the website', () => {
  test('the heading: who it is for, else its kind', () => {
    assert.equal(prayerTitle({ for_name: ' Lola Rosa ', type: 'For the sick' }), 'Para kang Lola Rosa');
    assert.equal(prayerTitle({ for_name: '', type: 'Thanksgiving' }), 'Pagpasalamat');
    assert.equal(prayerTitle({ intention_type: 'For the departed' }), 'Para sa namatay');
  });

  test('the name only when they chose to show it', () => {
    assert.equal(prayerFrom({ name: 'Maria' }), 'Maria');
    assert.equal(prayerFrom({ name: null }), 'Usa ka parokyano');
  });

  test('its address', () => {
    assert.equal(prayerPath(12), '/komunidad/pag-ampo/12');
  });

  test('the public functions never send a contact detail', () => {
    const json = WALL.match(/function public\.prayer_request_public_json[\s\S]*?\$\$;/)[0];
    for (const col of ['requester_mobile', 'staff_notes', 'ref_no', 'handled_by', 'reviewed_by_name']) assert.ok(!json.includes(col), col);
    assert.match(json, /'name', case when r\.show_name then r\.requester_name end/);
  });
});

describe('"Nag-ampo ko": this browser\'s id', () => {
  test('the shape prayer_visitor_key() accepts', () => {
    assert.match(WALL, /p_visitor ~ '\^\[A-Za-z0-9-\]\{16,64\}\$'/);
    assert.equal(validVisitorId('0f8c2a9e-1b3d-4c5e-9f00-112233445566'), true);
    assert.equal(validVisitorId('short'), false);
    assert.equal(validVisitorId('has spaces in it, sixteen+'), false);
    assert.equal(validVisitorId('a'.repeat(65)), false);
  });

  test('kept in localStorage, and the same on the next call', () => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
    try {
      const id = prayerVisitorId();
      assert.equal(validVisitorId(id), true);
      assert.equal(prayerVisitorId(), id);
      assert.equal([...store.values()][0], id);
    } finally {
      delete globalThis.localStorage;
    }
  });

  test('without storage (a private window), one id for the visit', () => {
    globalThis.localStorage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    try {
      const id = prayerVisitorId();
      assert.equal(validVisitorId(id), true);
      assert.equal(prayerVisitorId(), id);
    } finally {
      delete globalThis.localStorage;
    }
  });
});

test('phones: MEMBER_REQUEST_KINDS is the latest notification_push_targets() list', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const latest = files.filter((f) => /function public\.notification_push_targets/.test(sql(f))).at(-1);
  const list = sql(latest).match(/when 'requests' then n\.kind in \(([^)]*)\)/)[1];
  assert.deepEqual(list.split(',').map((s) => s.trim().replace(/'/g, '')), MEMBER_REQUEST_KINDS, latest);
});
