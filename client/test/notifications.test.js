import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { isUnread, unreadCount, timeAgo, urlBase64ToUint8Array, deviceLabel, pushSupport, kindStyle, PUSH_LEVELS, DEFAULT_PUSH_LEVEL, MEMBER_REQUEST_KINDS } from '../src/lib/notifications.js';

describe('staff notifications', () => {
  const list = [
    { id: 3, created_at: '2026-10-03T02:00:00Z' },
    { id: 2, created_at: '2026-10-02T23:00:00Z' },
    { id: 1, created_at: '2026-10-01T05:00:00Z' },
  ];

  test('unread: what came after the bell was opened', () => {
    assert.equal(unreadCount(list, '2026-10-02T23:30:00Z'), 1);
    assert.equal(unreadCount(list, null), 3);
    assert.equal(unreadCount(null, null), 0);
    assert.ok(!isUnread(list[1], '2026-10-02T23:00:00Z'));
  });

  test('time ago, in Philippine dates', () => {
    const now = new Date('2026-10-03T04:00:00Z'); // 12:00 noon in Manila
    assert.equal(timeAgo('2026-10-03T03:59:30Z', now), 'Just now');
    assert.equal(timeAgo('2026-10-03T03:15:00Z', now), '45 min ago');
    assert.equal(timeAgo('2026-10-02T17:00:00Z', now), '11 hr ago'); // 1 AM today
    assert.equal(timeAgo('2026-10-02T10:00:00Z', now), 'Yesterday');
    assert.equal(timeAgo('2026-09-28T10:00:00Z', now), 'Sep 28');
  });

  test('push key to bytes', () => {
    const bytes = urlBase64ToUint8Array('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    assert.equal(bytes.length, 65);
    assert.equal(bytes[0], 4);
  });

  test('device names', () => {
    assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
    assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), 'Android phone · Chrome');
    assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'), 'Windows · Edge');
    assert.equal(deviceLabel(''), 'Device');
  });

  test('which browsers can get notifications', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1';
    const full = { hasServiceWorker: true, hasPush: true, permission: 'default' };
    assert.equal(pushSupport({ ua: iphone, ...full }), 'ios-install');
    assert.equal(pushSupport({ ua: iphone, standalone: true, ...full }), 'ok');
    assert.equal(pushSupport({ ua: 'Android Chrome', ...full }), 'ok');
    assert.equal(pushSupport({ ua: 'Android Chrome', ...full, permission: 'denied' }), 'denied');
    assert.equal(pushSupport({ ua: 'Old', hasServiceWorker: true, hasPush: false, permission: 'default' }), 'unsupported');
  });

  test('every kind has a look, unknown ones too', () => {
    assert.equal(kindStyle('anointing').tone, 'red');
    assert.equal(kindStyle('something-new').label, 'Notice');
  });
});

describe('push levels', () => {
  test('member requests only is the default and listed first', () => {
    assert.equal(DEFAULT_PUSH_LEVEL, 'requests');
    assert.equal(PUSH_LEVELS[0].key, 'requests');
    assert.deepEqual(PUSH_LEVELS.map((l) => l.key).sort(), ['all', 'none', 'requests', 'urgent']);
  });
  test('member requests leave out registrations and the morning summary', () => {
    for (const k of ['anointing', 'certificate', 'ocia', 'blood', 'donor', 'census']) assert.ok(MEMBER_REQUEST_KINDS.includes(k), k);
    assert.ok(!MEMBER_REQUEST_KINDS.includes('registration'));
    assert.ok(!MEMBER_REQUEST_KINDS.includes('digest'));
    assert.equal(kindStyle('donor').label, 'Blood donor');
  });
});
