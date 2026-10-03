import React, { useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput, PrimaryButton } from './ui.jsx';

export const MIN_PASSWORD_LENGTH = 10; // same rule as the manage-staff function

/**
 * Current / new / confirm password fields. Used by Parish Config's "Change
 * password" card and the forced first-sign-in screen (ChangePassword.jsx).
 * With `requireCurrent={false}` (a password-reset link, which already proved
 * who it is) there's no current-password field, and `onSubmitPassword(next)`
 * saves the new one.
 */
export default function ChangePasswordForm({ currentLabel = 'Current password', submitLabel = 'Update password', onChanged, columns = true, requireCurrent = true, onSubmitPassword }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  async function submit(e) {
    e.preventDefault();
    if (requireCurrent && !form.current) { setError(`Enter your ${currentLabel.toLowerCase()}.`); return; }
    if (form.next !== form.confirm) { setError('The new passwords do not match.'); return; }
    if (form.next.length < MIN_PASSWORD_LENGTH) { setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (requireCurrent && form.next === form.current) { setError('Choose a password different from the current one.'); return; }

    setSaving(true);
    try {
      if (requireCurrent) await api.changePassword(form.current, form.next);
      else await onSubmitPassword(form.next);
      setForm({ current: '', next: '', confirm: '' });
      onChanged?.();
    } catch (err) {
      setError(err.message || 'Could not change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="mb-3 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
      <div className={columns ? 'grid gap-4' : 'flex flex-col gap-4'} style={columns ? { gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' } : undefined}>
        {requireCurrent && <Field label={currentLabel}><TextInput type="password" autoComplete="current-password" value={form.current} onChange={set('current')} /></Field>}
        <Field label="New password"><TextInput type="password" autoComplete="new-password" value={form.next} onChange={set('next')} /></Field>
        <Field label="Confirm new password"><TextInput type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></Field>
      </div>
      <PrimaryButton type="submit" disabled={saving} className={columns ? 'mt-5 px-[26px] py-3 text-[14.5px]' : 'mt-5 w-full py-3.5 text-[16px]'}>
        {saving ? 'Updating…' : submitLabel}
      </PrimaryButton>
    </form>
  );
}
