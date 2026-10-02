import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { messengerUsername, messengerLink } from '../src/lib/website.js';

describe('messengerUsername', () => {
  test('takes a bare username or @username', () => {
    assert.equal(messengerUsername('juan.delacruz'), 'juan.delacruz');
    assert.equal(messengerUsername('  @juan.delacruz '), 'juan.delacruz');
  });

  test('reads Facebook, m.me and Messenger links', () => {
    assert.equal(messengerUsername('https://www.facebook.com/juan.delacruz'), 'juan.delacruz');
    assert.equal(messengerUsername('facebook.com/juan.delacruz/?ref=bookmarks'), 'juan.delacruz');
    assert.equal(messengerUsername('https://m.facebook.com/juan.delacruz'), 'juan.delacruz');
    assert.equal(messengerUsername('fb.com/juan.delacruz'), 'juan.delacruz');
    assert.equal(messengerUsername('https://m.me/juan.delacruz'), 'juan.delacruz');
    assert.equal(messengerUsername('https://www.messenger.com/t/juan.delacruz'), 'juan.delacruz');
  });

  test('reads numeric profile ids', () => {
    assert.equal(messengerUsername('https://www.facebook.com/profile.php?id=100012345678901'), '100012345678901');
    assert.equal(messengerUsername('https://www.facebook.com/people/Juan-Dela-Cruz/100012345678901/'), '100012345678901');
  });

  test("blank is '', anything else unreadable is null", () => {
    assert.equal(messengerUsername('   '), '');
    assert.equal(messengerUsername('https://example.com/juan'), null);
    assert.equal(messengerUsername('https://facebook.com/'), null);
    assert.equal(messengerUsername('https://facebook.com/groups/parish'), null);
    assert.equal(messengerUsername('juan dela cruz'), null);
  });
});

describe('messengerLink', () => {
  test('builds the m.me link', () => {
    assert.equal(messengerLink('https://facebook.com/juan.delacruz'), 'https://m.me/juan.delacruz');
    assert.equal(messengerLink(''), '');
    assert.equal(messengerLink('not a username!'), '');
  });
});
