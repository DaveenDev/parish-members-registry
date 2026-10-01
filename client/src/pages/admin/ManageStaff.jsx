import React, { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { PageHeader, PageBody, EmptyState, ErrorState, LoadingState, Panel, Modal } from '../../components/admin.jsx';
import { Field, TextInput, Checkbox, PrimaryButton, GhostButton, Badge } from '../../components/ui.jsx';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { fmtDateTime } from '../../constants.js';
import { generateTempPassword } from '../../lib/util.js';

const EMPTY_FORM = { name: '', email: '', role: 'Parish Staff', isAdmin: false };

/** Add or edit form. Email is fixed once an account exists. */
function StaffForm({ initial, isNew, busy, error, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="flex flex-col gap-4">
      {error && <div className="text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
      <Field label="Name" required><TextInput value={form.name} onChange={set('name')} autoFocus /></Field>
      {isNew
        ? <Field label="Email" required><TextInput type="email" value={form.email} onChange={set('email')} autoComplete="off" /></Field>
        : <div className="text-[13.5px] text-parish-text2"><span className="font-semibold">Email:</span> {form.email}</div>}
      <Field label="Role / title"><TextInput value={form.role} onChange={set('role')} placeholder="e.g. Parish Secretary" /></Field>
      <label className="flex items-start gap-2.5 cursor-pointer text-[13.5px] text-parish-text2">
        <Checkbox checked={form.isAdmin} onChange={set('isAdmin')} className="mt-0.5" />
        <span><strong className="text-parish-navy">Staff admin</strong>: can add, reset and disable staff accounts.</span>
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
        then change it under <strong>Parish Config → Change password</strong>.
      </p>
      <div className="flex items-center gap-2.5">
        <code className="flex-1 font-mono text-[20px] tracking-[.08em] text-parish-navy bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-xl px-3.5 py-2.5 select-all break-all" aria-label="Temporary password">{password}</code>
        <GhostButton type="button" onClick={copy} className="px-4 py-2.5 text-[13.5px]">Copy</GhostButton>
      </div>
      <p className="text-[12.5px] text-[#a1762b] m-0 font-semibold">This password won’t be shown again.</p>
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
          <div className="mb-[18px] px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-xl text-[13.5px] text-[#2b466f] leading-relaxed">
            Every staff account can see and change all registry records. Keep this list to people who need it, and disable accounts when someone leaves.
            New accounts and password resets get a temporary password for you to pass on.
          </div>
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ minWidth: 760 }}>
                <caption className="sr-only">Staff accounts</caption>
                <thead>
                  <tr className="bg-[#f4efe3]">
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
                      <tr key={s.id} className={`border-t border-[#f1e8d5] ${s.disabled ? 'opacity-70' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[14.5px] text-parish-navy flex items-center gap-2 flex-wrap">
                            {s.name || <span className="text-parish-muted">No name</span>}
                            {s.is_admin && <Badge tone="gold">Admin</Badge>}
                            {isSelf && <Badge tone="blue">You</Badge>}
                          </div>
                          <div className="text-[12.5px] text-parish-muted">{s.email}</div>
                        </td>
                        <td className="px-4 py-3 text-[13.5px] text-parish-text2">{s.role || '—'}</td>
                        <td className="px-4 py-3 text-[13px] text-parish-text2 whitespace-nowrap">{s.last_sign_in_at ? fmtDateTime(s.last_sign_in_at) : 'Never'}</td>
                        <td className="px-4 py-3">
                          {s.disabled
                            ? <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-parish-errorBg text-parish-error whitespace-nowrap">Disabled</span>
                            : <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-[#eaf4ee] text-[#2f7a52] whitespace-nowrap">Active</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 justify-end flex-wrap">
                            <button onClick={() => setDialog({ kind: 'edit', target: s })} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-[#f4efe3] rounded-lg">Edit</button>
                            <button onClick={() => resetPassword(s)} disabled={rowBusy === s.id} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap disabled:opacity-60">Reset password</button>
                            {!isSelf && (
                              <button
                                onClick={() => toggleDisabled(s)}
                                disabled={rowBusy === s.id}
                                className={`appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] rounded-lg disabled:opacity-60 ${s.disabled ? 'text-[#2f7a52] bg-[#eaf4ee]' : 'text-parish-error bg-parish-errorBg'}`}
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
          <StaffForm initial={EMPTY_FORM} isNew busy={busy} error={formError} onSubmit={create} onCancel={close} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title="Edit staff" onClose={close}>
          <StaffForm
            initial={{ name: dialog.target.name, email: dialog.target.email, role: dialog.target.role, isAdmin: dialog.target.is_admin }}
            busy={busy} error={formError}
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
