/** The one message this app sends. Kept apart from the routes so it can be tested directly. */

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const RESET_TOKEN_TTL_MINUTES = 60;

export function buildResetEmail({ name, parishName, resetUrl, ttlMinutes = RESET_TOKEN_TTL_MINUTES }) {
  const parish = parishName || 'the parish registry';
  const greeting = name ? `Hello ${name},` : 'Hello,';

  const text = [
    greeting,
    '',
    `Someone asked to reset the password for your ${parish} admin account.`,
    '',
    'Open this link to choose a new one:',
    resetUrl,
    '',
    `The link works once and expires in ${ttlMinutes} minutes.`,
    '',
    'If this was not you, no action is needed — your password has not changed.',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f4;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1f2933">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
    <p style="margin:0 0 12px;line-height:1.6">${escapeHtml(greeting)}</p>
    <p style="margin:0 0 24px;line-height:1.6">Someone asked to reset the password for your ${escapeHtml(parish)} admin account.</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#1f6f4a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Choose a new password</a>
    </p>
    <p style="margin:0 0 12px;line-height:1.6;font-size:14px;color:#52606d">
      The link works once and expires in ${ttlMinutes} minutes. If the button does not work, paste this into your browser:
    </p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#52606d">${escapeHtml(resetUrl)}</p>
    <p style="margin:0;line-height:1.6;font-size:14px;color:#52606d">
      If this was not you, no action is needed — your password has not changed.
    </p>
  </div>
</body></html>`;

  return { subject: `Reset your ${parish} password`, text, html };
}

/**
 * Where the reset link points. The client is hosted separately from the API,
 * so the API cannot infer this from its own address — PUBLIC_APP_URL is
 * authoritative. The request Origin is a development convenience only, and is
 * accepted solely when it is already a permitted CORS origin, so a forged
 * header cannot plant an attacker's link in a real parish's email.
 */
export function resolveAppUrl(originHeader) {
  const configured = process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, '');

  const allowlist = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (originHeader && allowlist.includes(originHeader)) return originHeader.replace(/\/+$/, '');
  if (allowlist.length) return allowlist[0].replace(/\/+$/, '');
  if (originHeader && process.env.NODE_ENV !== 'production') return originHeader.replace(/\/+$/, '');

  return null;
}

export function buildResetUrl(appUrl, token) {
  return `${appUrl}/admin/reset-password?token=${encodeURIComponent(token)}`;
}
