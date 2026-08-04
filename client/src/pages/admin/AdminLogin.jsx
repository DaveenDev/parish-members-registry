import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { Field, TextInput, Checkbox, PrimaryButton } from '../../components/ui.jsx';
import CreditFooter from '../../components/CreditFooter.jsx';

export default function AdminLogin() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  if (ready && user) return <Navigate to="/admin" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/admin', { replace: true });
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
          <svg viewBox="0 0 80 80" width="66" height="66" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="mx-auto mb-2">
            <circle cx="40" cy="38" r="30" stroke="rgba(228,192,106,.4)" />
            <path d="M40 14l3.2 9.6h10.1l-8.2 5.9 3.1 9.6-8.2-5.9-8.2 5.9 3.1-9.6-8.2-5.9h10.1z" />
            <path d="M40 46v18M31 55h18" />
          </svg>
          <div className="font-serif text-[25px] font-semibold text-white leading-tight">Our Lady of Guadalupe</div>
          <div className="text-[13px] tracking-[.14em] uppercase text-[var(--p-gold-light)]/90 mt-1.5">Members Registry · Admin</div>
        </div>
        <div className="bg-[#fffdf8] rounded-[20px] shadow-2xl px-7 py-[30px]" style={{ padding: '30px 28px' }}>
          <h1 className="font-serif text-[26px] font-semibold m-0 mb-1 text-parish-navy">Staff sign in</h1>
          <p className="text-[14px] text-parish-muted m-0 mb-[22px]" style={{ marginBottom: '22px' }}>Authorized parish personnel only.</p>
          <form onSubmit={onSubmit}>
            <div className="mb-4">
              <Field label="Email"><TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            </div>
            <div className="mb-[18px]">
              <Field label="Password"><TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            </div>
            <div className="flex items-center justify-between mb-5">
              <label className="flex items-center gap-2 cursor-pointer text-[13.5px] text-parish-text2">
                <Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4" />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => setShowHelp((s) => !s)}
                aria-expanded={showHelp}
                className="appearance-none border-none bg-none cursor-pointer text-[13.5px] font-semibold text-parish-blue p-0"
              >
                Forgot password?
              </button>
            </div>
            {showHelp && (
              <div className="mb-4 px-3.5 py-3 bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-xl text-[13px] text-[#2b466f] leading-relaxed">
                There's no automated reset yet. Ask another parish staff member with access to sign in and set a new
                password for you from <strong>Parish Config → Change password</strong>, or contact your system administrator.
              </div>
            )}
            {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
            <PrimaryButton type="submit" disabled={loading} className="w-full py-3.5 text-[16px]">
              {loading ? 'Signing in…' : 'Sign in'}
            </PrimaryButton>
          </form>
        </div>
      </div>
      <CreditFooter dark />
    </div>
  );
}
