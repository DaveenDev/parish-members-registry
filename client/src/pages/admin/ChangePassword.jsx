import React, { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { api } from '../../api.js';
import { adminReturnPath } from '../../lib/util.js';
import ChangePasswordForm, { MIN_PASSWORD_LENGTH } from '../../components/ChangePasswordForm.jsx';
import CreditFooter from '../../components/CreditFooter.jsx';
import { useToast } from '../../ToastContext.jsx';

/**
 * Where a staff account lands after signing in with a password an admin gave
 * them (a new account, or a reset from Settings → Staff). RequireAuth sends
 * them here until they choose their own; then on to the page they asked for.
 */
export default function ChangePassword() {
  const { user, ready, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const dest = adminReturnPath(location.state?.from);
  const [parishName, setParishName] = useState('');

  useEffect(() => { api.publicOfficeDetails().then((d) => setParishName(d?.name || '')).catch(() => {}); }, []);

  if (!ready) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!user.mustChangePassword) return <Navigate to={dest} replace />;

  async function signOut() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 font-sans"
      style={{ background: 'radial-gradient(130% 100% at 50% -20%,var(--p-sidebar-a) 0%,var(--p-sidebar-a) 45%,var(--p-sidebar-b) 100%)' }}
    >
      <div className="w-full max-w-[420px] animate-fadeUp">
        <div className="text-center mb-[26px]">
          <div className="font-serif text-[25px] font-semibold text-white leading-tight">{parishName || 'Our Lady of Guadalupe'}</div>
          <div className="text-[13px] tracking-[.14em] uppercase text-[var(--p-gold-light)]/90 mt-1.5">Members Registry · Admin</div>
        </div>
        <div className="bg-parish-card rounded-[20px] shadow-2xl" style={{ padding: '30px 28px' }}>
          <h1 className="font-serif text-[26px] font-semibold m-0 mb-1 text-parish-navy">Set a new password</h1>
          <p className="text-[14px] text-parish-muted m-0 mb-[22px]">
            Welcome{user.name && user.name !== user.email ? `, ${user.name}` : ''}. You signed in with a temporary password from a staff admin.
            Choose your own (at least {MIN_PASSWORD_LENGTH} characters) to continue.
          </p>
          <ChangePasswordForm
            columns={false}
            currentLabel="Temporary password"
            submitLabel="Save and continue"
            onChanged={async () => {
              // Pick up the cleared flag before leaving, so RequireAuth doesn't send us back.
              await refreshUser();
              toast.success('Password changed');
              navigate(dest, { replace: true });
            }}
          />
          <div className="mt-4 text-center">
            <button type="button" onClick={signOut} className="appearance-none border-none bg-transparent cursor-pointer text-[13.5px] font-semibold text-parish-blue p-0">
              Sign out
            </button>
          </div>
        </div>
      </div>
      <CreditFooter dark />
    </div>
  );
}
