import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { IDLE_LIMIT_MINUTES } from '../../lib/idle.js';
import { useAuth } from '../../AuthContext.jsx';
import { api } from '../../api.js';
import { sendPasswordReset } from '../../emailApi.js';
import { adminReturnPath } from '../../lib/util.js';
import { Field, TextInput, PrimaryButton } from '../../components/ui.jsx';
import CreditFooter from '../../components/CreditFooter.jsx';

export default function AdminLogin() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // The admin page that sent the person here (see RequireAuth), else the Dashboard.
  const dest = adminReturnPath(location.state?.from);
  const signedOutIdle = location.state?.reason === 'idle';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // "Forgot password?": open straight away when coming back from an expired reset link.
  const [showHelp, setShowHelp] = useState(!!location.state?.forgot);
  const [logo, setLogo] = useState(null);
  const [parishName, setParishName] = useState('');

  // The logo uploaded in Parish Config; the star emblem stays if there isn't one.
  useEffect(() => { api.publicParishLogo().then(setLogo).catch(() => {}); }, []);
  // The name from Parish Config. Before 0013 is run this fails quietly and the default shows.
  useEffect(() => { api.publicOfficeDetails().then((d) => setParishName(d?.name || '')).catch(() => {}); }, []);

  if (ready && user) return <Navigate to={dest} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 font-sans"
      style={{ background: 'radial-gradient(130% 100% at 50% -20%,var(--p-sidebar-a) 0%,var(--p-sidebar-a) 45%,var(--p-sidebar-b) 100%)' }}
    >
      <div className="w-full max-w-[400px] animate-fadeUp">
        <div className="text-center mb-[26px] text-[var(--p-gold-light)]" style={{ marginBottom: '26px' }}>
          {logo ? (
            <img src={logo} alt={`${parishName || 'Parish'} logo`} className="w-[72px] h-[72px] object-contain mx-auto mb-2 bg-parish-surface rounded-2xl p-1.5" />
          ) : (
            <svg viewBox="0 0 80 80" width="66" height="66" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="mx-auto mb-2" aria-hidden>
              <circle cx="40" cy="38" r="30" stroke="rgba(228,192,106,.4)" />
              <path d="M40 14l3.2 9.6h10.1l-8.2 5.9 3.1 9.6-8.2-5.9-8.2 5.9 3.1-9.6-8.2-5.9h10.1z" />
              <path d="M40 46v18M31 55h18" />
            </svg>
          )}
          <div className="font-serif text-[25px] font-semibold text-white leading-tight">{parishName || 'Our Lady of Guadalupe'}</div>
          <div className="text-[13px] tracking-[.14em] uppercase text-[var(--p-gold-light)]/90 mt-1.5">Members Registry · Admin</div>
        </div>
        <div className="bg-parish-card rounded-[20px] shadow-2xl px-7 py-[30px]" style={{ padding: '30px 28px' }}>
          <h1 className="font-serif text-[26px] font-semibold m-0 mb-1 text-parish-navy">Staff sign in</h1>
          <p className="text-[14px] text-parish-muted m-0 mb-[22px]" style={{ marginBottom: '22px' }}>Authorized parish personnel only.</p>
          {signedOutIdle && !error && (
            <div className="mb-4 px-3.5 py-3 bg-parish-warnBg border border-parish-warnBorder rounded-xl text-[13px] text-parish-warnStrong leading-relaxed" role="status">
              You were signed out after {IDLE_LIMIT_MINUTES} minutes without activity. Sign in again to continue.
            </div>
          )}
          <form onSubmit={onSubmit}>
            <div className="mb-4">
              <Field label="Email"><TextInput type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            </div>
            <div className="mb-[18px]">
              <Field label="Password"><TextInput type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            </div>
            <div className="flex items-center justify-end mb-5">
              <button
                type="button"
                onClick={() => setShowHelp((s) => !s)}
                aria-expanded={showHelp}
                className="appearance-none border-none bg-none cursor-pointer text-[13.5px] font-semibold text-parish-blue p-0"
              >
                Forgot password?
              </button>
            </div>
            {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
            <PrimaryButton type="submit" disabled={loading} className="w-full py-3.5 text-[16px]">
              {loading ? 'Signing in…' : 'Sign in'}
            </PrimaryButton>
          </form>
          {showHelp && <ForgotPassword initialEmail={email} />}
        </div>
      </div>
      <CreditFooter dark />
    </div>
  );
}

/**
 * "Forgot password?": emails a reset link (Supabase Auth, sent through the
 * parish Gmail; docs/email-setup.md). The reply is the same whether or not
 * the email is a staff account. Admins can still reset a password by hand.
 */
function ForgotPassword({ initialEmail }) {
  const [email, setEmail] = useState(initialEmail || '');
  const [state, setState] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');

  async function send(e) {
    e.preventDefault();
    if (!email.trim()) { setError('Enter the email you sign in with.'); return; }
    setState('sending');
    setError('');
    try {
      await sendPasswordReset(email);
      setState('sent');
    } catch (err) {
      setError(err.message);
      setState('idle');
    }
  }

  return (
    <div className="mt-5 px-4 py-4 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
      {state === 'sent' ? (
        <div role="status">
          <div className="font-semibold text-parish-navy mb-1">Check your email</div>
          If <strong>{email.trim()}</strong> belongs to a staff account, a reset link is on its way. It works once, for an hour.
          Check your spam folder too.
        </div>
      ) : (
        <form onSubmit={send}>
          <div className="font-semibold text-parish-navy mb-2">Reset your password by email</div>
          <div className="flex gap-2 flex-wrap">
            <TextInput type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your sign-in email" aria-label="Your sign-in email" className="flex-1 min-w-[180px] !py-2.5" />
            <button type="submit" disabled={state === 'sending'} className="appearance-none border-none cursor-pointer px-4 py-2.5 rounded-xl bg-parish-fill text-white font-semibold text-[14px] disabled:opacity-60">
              {state === 'sending' ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
          {error && <div className="mt-2 text-parish-error font-medium" role="alert">{error}</div>}
        </form>
      )}
      <div className="mt-3 text-[12.5px] text-parish-muted">
        No email? Ask a staff admin to reset it from <strong>Settings → Staff</strong>; you'll get a temporary password to change on sign-in.
      </div>
    </div>
  );
}
