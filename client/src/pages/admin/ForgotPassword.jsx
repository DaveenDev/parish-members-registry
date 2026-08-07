import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Field, TextInput, PrimaryButton } from '../../components/ui.jsx';
import AuthShell from './AuthShell.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send the reset email');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="A reset link is on its way.">
        <div className="mb-5 px-3.5 py-3 bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-xl text-[13.5px] text-[#2b466f] leading-relaxed">
          If <strong>{email}</strong> belongs to a staff account, a reset link has been sent to it. The link works once
          and expires in an hour.
          <div className="mt-2">Nothing arrived after a few minutes? Check the spam folder, then ask whoever set up the
          registry to confirm the parish email settings.</div>
        </div>
        <Link to="/admin/login" className="text-[14px] font-semibold text-parish-blue no-underline">← Back to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password" subtitle="We'll email you a link to choose a new one.">
      <form onSubmit={onSubmit}>
        <div className="mb-[18px]">
          <Field label="Your staff email">
            <TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
        <PrimaryButton type="submit" disabled={loading} className="w-full py-3.5 text-[16px]">
          {loading ? 'Sending…' : 'Send reset link'}
        </PrimaryButton>
      </form>
      <div className="mt-5 text-center">
        <Link to="/admin/login" className="text-[14px] font-semibold text-parish-blue no-underline">← Back to sign in</Link>
      </div>
    </AuthShell>
  );
}
