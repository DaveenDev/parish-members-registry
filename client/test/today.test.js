import test from 'node:test';
import assert from 'node:assert/strict';

import { todayItems } from '../src/lib/today.js';

const counts = { pending_households: 4, requests: { certificates: 2, ready: 1, blood: 1, sacraments: 2 }, census_updates: 3, sacraments_waiting: 5 };
const keys = (items) => items.map((i) => i.key);

test('full access sees requests, census, sacraments and the week ahead', () => {
  const items = todayItems({
    user: { access: 'full' }, counts, today: '2026-10-01',
    census: { label: '2026 Census', counts: { 'Not started': 6, 'Partly confirmed': 2, Confirmed: 2 } },
    events: [{ title: 'Fiesta', start_date: '2026-10-04', published: true }, { title: 'Later', start_date: '2026-11-01', published: true }],
    bulletins: [{ week_of: '2026-09-20', published: true }],
  });
  assert.deepEqual(keys(items), ['households', 'ready', 'certs', 'blood', 'sacrament-requests', 'census-updates', 'census', 'sacraments', 'events', 'bulletin']);
  assert.equal(items[0].n, 4);
  assert.equal(items[0].to, '/admin/households?status=Pending');
  assert.equal(items.find((i) => i.key === 'census').label, '2026 Census: 2 of 10 households confirmed');
  assert.equal(items.find((i) => i.key === 'events').detail, 'Fiesta');
  assert.equal(items.find((i) => i.key === 'sacrament-requests').to, '/admin/requests?tab=sacraments');
  // The census updates open on Census → Online updates, not the households list.
  assert.equal(items.find((i) => i.key === 'census-updates').to, '/admin/census?tab=updates');
});

test('nothing waiting means nothing listed, and this week’s bulletin counts as done', () => {
  const items = todayItems({
    user: { access: 'full' }, today: '2026-10-01',
    counts: { pending_households: 0, requests: { certificates: 0, ready: 0, blood: 0 } },
    bulletins: [{ week_of: '2026-09-27', published: true }],
  });
  assert.deepEqual(items, []);
});

test('a GKK leader only sees what their account can open', () => {
  // The counts are already limited to their GKK by the database (0024).
  assert.deepEqual(keys(todayItems({ user: { access: 'gkk_leader' }, counts, today: '2026-10-01' })), ['households', 'census-updates', 'sacraments']);
});
