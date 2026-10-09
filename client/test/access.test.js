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

  test('only full access downloads the whole registry', () => {
    assert.ok(can({ access: 'full' }, 'exports'));
    for (const access of ['read_only', 'gkk_leader', 'website']) assert.ok(!can({ access }, 'exports'), access);
  });

  test('a GKK leader edits the registry only; website staff edit website and requests', () => {
    assert.ok(can({ access: 'gkk_leader' }, 'editRegistry'));
    assert.ok(!can({ access: 'gkk_leader' }, 'requests'));
    assert.ok(!can({ access: 'gkk_leader' }, 'deleteRecords'));
    assert.ok(can({ access: 'website' }, 'editWebsite') && can({ access: 'website' }, 'editRequests'));
    assert.ok(!can({ access: 'website' }, 'editRegistry'));
  });

  test('GKK leaders never see blood types; everyone else who sees the registry does', () => {
    assert.ok(!can({ access: 'gkk_leader' }, 'bloodTypes'));
    for (const access of ['full', 'read_only', 'website']) assert.ok(can({ access }, 'bloodTypes'), access);
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
    assert.ok(can({ access: 'full' }, 'censusGkkView'), "full access opens a GKK's results as its leader sees them");
    assert.ok(!can({ access: 'read_only' }, 'censusGkkView'));
    assert.ok(!can({ access: 'gkk_leader' }, 'censusGkkView'));
    assert.ok(can({ access: 'read_only' }, 'census'));
    assert.ok(!can({ access: 'read_only' }, 'editCensus'));
    assert.ok(!can({ access: 'website' }, 'census'));
  });

  test('clergy see the registry and census, verify sacraments and handle requests, and change nothing else (0087)', () => {
    const u = { access: 'clergy' };
    for (const what of ['registry', 'census', 'reports', 'requests', 'verify', 'editRequests']) assert.ok(can(u, what), what);
    for (const what of ['editRegistry', 'editCensus', 'manageCensus', 'censusCodes', 'censusGkkView', 'deleteRecords',
      'exports', 'bloodTypes', 'activity', 'trash', 'website', 'editWebsite', 'manageLists', 'settings']) {
      assert.ok(!can(u, what), what);
    }
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

  test('a login without an access level has only its own account settings (0065)', async () => {
    const { NAV_GROUPS, navLabel } = await import('../src/components/adminNav.js');
    const none = { access: 'none' };
    const shown = NAV_GROUPS.flatMap((g) => g.items).filter((i) => navAllowed(i, none));
    assert.deepEqual(shown.map((i) => navLabel(i, none)), ['My Account']);
  });

  test('GKK leaders see Parish Config as GKK Config', async () => {
    const { navLabel } = await import('../src/components/adminNav.js');
    const config = navItemFor('/admin/settings');
    assert.equal(navLabel(config, { access: 'gkk_leader' }), 'GKK Config');
    assert.equal(navLabel(config, { access: 'full' }), 'Parish Config');
    assert.equal(navLabel(navItemFor('/admin/census'), { access: 'gkk_leader' }), 'Census');
  });

  test('accounts with only their own settings see Parish Config as My Account', async () => {
    const { navLabel } = await import('../src/components/adminNav.js');
    const config = navItemFor('/admin/settings');
    assert.equal(navLabel(config, { access: 'read_only' }), 'My Account');
    assert.equal(navLabel(config, { access: 'website' }), 'My Account');
    assert.equal(navLabel(config, { access: 'clergy' }), 'My Account');
    // A staff admin also has Platform Integrations there.
    assert.equal(navLabel(config, { access: 'read_only', isAdmin: true }), 'Parish Config');
    assert.equal(navLabel(navItemFor('/admin/households'), { access: 'read_only' }), 'Households');
  });

  test('GKK leaders: no Parish life pages, an always-open Settings starting with GKK Config', async () => {
    const { NAV_GROUPS, navCollapsible, navLabel } = await import('../src/components/adminNav.js');
    const leader = { access: 'gkk_leader' };
    const parishLife = NAV_GROUPS.find((g) => g.label === 'Parish life');
    assert.deepEqual(parishLife.items.filter((i) => navAllowed(i, leader)), []);
    assert.ok(navAllowed(navItemFor('/admin/ministries'), { access: 'read_only' }));
    const settings = NAV_GROUPS.find((g) => g.label === 'Settings');
    assert.equal(navLabel(settings.items.filter((i) => navAllowed(i, leader))[0], leader), 'GKK Config');
    assert.ok(!navCollapsible(settings, leader));
    assert.ok(navCollapsible(settings, { access: 'full' }));
    // My GKK is a tab of GKK Config, not a page of its own.
    assert.equal(navItemFor('/admin/my-gkk'), null);
  });

  test('CENSUS shows under Main only while a census is open and not hidden (0088)', async () => {
    const { NAV_GROUPS, censusMenuShown, navLabel } = await import('../src/components/adminNav.js');
    const main = NAV_GROUPS.find((g) => g.label === 'Main');
    const shortcut = main.items.find((i) => i.whileCensusOpen);
    assert.equal(shortcut.label, 'CENSUS');
    assert.equal(shortcut.to, '/admin/census');
    const open = { id: 3, label: '2026 Census' };
    assert.ok(censusMenuShown({ census_in_main_menu: true }, open));
    assert.ok(censusMenuShown({}, open)); // before 0088
    assert.ok(!censusMenuShown({ census_in_main_menu: false }, open));
    assert.ok(!censusMenuShown({ census_in_main_menu: true }, null));
    // The Census page is still the one under Registry.
    assert.equal(navLabel(navItemFor('/admin/census'), { access: 'full' }), 'Census');
    assert.ok(!navAllowed(shortcut, { access: 'website' }));
  });

  test('adds up the request queues for one badge', () => {
    assert.deepEqual(navBadges({ pending_households: 2, requests: { certificates: 1, ready: 2, blood: 0, sacraments: 3 } }),
      { pending: 2, duplicates: 0, sacraments: 0, census: 0, requests: 6 });
  });
});

test('an account without a staff profile has no access (0062)', () => {
  const none = { access: 'none' };
  for (const what of ['registry', 'requests', 'website', 'census', 'reports', 'exports', 'bloodTypes', 'settings', 'editRegistry']) {
    assert.equal(can(none, what), false, what);
  }
  assert.equal(accessLabel('none'), 'No access');
});
