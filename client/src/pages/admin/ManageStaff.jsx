import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { PageHeader, PageBody, EmptyState, ErrorState, LoadingState, Panel, Modal, DataTable, Pagination, SearchInput, ActionMenu } from '../../components/admin.jsx';
import { Field, TextInput, Select, PrimaryButton, GhostButton, Badge, Spinner } from '../../components/ui.jsx';
import { useAsyncData, useUrlState } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { fmtDateTime, daysAgo } from '../../constants.js';
import { generateTempPassword } from '../../lib/util.js';
import { ACCESS_LEVELS, accessLabel } from '../../lib/access.js';
import { searchAndPage } from '../../lib/paging.js';
import { downloadCsv } from '../../lib/csv.js';
import {
  LEADER_ROLE, STAFF_FILTERS, STAFF_FILTER_KEYS, STAFF_SORTS, STAFF_CSV_COLUMNS,
  filterCounts, filterStaff, staffText, sortStaff, gkkCoverage, bulkLeaderEntries,
} from '../../lib/staff.js';

const DEFAULT_ROLE = 'Parish Staff';
const EMPTY_FORM = { name: '', email: '', role: DEFAULT_ROLE, isAdmin: false, access: 'full', accessGkkId: '' };
/** A new GKK leader's form, for `gkk` ({ id, name }) when it's known. */
const leaderForm = (gkk) => ({ ...EMPTY_FORM, role: LEADER_ROLE, access: 'gkk_leader', accessGkkId: gkk ? String(gkk.id) : '' });

const URL_DEFAULTS = { show: 'all', q: '', sort: 'name', dir: 'asc', page: 1, size: 20 };
const URL_ALLOWED = { show: STAFF_FILTER_KEYS, sort: STAFF_SORTS, dir: ['asc', 'desc'], size: [10, 20, 50] };

