// Email: password reset by email and the parish email settings (Parish
// Config → Platform Integrations). Supabase Auth sends the reset emails
// through the parish Gmail set up in the Supabase dashboard
// (docs/email-setup.md). Kept beside api.js; the pure helpers are in
// lib/passwordReset.js.
import { supabase } from './lib/supabaseClient.js';
import { resetErrorMessage, resetRedirectUrl } from './lib/passwordReset.js';

const MIGRATION_HINT = 'Run the 0036_email_integration.sql migration in Supabase to save the email settings';
const missingColumn = (error) => error?.code === '42703' || error?.code === 'PGRST204';

/**
 * Email a password-reset link to `email`. Supabase answers the same whether
 * or not the email belongs to an account, so nobody can use this to find
 * out which emails are staff accounts.
 */
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(String(email || '').trim(), {
    redirectTo: resetRedirectUrl(window.location.origin),
  });
  if (error) throw new Error(resetErrorMessage(error));
}

/** Set a new password from a reset link's session (no current password needed); clears the "must change" flag too. */
export async function setNewPassword(password) {
  const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } });
  if (error) throw new Error(error.message || 'Could not save the new password');
}

/** The sender address and name staff use for parish email. */
export async function saveEmailSettings({ outgoingEmail, outgoingName }) {
  const { data, error } = await supabase.from('parish_settings')
    .update({ outgoing_email: String(outgoingEmail || '').trim() || null, outgoing_name: String(outgoingName || '').trim() || null })
    .eq('id', 1).select().single();
  if (missingColumn(error)) throw new Error(MIGRATION_HINT);
  if (error) throw new Error(error.message || 'Could not save the email settings');
  return data;
}

/** Record that a test reset email arrived, so the card shows password reset as working (or clear it). */
export async function markPasswordResetWorking(working = true) {
  const { data, error } = await supabase.from('parish_settings')
    .update({ password_reset_verified_at: working ? new Date().toISOString() : null })
    .eq('id', 1).select().single();
  if (missingColumn(error)) throw new Error(MIGRATION_HINT);
  if (error) throw new Error(error.message || 'Could not save');
  return data;
}
