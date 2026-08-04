/**
 * The browser API client, driven against a stubbed `fetch`.
 *
 * These tests are about the wire contract the admin panel depends on: which
 * URL is called, whether the session token is attached, and how the response —
 * including an error response — is turned into something the UI can use.
 */
import test, { describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

import { api, downloadWithAuth, triggerDownload } from '../src/api.js';

/** Records calls and replies with whatever the test queues up. */
function stubFetch(reply = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options, headers: options.headers || {} });
    const {
      status = 200,
      contentType = 'application/json',
      body = { ok: true },
    } = typeof reply === 'function' ? reply(url, options) : reply;

    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
      blob: async () => ({ __blob: true, body }),
    };
  };
  return calls;
}

const store = new Map();
const originals = {};

before(() => {
  originals.fetch = globalThis.fetch;
  originals.localStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
});

after(() => {
  globalThis.fetch = originals.fetch;
  globalThis.localStorage = originals.localStorage;
});

beforeEach(() => {
  store.clear();
});

describe('request basics', () => {
  test('prefixes every path with /api and sends JSON', async () => {
    const calls = stubFetch({ body: { token: 'abc' } });

    await api.login('secretary@parish.test', 'hunter2');

    assert.equal(calls[0].url, '/api/auth/login');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      email: 'secretary@parish.test',
      password: 'hunter2',
    });
  });

  test('sends no body on a GET', async () => {
    const calls = stubFetch();

    await api.dashboardStats();

    assert.equal(calls[0].url, '/api/dashboard/stats');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.body, undefined);
  });

  test('returns the parsed JSON body', async () => {
    stubFetch({ body: { user: { id: 1, name: 'Ma. Assumpta R.' } } });

    const result = await api.me();
    assert.equal(result.user.name, 'Ma. Assumpta R.');
  });

  test('returns null for a 204, so a delete does not try to parse a body', async () => {
    stubFetch({ status: 204, contentType: '', body: '' });

    assert.equal(await api.deleteMember(3), null);
  });
});

describe('authentication', () => {
  test('attaches the stored token to admin calls', async () => {
    store.set('pmr_token', 'a-signed-token');
    const calls = stubFetch();

    await api.listMembers({ page: 1 });

    assert.equal(calls[0].headers.Authorization, 'Bearer a-signed-token');
  });

  test('sends no Authorization header when there is no session', async () => {
    const calls = stubFetch();

    await api.listMembers({ page: 1 });

    assert.equal(calls[0].headers.Authorization, undefined);
  });

  test('never attaches the token to the public endpoints', async () => {
    store.set('pmr_token', 'a-signed-token');
    const calls = stubFetch({ status: 201, body: { refNo: 'OLG-2026-ABC234' } });

    await api.login('a@b.test', 'pw');
    await api.submitRegistration({ household: {}, members: [] });

    assert.equal(calls[0].headers.Authorization, undefined);
    assert.equal(calls[1].headers.Authorization, undefined);
  });
});

describe('error handling', () => {
  test('throws with the server message so the UI can show it', async () => {
    stubFetch({ status: 400, body: { error: 'ZIP code is required' } });

    await assert.rejects(() => api.submitRegistration({}), { message: 'ZIP code is required' });
  });

  test('falls back to a generic message when the body is not JSON', async () => {
    stubFetch({ status: 502, contentType: 'text/html', body: '<html>Bad Gateway</html>' });

    await assert.rejects(() => api.me(), { message: 'Request failed' });
  });

  test('falls back when the JSON body has no error field', async () => {
    stubFetch({ status: 500, body: { detail: 'nope' } });

    await assert.rejects(() => api.dashboardStats(), { message: 'Request failed' });
  });

  test('surfaces a 401 as an error rather than resolving with empty data', async () => {
    stubFetch({ status: 401, body: { error: 'Invalid or expired session' } });

    await assert.rejects(() => api.listHouseholds({}), { message: 'Invalid or expired session' });
  });
});

