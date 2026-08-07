import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'unit-test-secret-for-email-tests';

let email;
let resetEmail;

before(async () => {
  email = await import('../../src/lib/email.js');
  resetEmail = await import('../../src/lib/reset-email.js');
});

describe('publicEmailSettings', () => {
  test('never exposes the API key, only whether one is set', () => {
    const view = email.publicEmailSettings({
      provider: 'brevo',
      api_key_enc: 'iv.body.tag',
      apiKey: 'xkeysib-secret',
      sender_email: 'parish@gmail.com',
      sender_name: 'Our Lady',
      reply_to: '',
      enabled: true,
    });

    assert.equal(view.hasApiKey, true);
    assert.equal(JSON.stringify(view).includes('xkeysib-secret'), false);
    assert.equal(JSON.stringify(view).includes('iv.body.tag'), false);
  });

  test('describes an unconfigured install without throwing', () => {
    const view = email.publicEmailSettings(null);
    assert.equal(view.hasApiKey, false);
    assert.equal(view.enabled, false);
  });
});

describe('describeEmailGap', () => {
  const complete = { enabled: true, apiKey: 'xkeysib-key', sender_email: 'parish@gmail.com' };

  test('reports nothing missing when setup is complete', () => {
    assert.equal(email.describeEmailGap(complete), null);
  });

  test('reports each missing piece', () => {
    assert.match(email.describeEmailGap(null), /turned off/i);
    assert.match(email.describeEmailGap({ ...complete, enabled: false }), /turned off/i);
    assert.match(email.describeEmailGap({ ...complete, apiKey: null }), /no api key/i);
    assert.match(email.describeEmailGap({ ...complete, sender_email: '' }), /sender address/i);
  });

  test('distinguishes an unreadable key from an absent one', () => {
    // Rotating JWT_SECRET makes stored credentials undecryptable. Telling the
    // admin to re-enter it is the only useful instruction.
    const unreadable = { ...complete, apiKey: null, api_key_enc: 'iv.body.tag' };
    assert.match(email.describeEmailGap(unreadable), /re-enter/i);
  });
});

describe('buildResetEmail', () => {
  const built = () =>
    resetEmail.buildResetEmail({
      name: 'Ma. Assumpta R.',
      parishName: 'Our Lady of Guadalupe',
      resetUrl: 'https://parish.example/admin/reset-password?token=abc123',
    });

  test('carries the link in both the text and HTML parts', () => {
    const { text, html } = built();
    assert.ok(text.includes('https://parish.example/admin/reset-password?token=abc123'));
    assert.ok(html.includes('https://parish.example/admin/reset-password?token=abc123'));
  });

  test('names the parish so it does not read as spam', () => {
    const { subject, text } = built();
    assert.ok(subject.includes('Our Lady of Guadalupe'));
    assert.ok(text.includes('Ma. Assumpta R.'));
  });

  test('tells the recipient to ignore it if they did not ask', () => {
    assert.match(built().text, /not you/i);
  });

  test('works for an install that has not set a parish name', () => {
    const { subject } = resetEmail.buildResetEmail({ resetUrl: 'https://x/y', parishName: '' });
    assert.ok(subject.length > 0);
  });

  test('escapes HTML so a parish name cannot inject markup', () => {
    const { html } = resetEmail.buildResetEmail({
      parishName: '<script>alert(1)</script>',
      resetUrl: 'https://x/y',
    });
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('resolveAppUrl', () => {
  const withEnv = (env, fn) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      return fn();
    } finally {
      process.env = saved;
    }
  };

  test('prefers PUBLIC_APP_URL and strips a trailing slash', () => {
    withEnv({ PUBLIC_APP_URL: 'https://parish.example/' }, () => {
      assert.equal(resetEmail.resolveAppUrl('https://evil.example'), 'https://parish.example');
    });
  });

  test('accepts the request origin only when it is an allowed CORS origin', () => {
    withEnv({ PUBLIC_APP_URL: '', CORS_ORIGIN: 'https://parish.example' }, () => {
      assert.equal(resetEmail.resolveAppUrl('https://parish.example'), 'https://parish.example');
    });
  });

  test('ignores a forged Origin header, falling back to the allowlist', () => {
    // Otherwise anyone could POST with their own Origin and have a real
    // parish emailed a link pointing at a site they control.
    withEnv({ PUBLIC_APP_URL: '', CORS_ORIGIN: 'https://parish.example' }, () => {
      assert.equal(resetEmail.resolveAppUrl('https://evil.example'), 'https://parish.example');
    });
  });

  test('refuses to guess in production when nothing is configured', () => {
    withEnv({ PUBLIC_APP_URL: '', CORS_ORIGIN: '', NODE_ENV: 'production' }, () => {
      assert.equal(resetEmail.resolveAppUrl('https://evil.example'), null);
    });
  });

  test('falls back to the request origin in development', () => {
    withEnv({ PUBLIC_APP_URL: '', CORS_ORIGIN: '', NODE_ENV: 'development' }, () => {
      assert.equal(resetEmail.resolveAppUrl('http://localhost:5173'), 'http://localhost:5173');
    });
  });
});

describe('buildResetUrl', () => {
  test('points at the client route that reads the token', () => {
    assert.equal(
      resetEmail.buildResetUrl('https://parish.example', 'abc'),
      'https://parish.example/admin/reset-password?token=abc'
    );
  });

  test('escapes tokens so URL-special characters survive the round trip', () => {
    assert.ok(resetEmail.buildResetUrl('https://x', 'a+b/c=').endsWith('token=a%2Bb%2Fc%3D'));
  });
});
