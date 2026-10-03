import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { api } from '../../api.js';
import { setNewPassword } from '../../emailApi.js';
import { supabase } from '../../lib/supabaseClient.js';
import { isRecoverySession } from '../../lib/passwordReset.js';
import { adminReturnPath } from '../../lib/util.js';
import ChangePasswordForm, { MIN_PASSWORD_LENGTH } from '../../components/ChangePasswordForm.jsx';
import CreditFooter from '../../components/CreditFooter.jsx';
import { useToast } from '../../ToastContext.jsx';

/**
 * "Set a new password", in two cases:
 *  - a staff account that signed in with a password an admin gave them (a
 *    new account, or a reset from Settings → Staff). RequireAuth sends them
 *    here until they choose their own; then on to the page they asked for.
 *  - ?reset=1: the link from a password-reset email. Supabase signs the
 *    person in from the link; they choose a new password without the old
 *    one. Only a session that really came from a reset link may do that.
 */
export default function ChangePassword() {
  const { user, ready, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const toast = useToast();
  const dest = adminReturnPath(location.state?.from);
  const resetMode = params.get('reset') === '1';
  const [parishName, setParishName] = useState('');
  const [recovery, setRecovery] = useState(resetMode ? null : false); // null while checking

  useEffect(() => { api.publicOfficeDetails().then((d) => setParishName(d?.name || '')).catch(() => {}); }, []);
  useEffect(() => {
    if (!resetMode || !ready) return;
    supabase.auth.getSession().then(({ data: { session } }) => setRecovery(isRecoverySession(session)));
  }, [resetMode, ready, user]);

  if (!ready || recovery === null) return null;

  async function signOut() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  let title;
  let body;
  if (resetMode && recovery) {
    title = 'Choose a new password';
    body = (
      <>
        <p className="text-[14px] text-parish-muted m-0 mb-[22px]">
          {user?.email ? <>For <strong className="text-parish-ink">{user.email}</strong>. </> : null}
          Use at least {MIN_PASSWORD_LENGTH} characters.
        </p>
        <ChangePasswordForm
          columns={false}
          requireCurrent={false}
          onSubmitPassword={setNewPassword}
          submitLabel="Save and sign in"
          onChanged={async () => {
            await refreshUser();
            toast.success('Password changed');
            navigate('/admin', { replace: true });
          }}
        />
      </>
    );
  } else if (resetMode && !user) {
    title = 'This link has expired';
    body = (
      <>
        <p className="text-[14px] text-parish-muted m-0 mb-[22px]">
          Reset links work once, for an hour. Ask for a new one from the sign-in page, or ask a staff admin to reset your password.
        </p>
        <Link to="/admin/login" state={{ forgot: true }} className="block text-center w-full py-3.5 rounded-xl bg-parish-fill text-white font-semibold text-[16px]">
          Back to sign in
        </Link>
      </>
    );
  } else {
    // Not a reset link (or already used): the usual rules.
    if (!user) return <Navigate to="/admin/login" replace />;
    if (!user.mustChangePassword) return <Navigate to={resetMode ? '/admin' : dest} replace />;
    title = 'Set a new password';
    body = (
      <>
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
      </>
    );
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
          <h1 className="font-serif text-[26px] font-semibold m-0 mb-1 text-parish-navy">{title}</h1>
          {body}
          {user && (
            <div className="mt-4 text-center">
              <button type="button" onClick={signOut} className="appearance-none border-none bg-transparent cursor-pointer text-[13.5px] font-semibold text-parish-blue p-0">
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
      <CreditFooter dark />
    </div>
  );
}