describe('query strings', () => {
  test('encodes list filters', async () => {
    const calls = stubFetch();

    await api.listMembers({ status: 'Verified', gkk: 'GKK Sto. Niño', page: 2, search: 'dela cruz' });

    const url = new URL(calls[0].url, 'http://localhost');
    assert.equal(url.pathname, '/api/members');
    assert.equal(url.searchParams.get('status'), 'Verified');
    assert.equal(url.searchParams.get('gkk'), 'GKK Sto. Niño');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('search'), 'dela cruz');
  });

  test('encodes names in the path for the pick-list endpoints', async () => {
    const calls = stubFetch();

    await api.renameMinistry('Lector & Commentator', 'Lector');
    await api.deleteGkk('GKK Sto. Niño');

    assert.equal(calls[0].url, '/api/config/ministries/Lector%20%26%20Commentator');
    assert.equal(calls[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(calls[0].options.body), { name: 'Lector' });
    assert.equal(calls[1].url, '/api/config/gkks/GKK%20Sto.%20Ni%C3%B1o');
    assert.equal(calls[1].options.method, 'DELETE');
  });

  test('omits the gkk parameter entirely when no scope is given', async () => {
    const calls = stubFetch();

    await api.listMinistries();
    await api.listOrganizations({ gkk: 'GKK San Isidro' });

    assert.equal(calls[0].url, '/api/config/ministries');
    assert.equal(calls[1].url, '/api/config/organizations?gkk=GKK+San+Isidro');
  });
});

describe('exports', () => {
  test('exportUrl points at the API', () => {
    assert.equal(api.exportUrl('members.csv'), '/api/exports/members.csv');
  });

  test('exportGenerated posts the report and returns a blob', async () => {
    const calls = stubFetch({ contentType: 'text/csv', body: 'Name\nAna' });

    const blob = await api.exportGenerated({ title: 'Members', columns: ['Name'], rows: [] });

    assert.equal(calls[0].url, '/api/exports/generated.csv');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(blob.__blob, true, 'the raw response should be turned into a blob');
  });

  test('downloadWithAuth sends the session token with the download', async () => {
    store.set('pmr_token', 'a-signed-token');
    const calls = stubFetch({ contentType: 'text/csv', body: 'Name\nAna' });
    const dom = installFakeDom();

    try {
      downloadWithAuth('/exports/members.csv', 'members.csv');
      await new Promise(setImmediate);
    } finally {
      dom.restore();
    }

    assert.equal(calls[0].url, '/api/exports/members.csv');
    assert.equal(calls[0].headers.Authorization, 'Bearer a-signed-token');
    assert.equal(dom.anchor.download, 'members.csv', 'the download never reached the browser');
  });
});

describe('triggerDownload', () => {
  test('clicks a temporary anchor with the filename and cleans up after itself', () => {
    const dom = installFakeDom();
    try {
      triggerDownload({ __blob: true }, 'blood-directory.csv');
    } finally {
      dom.restore();
    }

    assert.equal(dom.anchor.download, 'blood-directory.csv');
    assert.equal(dom.anchor.href, 'blob:mock-url');
    assert.equal(dom.anchor.clicked, true);
    assert.equal(dom.appended, dom.anchor, 'the anchor must be in the document for Firefox to honour the click');
    assert.equal(dom.anchor.removed, true, 'the anchor was left in the document');
    assert.equal(dom.revoked, 'blob:mock-url', 'the object URL was not revoked');
  });
});

/** Swap in a throwaway document/URL. Call `restore()` when the work is done. */
function installFakeDom() {
  const savedDocument = globalThis.document;
  const savedUrl = globalThis.URL;

  const anchor = {
    href: '',
    download: '',
    clicked: false,
    removed: false,
    click() { this.clicked = true; },
    remove() { this.removed = true; },
  };

  const state = {
    anchor,
    appended: null,
    revoked: null,
    restore() {
      globalThis.document = savedDocument;
      globalThis.URL = savedUrl;
    },
  };

  globalThis.document = {
    createElement: () => anchor,
    body: { appendChild: (el) => { state.appended = el; } },
  };
  globalThis.URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: (url) => { state.revoked = url; },
  };

  return state;
}
