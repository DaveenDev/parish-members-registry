import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SearchInput, Pagination, ErrorState, LoadingState, Panel } from './admin.jsx';
import { useClientList } from '../hooks.js';
import { Field, TextInput } from './ui.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from '../ToastContext.jsx';
import { AddButton, RowButton, SidePanel } from './panels.jsx';

const THIS_YEAR = new Date().getFullYear();
const EMPTY = { name: '', chapel_address: '', puroks: '', year_established: '' };

/**
 * The parish's GKKs with their chapel details (shown and searched in the
 * website's GKK directory). Add and Edit open a side panel. A GKK assigned
 * to a household can't be deleted, matching the database's delete guard.
 */
export function GkkManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // null, or { id?, original?, ...EMPTY }
  const confirm = useConfirm();
  const toast = useToast();
  const list = useClientList(rows, (r) => `${r.name} ${r.chapel_address || ''} ${r.puroks || ''}`);

  function reload() {
    setLoadError('');
    // Household counts come from the name list; the details from the gkks rows.
    Promise.all([api.listGkks(), api.listGkkDetails()])
      .then(([counts, details]) => {
        const n = Object.fromEntries(counts.rows.map((r) => [r.name, r.count]));
        setRows(details.rows.map((g) => ({ ...g, count: n[g.name] || 0 })));
      })
      .catch((e) => setLoadError(e.message || 'Could not load the GKKs'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function remove(g) {
    const ok = await confirm({
      title: `Delete “${g.name}”?`,
      message: "This removes the GKK and its chapel details. It can't be undone, but you can add it again later.",
      confirmLabel: 'Delete GKK',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteGkk(g.name);
      toast.success(`${g.name} deleted`);
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not delete this GKK');
    }
  }

  const open = (g) => setEditing(g
    ? { id: g.id, original: g.name, name: g.name, chapel_address: g.chapel_address || '', puroks: g.puroks || '', year_established: g.year_established ?? '' }
    : { ...EMPTY });

  return (
    <Panel className="p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-[18px]">
        <div className="min-w-0 max-w-[480px]">
          <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Basic Ecclesial Communities (GKK)</div>
          <div className="text-[13.5px] text-parish-muted">Each GKK's chapel, puroks and year established show in the website's GKK directory. A GKK assigned to a household can't be deleted.</div>
        </div>
        <AddButton onClick={() => open(null)}>Add GKK</AddButton>
      </div>

      {rows.length > 0 && (
        <div className="mb-3">
          <SearchInput placeholder="Search GKKs, chapels or puroks…" aria-label="Search GKKs" value={list.query} onChange={(e) => list.setQuery(e.target.value)} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {list.rows.map((g) => {
          const info = [g.chapel_address && `Chapel: ${g.chapel_address}`, g.puroks, g.year_established && `Est. ${g.year_established}`].filter(Boolean).join(' · ');
          return (
            <div key={g.id} className="flex items-center gap-2.5 border border-parish-line2 rounded-xl px-3.5 py-2.5 bg-parish-field">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14.5px] text-parish-navy">{g.name}</div>
                <div className="text-[12.5px] text-parish-text2 truncate">{info || <span className="text-parish-faint">No chapel details yet</span>}</div>
              </div>
              <span className="font-semibold text-[12px] text-parish-muted whitespace-nowrap">{g.count} household(s)</span>
              <RowButton onClick={() => open(g)} className="px-3.5 py-2">Edit</RowButton>
              <RowButton
                tone="red"
                onClick={() => remove(g)}
                disabled={g.count > 0}
                title={g.count > 0 ? `In use by ${g.count} household(s), so it can't be deleted. Move them to another GKK first.` : undefined}
                className="px-3.5 py-2 disabled:!opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </RowButton>
            </div>
          );
        })}
        {loading && <LoadingState label="Loading…" />}
        {!loading && loadError && <ErrorState message={loadError} onRetry={reload} />}
        {!loading && !loadError && !rows.length && <div className="text-[13.5px] text-parish-muted">No GKKs yet. Add the first one.</div>}
        {!!rows.length && !list.total && <div className="text-[13.5px] text-parish-muted">No GKK matches “{list.query}”.</div>}
      </div>
      <div className="-mx-6 -mb-6 mt-4">
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} />
      </div>

      {editing && <GkkPanel initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </Panel>
  );
}

/** Add or edit one GKK: its name and chapel details. */
function GkkPanel({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isNew = !initial.id;
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  async function save() {
    const name = form.name.trim();
    const year = String(form.year_established ?? '').trim();
    if (!name) { setError('Enter the GKK name.'); return; }
    if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1500 && Number(year) <= THIS_YEAR)) {
      setError(`Enter the year established as four digits, up to ${THIS_YEAR}.`);
      return;
    }
    const details = { chapel_address: form.chapel_address, puroks: form.puroks, year_established: year ? Number(year) : null };
    setSaving(true);
    try {
      if (isNew) {
        await api.createGkk(name, details);
      } else {
        // rename_gkk also moves the households on the old name.
        if (name !== initial.original) await api.renameGkk(initial.original, name);
        await api.saveGkkDetails(initial.id, details);
      }
      toast.success(isNew ? `${name} added` : `${name} saved`);
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save this GKK');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title={isNew ? 'Add GKK' : initial.original}
      subtitle={isNew ? 'A new Basic Ecclesial Community and its chapel' : 'Edit the GKK and its chapel details'}
      onClose={onClose}
      onSave={save}
      saving={saving}
      saveLabel={isNew ? 'Add GKK' : 'Save changes'}
      error={error}
    >
      <Field label="GKK name" required>
        <TextInput autoFocus value={form.name} placeholder="e.g. GKK San Pedro Calungsod -Poblacion" onChange={set('name')} />
      </Field>
      <Field label="Chapel address">
        <TextInput value={form.chapel_address} placeholder="e.g. Purok 3, Brgy. San Isidro" onChange={set('chapel_address')} />
      </Field>
      <Field label="Puroks / sitios covered">
        <TextInput value={form.puroks} placeholder="e.g. Purok 1, 2 and 3" onChange={set('puroks')} />
      </Field>
      <Field label="Year established">
        <TextInput inputMode="numeric" maxLength={4} value={form.year_established} placeholder="e.g. 1985" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, year_established: e.target.value.replace(/\D/g, '') })); setError(''); }} />
      </Field>
      {!isNew && initial.name !== form.name.trim() && form.name.trim() && (
        <div className="text-[13px] text-parish-muted">Renaming also moves every household in this GKK to the new name.</div>
      )}
    </SidePanel>
  );
}
