import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { PageHeader, PageBody, EmptyState, ErrorState, LoadingState, Panel, Modal } from '../../components/admin.jsx';
import { Field, TextInput, Select, PrimaryButton, GhostButton, Badge } from '../../components/ui.jsx';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { fmtDateTime } from '../../constants.js';
import { generateTempPassword } from '../../lib/util.js';
import { ACCESS_LEVELS, accessLabel } from '../../lib/access.js';

const EMPTY_FORM = { name: '', email: '', role: 'Parish Staff', isAdmin: false, access: 'full', accessGkk: '' };

/** Add or edit form. Email is fixed once an account exists. */
function StaffForm({ initial, isNew, busy, error, gkks, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((f) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    // Staff admins always have full access.
    if (key === 'isAdmin' && value) return { ...f, isAdmin: true, access: 'full' };
    return { ...f, [key]: value };
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="flex flex-col gap-4">
      {error && <div className="text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
      <Field label="Name" required><TextInput value={form.name} onChange={set('name')} autoFocus /></Field>
      {isNew
        ? <Field label="Email" required><TextInput type="email" value={form.email} onChange={set('email')} autoComplete="off" /></Field>
        : <div className="text-[13.5px] text-parish-text2"><span className="font-semibold">Email:</span> {form.email}</div>}
      <Field label="Role / title"><TextInput value={form.role} onChange={set('role')} placeholder="e.g. Parish Secretary" /></Field>
      <fieldset className="border-none p-0 m-0 flex flex-col gap-2.5">
        <legend className="font-semibold text-[13px] text-parish-ink mb-1.5">Access</legend>
        {/* Toggle buttons, one on at a time; what the chosen one allows is spelled out below. */}
        <div role="radiogroup" aria-label="Access" className="grid grid-cols-2 gap-2">
          {ACCESS_LEVELS.map((a) => {
            const on = form.access === a.key;
            const locked = form.isAdmin && a.key !== 'full';
            return (
              <button
                key={a.key}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={locked}
                onClick={() => setForm((f) => ({ ...f, access: a.key }))}
                className={`appearance-none flex items-center justify-center gap-1.5 min-h-[46px] px-3 py-2.5 rounded-xl border-[1.5px] text-[13.5px] font-semibold text-center leading-tight transition ${
                  on
                    ? 'bg-parish-fill border-transparent text-white shadow-btn'
                    : 'bg-parish-field border-parish-borderSoft text-parish-text2 hover:border-[var(--p-blue-border)]'
                } ${locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parish-blue`}
              >
                {on && <span aria-hidden>✓</span>}
                {a.label}
              </button>
            );
          })}
        </div>
        <div className="px-3.5 py-2.5 rounded-xl bg-parish-field border border-parish-line2 text-[13px] text-parish-text2 leading-relaxed">
          {ACCESS_LEVELS.find((a) => a.key === form.access)?.note}
          {form.isAdmin && <span className="block mt-1 text-parish-muted">Staff admins always have full access.</span>}
        </div>
        {form.access === 'gkk_leader' && (
          <Field label="GKK" required>
            <Select value={form.accessGkk || ''} onChange={set('accessGkk')}>
              <option value="">Choose the GKK…</option>
              {gkks.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>
        )}
      </fieldset>
      <label className="flex items-center gap-3 cursor-pointer select-none px-3.5 py-3 rounded-xl border border-parish-line2">
        <span className="flex-1 min-w-0 text-[13px] text-parish-text2 leading-relaxed">
          <strong className="block text-[13.5px] text-parish-navy">Staff admin</strong>
          Can add, reset and disable staff accounts, and set their access. Always full access.
        </span>
        <span className="relative inline-flex flex-none">
          <input type="checkbox" role="switch" aria-label="Staff admin" checked={form.isAdmin} onChange={set('isAdmin')} className="peer sr-only" />
          <span className="w-12 h-7 rounded-full bg-parish-sunk border border-parish-border transition peer-checked:bg-parish-fill peer-checked:border-transparent peer-focus-visible:ring-4 peer-focus-visible:ring-parish-blue/20" />
          <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </span>
      </label>
      <div className="flex gap-2.5 justify-end mt-1">
        <GhostButton type="button" onClick={onCancel} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
        <PrimaryButton type="submit" disabled={busy} className="px-5 py-2.5 text-[14px]">
          {busy ? 'Saving…' : isNew ? 'Create account' : 'Save changes'}
        </PrimaryButton>
      </div>
    </form>
  );
}

/** Shows a temporary password once, with a copy button. It is never stored. */
function PasswordReveal({ who, email, password, onDone }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Password copied');
    } catch {
      toast.error('Could not copy. Select the password and copy it by hand.');
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-parish-text2 m-0">
        Give this temporary password to <strong>{who}</strong> in person or by phone. They sign in with <strong>{email}</strong>,
        and are asked to choose their own password straight away.
      </p>
      <div className="flex items-center gap-2.5">
        <code className="flex-1 font-mono text-[20px] tracking-[.08em] text-parish-navy bg-parish-field border-[1.5px] border-parish-borderSoft rounded-xl px-3.5 py-2.5 select-all break-all" aria-label="Temporary password">{password}</code>
        <GhostButton type="button" onClick={copy} className="px-4 py-2.5 text-[13.5px]">Copy</GhostButton>
      </div>
      <p className="text-[12.5px] text-parish-warn m-0 font-semibold">This password won’t be shown again.</p>
      <div className="flex justify-end"><PrimaryButton onClick={onDone} className="px-6 py-2.5 text-[14px]">Done</PrimaryButton></div>
    </div>
  );
}

export default function ManageStaff() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const staff = useAsyncData(() => (user?.isAdmin ? api.staff.list() : Promise.resolve([])), [user?.isAdmin]);
  const [dialog, setDialog] = useState(null); // { kind: 'add' | 'edit' | 'password', … }
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [rowBusy, setRowBusy] = useState(null);
  const [gkks, setGkks] = useState([]);
  useEffect(() => { api.listGkks().then((r) => setGkks(r.rows.map((g) => g.name))).catch(() => {}); }, []);

  if (!user?.isAdmin) {
    return (
      <>
        <PageHeader title="Staff accounts" subtitle="Who can sign in to the admin panel" />
        <PageBody>
          <EmptyState title="Staff admins only" subtitle="Ask a staff admin if you need an account added, a password reset, or someone disabled." />
        </PageBody>
      </>
    );
  }

  const close = () => { setDialog(null); setFormError(''); };

  async function create(form) {
    setBusy(true);
    setFormError('');
    const password = generateTempPassword();
    try {
      await api.staff.create({ ...form, password });
      staff.reload();
      setDialog({ kind: 'password', who: form.name.trim(), email: form.email.trim().toLowerCase(), password });
    } catch (e) {
      setFormError(e.message || 'Could not create the account');
    } finally {
      setBusy(false);
    }
  }

  async function update(target, form) {
    setBusy(true);
    setFormError('');
    try {
      await api.staff.update(target.id, form);
      toast.success('Changes saved');
      close();
      staff.reload();
    } catch (e) {
      setFormError(e.message || 'Could not save the changes');
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(s) {
    const ok = await confirm({
      title: `Reset ${s.name || s.email}’s password?`,
      message: 'Their current password stops working right away. You’ll get a temporary password to give them.',
      confirmLabel: 'Reset password',
      tone: 'danger',
    });
    if (!ok) return;
    const password = generateTempPassword();
    setRowBusy(s.id);
    try {
      await api.staff.resetPassword(s.id, password);
      setDialog({ kind: 'password', who: s.name || s.email, email: s.email, password });
    } catch (e) {
      toast.error(e.message || 'Could not reset the password');
    } finally {
      setRowBusy(null);
    }
  }

  async function toggleDisabled(s) {
    const disabling = !s.disabled;
    if (disabling) {
      const ok = await confirm({
        title: `Disable ${s.name || s.email}?`,
        message: 'They won’t be able to sign in. If they’re signed in right now, their session ends within the hour. You can enable the account again at any time.',
        confirmLabel: 'Disable account',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setRowBusy(s.id);
    try {
      await api.staff.setDisabled(s.id, disabling);
      toast.success(disabling ? 'Account disabled' : 'Account enabled');
      staff.reload();
    } catch (e) {
      toast.error(e.message || 'Could not update the account');
    } finally {
      setRowBusy(null);
    }
  }

  const rows = staff.data || [];
  return (
    <>
      <PageHeader title="Staff accounts" subtitle="Who can sign in to the admin panel">
        <PrimaryButton onClick={() => setDialog({ kind: 'add' })} className="px-[18px] py-2.5 text-[13.5px] flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Add staff
        </PrimaryButton>
      </PageHeader>
      <PageBody>
        <div className="max-w-[920px]">
          <div className="mb-[18px] px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
            Choose each account's access: full, read only, one GKK, or the website and requests. Keep this list to people who need it, and disable accounts when someone leaves.
            New accounts and password resets get a temporary password for you to pass on.
          </div>
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 760 }}>
                <caption className="sr-only">Staff accounts</caption>
                <thead>
                  <tr className="bg-parish-sunk">
                    {['Name', 'Role', 'Last sign-in', 'Status'].map((h) => (
                      <th key={h} scope="col" className="text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2 whitespace-nowrap">{h}</th>
                    ))}
                    <th scope="col" className="text-right px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const isSelf = s.id === user.id;
                    return (
                      <tr key={s.id} className={`border-t border-parish-line ${s.disabled ? 'opacity-70' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[14.5px] text-parish-navy flex items-center gap-2 flex-wrap">
                            {s.name || <span className="text-parish-muted">No name</span>}
                            {s.is_admin && <Badge tone="gold">Admin</Badge>}
                            {s.access && s.access !== 'full' && <Badge tone="gray" title={s.access_gkk || undefined}>{accessLabel(s.access)}{s.access_gkk ? `: ${s.access_gkk}` : ''}</Badge>}
                            {isSelf && <Badge tone="blue">You</Badge>}
                          </div>
                          <div className="text-[12.5px] text-parish-muted">{s.email}</div>
                        </td>
                        <td className="px-4 py-3 text-[13.5px] text-parish-text2">{s.role || '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-parish-text2 whitespace-nowrap">{s.last_sign_in_at ? fmtDateTime(s.last_sign_in_at) : 'Never'}</td>
                        <td className="px-4 py-3">
                          {s.disabled
                            ? <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-parish-errorBg text-parish-error whitespace-nowrap">Disabled</span>
                            : <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-parish-okBg text-parish-okText whitespace-nowrap">Active</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end flex-wrap">
                            <button onClick={() => setDialog({ kind: 'edit', target: s })} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg">Edit</button>
                            <button onClick={() => resetPassword(s)} disabled={rowBusy === s.id} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap disabled:opacity-60">Reset password</button>
                            {!isSelf && (
                              <button
                                onClick={() => toggleDisabled(s)}
                                disabled={rowBusy === s.id}
                                className={`appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] rounded-lg disabled:opacity-60 ${s.disabled ? 'text-parish-okText bg-parish-okBg' : 'text-parish-error bg-parish-errorBg'}`}
                              >
                                {s.disabled ? 'Enable' : 'Disable'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {staff.loading && !staff.data && <LoadingState label="Loading staff accounts…" />}
            {staff.error && !staff.loading && <ErrorState message={staff.error} onRetry={staff.reload} />}
          </Panel>
        </div>
      </PageBody>

      {dialog?.kind === 'add' && (
        <Modal title="Add staff" onClose={close}>
          <StaffForm initial={EMPTY_FORM} isNew busy={busy} error={formError} gkks={gkks} onSubmit={create} onCancel={close} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title="Edit staff" onClose={close}>
          <StaffForm
            initial={{ name: dialog.target.name, email: dialog.target.email, role: dialog.target.role, isAdmin: dialog.target.is_admin, access: dialog.target.access || 'full', accessGkk: dialog.target.access_gkk || '' }}
            busy={busy} error={formError} gkks={gkks}
            onSubmit={(form) => update(dialog.target, form)} onCancel={close}
          />
        </Modal>
      )}
      {dialog?.kind === 'password' && (
        <Modal title="Temporary password" onClose={close}>
          <PasswordReveal who={dialog.who} email={dialog.email} password={dialog.password} onDone={close} />
        </Modal>
      )}
    </>
  );
}
