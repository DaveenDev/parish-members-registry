import React, { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Field, TextInput, PrimaryButton } from '../../components/ui.jsx';
import AuthShell from './AuthShell.jsx';

const MIN_LENGTH = 10;

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (next !== confirm) return setError('The new passwords do not match.');
    if (next.length < MIN_LENGTH) return setError(`New password must be at least ${MIN_LENGTH} characters.`);

    setLoading(true);
    setError('');
    try {
      await api.resetPassword(token, next);
      // The old session, if any, died with the password change.
      localStorage.removeItem('pmr_token');
      setDone(true);
    } catch (err) {
      setError(err.message || 'Could not reset the password');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Link incomplete" subtitle="This address is missing its reset token.">
        <p className="text-[14px] text-parish-text2 leading-relaxed mb-5">
          Open the link straight from the email — some mail apps cut long links in half. If that keeps happening,
          request a new one.
        </p>
        <Link to="/admin/forgot-password" className="text-[14px] font-semibold text-parish-blue no-underline">
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You can sign in with your new password.">
        <PrimaryButton onClick={() => navigate('/admin/login')} className="w-full py-3.5 text-[16px]">
          Go to sign in
        </PrimaryButton>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle={`At least ${MIN_LENGTH} characters.`}>
      <form onSubmit={onSubmit}>
        <div className="mb-4">
          <Field label="New password">
            <TextInput type="password" autoComplete="new-password" required value={next}
              onChange={(e) => { setNext(e.target.value); setError(''); }} />
          </Field>
        </div>
        <div className="mb-[18px]">
          <Field label="Confirm new password">
            <TextInput type="password" autoComplete="new-password" required value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(''); }} />
          </Field>
        </div>
        {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
        <PrimaryButton type="submit" disabled={loading} className="w-full py-3.5 text-[16px]">
          {loading ? 'Updating…' : 'Set new password'}
        </PrimaryButton>
      </form>
      <div className="mt-5 text-center">
        <Link to="/admin/login" className="text-[14px] font-semibold text-parish-blue no-underline">← Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