/** Add or edit form. Email is fixed once an account exists. */
function StaffForm({ initial, isNew, busy, error, gkks, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => setForm((f) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    // Staff admins always have full access.
    if (key === 'isAdmin' && value) return { ...f, isAdmin: true, access: 'full' };
    return { ...f, [key]: value };
  });
  const setAccess = (access) => setForm((f) => {
    // A GKK leader is a census coordinator, unless a role was typed.
    const role = access === 'gkk_leader' && (!f.role || f.role === DEFAULT_ROLE) ? LEADER_ROLE : f.role;
    return { ...f, access, role };
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
                onClick={() => setAccess(a.key)}
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
            <Select value={form.accessGkkId || ''} onChange={set('accessGkkId')}>
              <option value="">Choose the GKK…</option>
              {gkks.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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

/**
 * One sheet for several census coordinators at once: a row per GKK that has
 * none, with a name and an email to fill in. Rows left blank are skipped.
 * Each filled row becomes a GKK leader's account with its own temporary
 * password, all shown together at the end (they're never shown again).
 */
function BulkLeaders({ gkks, onClose, onCreated }) {
  const toast = useToast();
  const [sheet, setSheet] = useState(() => gkks.map((gkk) => ({ gkk, name: '', email: '' })));
  const [errors, setErrors] = useState(new Map());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null); // [{ gkk, name, email, password } | { gkk, name, email, error }]
  const set = (i, key) => (e) => setSheet((s) => s.map((r, j) => (j === i ? { ...r, [key]: e.target.value } : r)));
  const filled = sheet.filter((r) => r.name.trim() || r.email.trim()).length;

  async function submit(e) {
    e.preventDefault();
    const { entries, errors: bad } = bulkLeaderEntries(sheet);
    setErrors(bad);
    if (bad.size || !entries.length) {
      if (!entries.length && !bad.size) toast.error('Fill in a name and email for at least one GKK');
      return;
    }
    setBusy(true);
    const out = [];
    for (const { gkk, name, email } of entries) {
      const password = generateTempPassword();
      try {
        await api.staff.create({ name, email, role: LEADER_ROLE, isAdmin: false, access: 'gkk_leader', accessGkkId: gkk.id, password });
        out.push({ gkk, name, email, password });
      } catch (err) {
        out.push({ gkk, name, email, error: err.message || 'Could not create the account' });
      }
    }
    setBusy(false);
    setResults(out);
    onCreated();
  }

  if (results) {
    const made = results.filter((r) => r.password);
    const failed = results.filter((r) => r.error);
    const lines = made.map((r) => `${r.gkk.name}\t${r.name}\t${r.email}\t${r.password}`).join('\n');
    async function copy() {
      try {
        await navigator.clipboard.writeText(`GKK\tName\tEmail\tTemporary password\n${lines}`);
        toast.success('Copied: paste it into a spreadsheet');
      } catch {
        toast.error('Could not copy. Select the passwords and copy them by hand.');
      }
    }
    return (
      <div className="flex flex-col gap-4">
        {made.length > 0 && (
          <>
            <p className="text-[14px] text-parish-text2 m-0">
              {made.length} account{made.length === 1 ? '' : 's'} created. Give each coordinator their temporary password in person or by phone; they sign in with their email and
              are asked to choose their own password straight away.
            </p>
            <div className="overflow-x-auto border border-parish-line2 rounded-xl">
              <table className="w-full border-collapse text-[13.5px]" style={{ minWidth: 560 }}>
                <thead><tr className="bg-parish-sunk text-left text-[12px] uppercase tracking-wide text-parish-text2"><th className="px-3 py-2">GKK</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Password</th></tr></thead>
                <tbody>
                  {made.map((r) => (
                    <tr key={r.gkk.id} className="border-t border-parish-line">
                      <td className="px-3 py-2 text-parish-navy font-semibold">{r.gkk.name}</td>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 break-all">{r.email}</td>
                      <td className="px-3 py-2"><code className="font-mono tracking-[.06em] select-all">{r.password}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12.5px] text-parish-warn m-0 font-semibold">These passwords won’t be shown again.</p>
          </>
        )}
        {failed.length > 0 && (
          <div role="alert" className="px-4 py-3 rounded-xl border border-parish-warnBorder bg-parish-warnBg text-[13.5px] text-parish-warnStrong">
            <strong>{failed.length} could not be created:</strong>
            <ul className="m-0 mt-1 pl-5">{failed.map((r) => <li key={r.gkk.id}>{r.gkk.name}: {r.name} ({r.email}), {r.error}</li>)}</ul>
            Open “Add several leaders” again to retry those.
          </div>
        )}
        <div className="flex gap-2.5 justify-end">
          {made.length > 0 && <GhostButton type="button" onClick={copy} className="px-4 py-2.5 text-[13.5px]">Copy all</GhostButton>}
          <PrimaryButton type="button" onClick={onClose} className="px-6 py-2.5 text-[14px]">Done</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-[13.5px] text-parish-text2 m-0">
        These GKKs have no census coordinator yet. Fill in a name and email for each one you're setting up now and leave the rest blank.
        Each account is a GKK leader for that GKK, with a temporary password shown at the end.
      </p>
      <div className="max-h-[52vh] overflow-auto border border-parish-line2 rounded-xl">
        <div className="hidden sm:grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-3 py-2 bg-parish-sunk sticky top-0 text-[12px] font-bold uppercase tracking-wide text-parish-text2">
          <span>GKK</span><span>Name</span><span>Email</span>
        </div>
        {sheet.map((r, i) => (
          <div key={r.gkk.id} className="px-3 py-2 border-t first:border-t-0 border-parish-line">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3 sm:items-center">
              <span className="text-[13.5px] font-semibold text-parish-navy">{r.gkk.name}</span>
              <TextInput value={r.name} onChange={set(i, 'name')} placeholder="Name" aria-label={`Name for ${r.gkk.name}`} className="!py-2" />
              <TextInput type="email" value={r.email} onChange={set(i, 'email')} placeholder="Email" autoComplete="off" aria-label={`Email for ${r.gkk.name}`} className="!py-2" />
            </div>
            {errors.get(r.gkk.id) && <div role="alert" className="mt-1 text-[12.5px] font-medium text-parish-error">{errors.get(r.gkk.id)}</div>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2.5 justify-end">
        <span className="mr-auto text-[13px] text-parish-muted">{filled ? `${filled} to create` : 'Nothing filled in yet'}</span>
        <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
        <PrimaryButton type="submit" disabled={busy || !filled} className="px-5 py-2.5 text-[14px] flex items-center gap-2">
          {busy ? <><Spinner />Creating…</> : filled === 1 ? 'Create 1 account' : filled ? `Create ${filled} accounts` : 'Create accounts'}
        </PrimaryButton>
      </div>
    </form>
  );
}

/** The account's access level, with a GKK leader's GKK (and any other leaders of it) beneath. */
function AccessLines({ s, others }) {
  return (
    <>
      <div className="text-[13.5px] text-parish-text2">{accessLabel(s.access)}</div>
      {s.access === 'gkk_leader' && (
        <div className="text-[12.5px] font-semibold text-parish-navy">
          {s.access_gkk || <span className="text-parish-error">No GKK</span>}
          {others > 0 && <span className="font-normal text-parish-muted"> · {others} other leader{others === 1 ? '' : 's'}</span>}
        </div>
      )}
    </>
  );
}

/** When they last signed in, or that they never have (`inline`: on one line, for a phone). */
function LastSignIn({ s, inline = false }) {
  if (!s.last_sign_in_at) {
    return <span className="font-semibold text-[#c2410c]" title="They haven't signed in yet. Reset the password to give them a new temporary one.">Never signed in</span>;
  }
  return inline
    ? <>Last sign-in {fmtDateTime(s.last_sign_in_at)} ({daysAgo(s.last_sign_in_at)})</>
    : <>{fmtDateTime(s.last_sign_in_at)}<div className="text-[12px] text-parish-muted">{daysAgo(s.last_sign_in_at)}</div></>;
}

function StatusPill({ s }) {
  const [text, tone] = s.disabled ? ['Disabled', 'bg-parish-errorBg text-parish-error']
    : s.access === 'none' ? ['Waiting for access', 'bg-parish-warnBg text-parish-warnStrong']
      : ['Active', 'bg-parish-okBg text-parish-okText'];
  return <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-none ${tone}`}>{text}</span>;
}

/** The census coordinators' coverage: how many GKKs have one, and the GKKs still without. */
function Coverage({ coverage, total, onAdd, onBulk }) {
  const [open, setOpen] = useState(false);
  const { covered, uncovered } = coverage;
  if (!total) return null;
  const pct = Math.round((covered / total) * 100);
  return (
    <Panel className="px-5 py-4 mb-4">
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-[15px] text-parish-navy">Census coordinators</div>
          <div className="text-[13px] text-parish-text2">
            {uncovered.length
              ? <><strong>{covered}</strong> of {total} GKKs have a coordinator; <strong>{uncovered.length}</strong> still need one.</>
              : <>Every one of the {total} GKKs has a coordinator.</>}
          </div>
        </div>
        <div className="flex-1 min-w-[140px] max-w-[320px]" role="img" aria-label={`${covered} of ${total} GKKs covered`}>
          <div className="h-2 rounded-full bg-parish-sunk overflow-hidden"><div className="h-full rounded-full bg-parish-fill" style={{ width: `${pct}%` }} /></div>
        </div>
        {uncovered.length > 0 && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <GhostButton type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="px-3.5 py-2 text-[13px]">{open ? 'Hide' : 'Show'} the {uncovered.length} without one</GhostButton>
            <PrimaryButton type="button" onClick={onBulk} className="px-3.5 py-2 text-[13px]">Add several leaders</PrimaryButton>
          </div>
        )}
      </div>
      {open && uncovered.length > 0 && (
        <ul className="list-none m-0 mt-3 p-0 flex flex-wrap gap-2">
          {uncovered.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => onAdd(g)} title={`Add a coordinator for ${g.name}`} className="appearance-none cursor-pointer px-3 py-1.5 rounded-full border border-parish-borderSoft bg-parish-card text-[12.5px] font-semibold text-parish-text2 hover:border-parish-blue hover:text-parish-blue">
                + {g.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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
  useEffect(() => { api.gkkChoices().then(setGkks).catch(() => {}); }, []);
  // Filter, search, sort and page live in the address bar, like the other lists.
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const all = useMemo(() => staff.data || [], [staff.data]);
  const counts = useMemo(() => filterCounts(all), [all]);
  const coverage = useMemo(() => gkkCoverage(all, gkks), [all, gkks]);
  const view = useMemo(() => {
    const sorted = sortStaff(filterStaff(all, url.show), url.sort, url.dir);
    const search = { query: url.q, toText: staffText };
    // `everything`: every match, not just this page, for the export.
    return { ...searchAndPage(sorted, { ...search, page: url.page, pageSize: url.size }), everything: searchAndPage(sorted, { ...search, pageSize: sorted.length || 1 }).rows };
  }, [all, url]);

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

  const rows = view.rows;
  const people = all.length;
  const leaders = counts.gkk_leader;
  const sortBy = (key) => () => setUrl(url.sort === key ? { dir: url.dir === 'asc' ? 'desc' : 'asc' } : { sort: key, dir: 'asc' });
  const arrow = (key) => (url.sort === key ? (url.dir === 'asc' ? '↑' : '↓') : '');
  const filtered = url.show !== 'all' || !!url.q;
  const addLeader = (gkk) => setDialog({ kind: 'add', initial: leaderForm(gkk) });
  const othersOf = (s) => (s.access === 'gkk_leader' && !s.disabled ? (coverage.leaders.get(s.access_gkk_id) || []).length - 1 : 0);
  // Edit and the "⋯" menu, in the table and on the phone's cards.
  const actionsOf = (s, isSelf) => (
    <div className="flex gap-2 justify-end items-center">
      {rowBusy === s.id && <span role="status" className="inline-flex"><Spinner tone="blue" /><span className="sr-only">Working…</span></span>}
      <button onClick={() => setDialog({ kind: 'edit', target: s })} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg">Edit</button>
      <ActionMenu
        label={`More for ${s.name || s.email}`}
        items={[
          { label: 'Reset password', onClick: () => resetPassword(s) },
          !isSelf && { label: s.disabled ? 'Enable account' : 'Disable account', tone: s.disabled ? undefined : 'danger', onClick: () => toggleDisabled(s) },
        ]}
      />
    </div>
  );

  return (
    <>
      <PageHeader title="Staff accounts" subtitle={people ? `${people} account${people === 1 ? '' : 's'}${leaders ? `, ${leaders} GKK leader${leaders === 1 ? '' : 's'} (census coordinators)` : ''}` : 'Who can sign in to the admin panel'}>
        {people > 0 && <GhostButton onClick={() => downloadCsv('staff-accounts.csv', view.everything, STAFF_CSV_COLUMNS)} className="px-[18px] py-2.5 text-[13.5px]">Export list</GhostButton>}
        {coverage.uncovered.length > 0 && <GhostButton onClick={() => setDialog({ kind: 'bulk' })} className="px-[18px] py-2.5 text-[13.5px]">Add several leaders</GhostButton>}
        <PrimaryButton onClick={() => setDialog({ kind: 'add', initial: EMPTY_FORM })} className="px-[18px] py-2.5 text-[13.5px] flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          Add staff
        </PrimaryButton>
      </PageHeader>
      <PageBody>
        <div className="mb-4 px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
          Choose each account's access: full, read only, one GKK (a census coordinator), or the website and requests. Keep this list to people who need it, and disable accounts when someone leaves.
          New accounts and password resets get a temporary password for you to pass on.
        </div>

        <Coverage coverage={coverage} total={gkks.length} onAdd={addLeader} onBulk={() => setDialog({ kind: 'bulk' })} />

        {people > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 mb-3.5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter the accounts">
              {STAFF_FILTERS.map(([key, label]) => {
                const n = counts[key];
                const on = url.show === key;
                // Only the filters with someone in them, and the one in use.
                if (key !== 'all' && !n && !on) return null;
                return (
                  <button
                    key={key} type="button" aria-pressed={on} onClick={() => setUrl({ show: on && key !== 'all' ? 'all' : key })}
                    className={`appearance-none cursor-pointer px-3 py-1.5 rounded-full border text-[12.5px] font-semibold transition-colors ${on ? 'border-transparent bg-parish-fill text-white' : 'border-parish-borderSoft bg-parish-card text-parish-text2'}`}
                  >
                    {label} <span className={on ? 'opacity-80' : 'text-parish-muted'}>{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="ml-auto w-full sm:w-auto">
              <SearchInput placeholder="Search name, email, role or GKK…" aria-label="Search staff accounts" value={url.q} onChange={(e) => setUrl({ q: e.target.value })} />
            </div>
          </div>
        )}

        <DataTable
          minWidth={980}
          mobile={(
            <ul className="list-none m-0 p-0">
              {rows.map((s) => (
                <li key={s.id} className={`border-t first:border-t-0 border-parish-line px-4 py-3 flex flex-col gap-1.5 ${s.disabled ? 'opacity-70' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-[14.5px] text-parish-navy flex items-center gap-2 flex-wrap">
                        {s.name || <span className="text-parish-muted">No name</span>}
                        {s.is_admin && <Badge tone="gold">Admin</Badge>}
                        {s.id === user.id && <Badge tone="blue">You</Badge>}
                      </div>
                      <div className="text-[12.5px] text-parish-muted break-all">{s.email}</div>
                    </div>
                    <StatusPill s={s} />
                  </div>
                  <AccessLines s={s} others={othersOf(s)} />
                  <div className="text-[12.5px] text-parish-text2"><LastSignIn s={s} inline /></div>
                  {actionsOf(s, s.id === user.id)}
                </li>
              ))}
            </ul>
          )}
          columns={[
            { label: 'Name', onSort: sortBy('name'), arrow: arrow('name') },
            { label: 'Access', onSort: sortBy('access'), arrow: arrow('access') },
            { label: 'Role' },
            { label: 'Last sign-in', onSort: sortBy('last'), arrow: arrow('last') },
            { label: 'Status', onSort: sortBy('status'), arrow: arrow('status') },
            { label: 'Actions', align: 'right' },
          ]}
          footer={(
            <>
              {staff.loading && !staff.data && <LoadingState label="Loading staff accounts…" />}
              {staff.error && !staff.loading && <ErrorState message={staff.error} onRetry={staff.reload} />}
              {!staff.loading && !staff.error && !rows.length && (
                filtered
                  ? <EmptyState title="No accounts found" subtitle="Try another filter or search." />
                  : <EmptyState title="No staff accounts yet" subtitle="Add the first one with “Add staff”." />
              )}
              <Pagination page={view.page} pageSize={url.size} total={view.total} onPage={(page) => setUrl({ page })} onPageSize={(size) => setUrl({ size })} />
            </>
          )}
        >
          {rows.map((s) => {
            const isSelf = s.id === user.id;
            const others = othersOf(s);
            return (
              <tr key={s.id} className={`border-t border-parish-line ${s.disabled ? 'opacity-70' : ''}`}>
                <td className="px-4 py-3">
                  <div className="font-semibold text-[14.5px] text-parish-navy flex items-center gap-2 flex-wrap">
                    {s.name || <span className="text-parish-muted">No name</span>}
                    {s.is_admin && <Badge tone="gold">Admin</Badge>}
                    {isSelf && <Badge tone="blue">You</Badge>}
                  </div>
                  <div className="text-[12.5px] text-parish-muted break-all">{s.email}</div>
                </td>
                <td className="px-4 py-3"><AccessLines s={s} others={others} /></td>
                <td className="px-4 py-3 text-[13.5px] text-parish-text2">{s.role || '—'}</td>
                <td className="px-4 py-3 text-[13px] text-parish-text2 whitespace-nowrap"><LastSignIn s={s} /></td>
                <td className="px-4 py-3"><StatusPill s={s} /></td>
                <td className="px-4 py-3">{actionsOf(s, isSelf)}</td>
              </tr>
            );
          })}
        </DataTable>
      </PageBody>

      {dialog?.kind === 'add' && (
        <Modal title="Add staff" onClose={close}>
          <StaffForm initial={dialog.initial || EMPTY_FORM} isNew busy={busy} error={formError} gkks={gkks} onSubmit={create} onCancel={close} />
        </Modal>
      )}
      {dialog?.kind === 'bulk' && (
        <Modal title="Add several GKK leaders" onClose={close} maxWidth={860}>
          <BulkLeaders gkks={coverage.uncovered} onClose={close} onCreated={staff.reload} />
        </Modal>
      )}
      {dialog?.kind === 'edit' && (
        <Modal title="Edit staff" onClose={close}>
          <StaffForm
            initial={{ name: dialog.target.name, email: dialog.target.email, role: dialog.target.role, isAdmin: dialog.target.is_admin, access: dialog.target.access || 'none', accessGkkId: dialog.target.access_gkk_id || '' }}
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
