// Password reset by email (Supabase Auth, sent through the parish Gmail; see
// docs/email-setup.md). Pure helpers, kept apart from the Supabase calls in
// emailApi.js so they can be unit tested under Node.

// Where the emailed link lands: the "Set a new password" page, in reset mode.
export const RESET_PATH = '/admin/change-password?reset=1';

/** The full link Supabase puts in the email, for this site's address. */
export function resetRedirectUrl(origin) {
  return `${String(origin || '').replace(/\/+$/, '')}${RESET_PATH}`;
}

/** The claims inside a Supabase access token (a JWT), or null. */
function tokenClaims(accessToken) {
  const part = String(accessToken || '').split('.')[1];
  if (!part) return null;
  try {
    const json = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = json + '='.repeat((4 - (json.length % 4)) % 4);
    return JSON.parse(typeof atob === 'function' ? atob(padded) : globalThis.Buffer.from(padded, 'base64').toString('binary'));
  } catch {
    return null;
  }
}

/**
 * True when this session came from an emailed reset link (Supabase records
 * "recovery" among the token's sign-in methods), within the last `maxAgeMin`
 * minutes. Only then may a new password be set without the current one, so
 * an unattended signed-in browser can't be used to take over the account.
 */
export function isRecoverySession(session, now = Date.now(), maxAgeMin = 60) {
  const claims = tokenClaims(session?.access_token);
  const recovery = (claims?.amr || []).find((a) => a?.method === 'recovery');
  if (!recovery) return false;
  const at = Number(recovery.timestamp) * 1000;
  return Number.isFinite(at) && now - at <= maxAgeMin * 60 * 1000;
}

/** A plain-words message for a failed "send reset link". */
export function resetErrorMessage(error) {
  const msg = String(error?.message || '');
  const wait = msg.match(/after (\d+) seconds?/i);
  if (wait) return `Please wait ${wait[1]} seconds before asking for another link.`;
  if (error?.status === 429 || /rate limit/i.test(msg)) return 'Too many reset emails were sent. Please try again in an hour.';
  if (/smtp|sending|email/i.test(msg)) return "The reset email couldn't be sent. Ask a staff admin to check Parish Config → Platform Integrations → Email.";
  return msg || 'Could not send the reset link';
}
