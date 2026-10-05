import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { can, accessLabel, ACCESS_LEVELS } from '../src/lib/access.js';

describe('can', () => {
  test('full access (and accounts from before 0014) can do everything', () => {
    for (const what of ['registry', 'editRegistry', 'deleteRecords', 'trash', 'editWebsite']) {
      assert.ok(can({ access: 'full' }, what), what);
      assert.ok(can({}, what), what);
    }
  });

  test('read only sees but never changes', () => {
    const u = { access: 'read_only' };
    assert.ok(can(u, 'registry') && can(u, 'requests') && can(u, 'activity'));
    assert.ok(!can(u, 'editRegistry') && !can(u, 'editRequests') && !can(u, 'trash'));
  });

  test('a GKK leader edits the registry only; website staff edit website and requests', () => {
    assert.ok(can({ access: 'gkk_leader' }, 'editRegistry'));
    assert.ok(!can({ access: 'gkk_leader' }, 'requests'));
    assert.ok(!can({ access: 'gkk_leader' }, 'deleteRecords'));
    assert.ok(can({ access: 'website' }, 'editWebsite') && can({ access: 'website' }, 'editRequests'));
    assert.ok(!can({ access: 'website' }, 'editRegistry'));
  });

  test('GKK leaders get and renew census codes; read-only and website staff do not', () => {
    assert.ok(can({ access: 'gkk_leader' }, 'censusCodes'));
    assert.ok(can({ access: 'full' }, 'censusCodes'));
    assert.ok(!can({ access: 'read_only' }, 'censusCodes'));
    assert.ok(!can({ access: 'website' }, 'censusCodes'));
  });

  test('GKK leaders open the Census page and record their GKK; only full access runs the census', () => {
    assert.ok(can({ access: 'gkk_leader' }, 'census'));
    assert.ok(can({ access: 'gkk_leader' }, 'editCensus'));
    assert.ok(!can({ access: 'gkk_leader' }, 'manageCensus'), 'starting or closing a census stays with full access');
    assert.ok(can({ access: 'full' }, 'manageCensus'));
    assert.ok(can({ access: 'read_only' }, 'census'));
    assert.ok(!can({ access: 'read_only' }, 'editCensus'));
    assert.ok(!can({ access: 'website' }, 'census'));
  });

  test('unknown permissions are refused', () => {
    assert.ok(!can({ access: 'full' }, 'launchRockets'));
  });
});

test('every access level has a label', () => {
  for (const a of ACCESS_LEVELS) assert.equal(accessLabel(a.key), a.label);
  assert.equal(accessLabel(undefined), 'Full access');
});

describe('admin nav', async () => {
  const { navItemFor, navAllowed, navBadges } = await import('../src/components/adminNav.js');

  test('finds the page a path belongs to', () => {
    assert.equal(navItemFor('/admin').label, 'Dashboard');
    assert.equal(navItemFor('/admin/settings').label, 'Parish Config');
    assert.equal(navItemFor('/admin/settings/staff').label, 'Staff');
    assert.equal(navItemFor('/admin/requests').label, 'Requests');
    assert.equal(navItemFor('/admin/nowhere'), null);
  });

  test('hides pages an access level cannot use', () => {
    const requests = navItemFor('/admin/requests');
    assert.ok(navAllowed(requests, { access: 'website' }));
    assert.ok(!navAllowed(requests, { access: 'gkk_leader' }));
    assert.ok(!navAllowed(navItemFor('/admin/settings/staff'), { access: 'full', isAdmin: false }));
    assert.ok(navAllowed(navItemFor('/admin/settings'), { access: 'read_only' }));
  });

  test('My GKK is for GKK leaders only', () => {
    const mine = navItemFor('/admin/my-gkk');
    assert.equal(mine.label, 'My GKK');
    assert.ok(navAllowed(mine, { access: 'gkk_leader' }));
    assert.ok(!navAllowed(mine, { access: 'full', isAdmin: true }));
    assert.ok(!navAllowed(mine, { access: 'website' }));
  });

  test('adds up the request queues for one badge', () => {
    assert.deepEqual(navBadges({ pending_households: 2, requests: { certificates: 1, ready: 2, blood: 0, sacraments: 3 } }),
      { pending: 2, duplicates: 0, sacraments: 0, census: 0, requests: 6 });
  });
});
