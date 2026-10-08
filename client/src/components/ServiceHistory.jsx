import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { GKK_ROLES } from '../constants.js';
import { SERVICE_KINDS, serviceKindLabel, yearsText, sortService, serviceError, toYear, MIN_YEAR, MAX_YEAR } from '../lib/service.js';
import { Field, TextInput, Select, OptionSelect, ComboInput, PrimaryButton, GhostButton, Badge } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

const BLANK = { kind: 'ministry', name: '', from_year: '', to_year: '', notes: '' };

/**
 * A member's past service (0071): a former Kaabag, CFC member, PPC officer….
 * Entries are saved straight away, apart from the member's "Save changes";
 * taking a ministry, organization or responsibility off the member adds one
 * automatically when that's saved.
 */
export default function ServiceHistory({ memberId, canEdit, ministryList, orgList, parishRoleList }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState(undefined); // undefined loading, null before the migration
  const [editing, setEditing] = useState(null); // 'new' or an entry's id
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRows(undefined);
    setEditing(null);
    api.listMemberService(memberId).then(setRows).catch(() => setRows([]));
  }, [memberId]);

  if (rows === undefined) return <div className="mb-5 text-[13px] text-parish-muted">Loading…</div>;
  if (rows === null) {
    return <div className="mb-5 text-[13px] text-parish-muted">Run the 0071_member_service_history.sql migration in Supabase to keep this member's service history.</div>;
  }

  function open(row) {
    setError('');
    if (row) {
      setEditing(row.id);
      setForm({ kind: row.kind, name: row.name, from_year: row.from_year ?? '', to_year: row.to_year ?? '', notes: row.notes || '' });
    } else {
      setEditing('new');
      setForm(BLANK);
    }
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value, ...(field === 'kind' ? { name: '' } : {}) }));

  async function save() {
    const problem = serviceError(form);
    if (problem) { setError(problem); return; }
    const fields = {
      kind: form.kind, name: form.name.trim(),
      from_year: toYear(form.from_year), to_year: toYear(form.to_year),
      notes: form.notes.trim() || null,
    };
    setBusy(true);
    try {
      if (editing === 'new') {
        const added = await api.addMemberService({ ...fields, member_id: memberId });
        setRows((r) => [...r, added]);
      } else {
        const updated = await api.updateMemberService(editing, fields);
        setRows((r) => r.map((x) => (x.id === editing ? updated : x)));
      }
      toast.success('Service history saved');
      setEditing(null);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    const ok = await confirm({
      title: `Remove ${row.name}?`,
      message: 'This takes it off the member’s service history.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteMemberService(row.id);
      setRows((r) => r.filter((x) => x.id !== row.id));
      if (editing === row.id) setEditing(null);
      toast.success(`${row.name} removed from the service history`);
    } catch (e) {
      toast.error(e.message || 'Could not remove');
    }
  }

  const nameOptions = { ministry: ministryList, organization: orgList, parish: parishRoleList }[form.kind];
  const formBox = (
    <div className="border border-parish-edge rounded-xl px-3.5 py-3 bg-parish-field">
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        <Field label="Kind">
          <Select value={form.kind} onChange={(e) => set('kind', e.target.value)}>
            {SERVICE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </Select>
        </Field>
        <Field label="Served in">
          {form.kind === 'gkk'
            ? <ComboInput placeholder="Pick or type a role" options={GKK_ROLES} value={form.name} onChange={(v) => set('name', v)} />
            : <OptionSelect options={nameOptions || []} value={form.name} onChange={(v) => set('name', v)} />}
        </Field>
        <Field label="From year"><TextInput type="number" inputMode="numeric" min={MIN_YEAR} max={MAX_YEAR} placeholder="e.g. 2015" value={form.from_year} onChange={(e) => set('from_year', e.target.value)} /></Field>
        <Field label="To year"><TextInput type="number" inputMode="numeric" min={MIN_YEAR} max={MAX_YEAR} placeholder="e.g. 2019" value={form.to_year} onChange={(e) => set('to_year', e.target.value)} /></Field>
      </div>
      <div className="mt-2.5">
        <Field label="Notes"><TextInput placeholder="Optional" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
      {error && <div className="mt-2 text-parish-error text-[12.5px] font-medium">{error}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <GhostButton onClick={() => setEditing(null)} disabled={busy} className="px-4 py-2 text-[13px]">Cancel</GhostButton>
        <PrimaryButton onClick={save} disabled={busy} className="px-4 py-2 text-[13px]">{busy ? 'Saving…' : 'Save entry'}</PrimaryButton>
      </div>
    </div>
  );

  const sorted = sortService(rows);
  return (
    <div className="mb-5">
      {sorted.length === 0 && editing !== 'new' && (
        <div className="text-[13px] text-parish-muted mb-2">
          No past service recorded. Taking a ministry, organization or responsibility off this member records it here.
        </div>
      )}
      {sorted.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-1.5 mb-2">
          {sorted.map((r) => (editing === r.id ? <li key={r.id}>{formBox}</li> : (
            <li key={r.id} className="text-[13px] text-parish-text3 bg-parish-field border border-parish-line2 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-parish-navy">{r.name}</span>
                <Badge tone="gray">{serviceKindLabel(r.kind)}</Badge>
                {yearsText(r) && <span className="text-parish-text2">{yearsText(r)}</span>}
                {canEdit && (
                  <span className="ml-auto flex gap-3">
                    <button type="button" onClick={() => open(r)} className="appearance-none border-none bg-transparent cursor-pointer text-parish-blue font-semibold text-[12.5px] p-0">Edit</button>
                    <button type="button" onClick={() => remove(r)} className="appearance-none border-none bg-transparent cursor-pointer text-parish-error font-semibold text-[12.5px] p-0">Remove</button>
                  </span>
                )}
              </div>
              {r.notes && <div className="text-[12.5px] text-parish-muted mt-0.5">{r.notes}</div>}
              {r.source === 'auto' && <div className="text-[11.5px] text-parish-muted mt-0.5">Recorded when it was taken off this member</div>}
            </li>
          )))}
        </ul>
      )}
      {editing === 'new' && formBox}
      {canEdit && editing === null && (
        <GhostButton onClick={() => open(null)} className="px-4 py-2 text-[13px]">+ Add past service</GhostButton>
      )}
    </div>
  );
}
