import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { FilterSelect, SearchInput, Pagination, ErrorState, LoadingState, EmptyState, Panel, DataTable } from './admin.jsx';
import { Field, TextInput, Badge, GhostButton } from './ui.jsx';
import { AddButton, RowButton, SidePanel } from './panels.jsx';
import { useClientList } from '../hooks.js';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from '../ToastContext.jsx';
import { parseCsv } from '../lib/csv.js';
import {
  LAST_YEAR_STATUSES, LAST_YEAR_STATUS_TONES, parseLastYearLines, parseLastYearCsv, countLastYearList, dropRepeatedNames,
} from '../lib/census.js';

const textareaClass = 'w-full px-3.5 py-3 text-[15px] text-parish-ink bg-parish-field border-[1.5px] border-parish-borderSoft rounded-xl outline-none transition focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15 font-mono leading-relaxed';
const rowText = (r) => `${r.head_name} ${r.purok || ''} ${r.note || ''}`;
const byPurok = (a, b) => (a.purok || '').localeCompare(b.purok || '', undefined, { numeric: true }) || a.head_name.localeCompare(b.head_name);

/**
 * Last year's household list (0041): the families on last year's paper
 * census, typed in per GKK, ticked off as they register in this census.
 * What's left is the "not yet registered" list GKK leaders print for house
 * visits. GKK leaders see and change only their own GKK. `canEdit` adds,
 * edits and ticks names; `canManage` may also clear a GKK's whole list.
 */
export default function LastYearList({ ownGkk, parish, canEdit, canManage, onChanged }) {
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef(null);
  const [gkk, setGkk] = useState(ownGkk || '');
  const [gkkNames, setGkkNames] = useState(ownGkk ? [ownGkk] : []);
  const [overview, setOverview] = useState(null); // Map of GKK → counts, for the all-GKK view
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('All');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [printRows, setPrintRows] = useState(null);
  const [busy, setBusy] = useState(false);

  const shown = (rows || []).filter((r) => status === 'All' || (status === 'Set aside' ? !['Not yet', 'Registered'].includes(r.status) : r.status === status));
  const list = useClientList(shown, rowText, 25);
  const counts = rows ? countLastYearList(rows).get(gkk) || { total: 0, notYet: 0, registered: 0, setAside: 0 } : null;

  function load() {
    setError('');
    if (gkk) {
      setRows(null);
      api.listLastYear(gkk).then(setRows).catch((e) => setError(e.message));
    } else {
      setOverview(null);
      api.listLastYear('All').then((all) => setOverview(countLastYearList(all))).catch((e) => setError(e.message));
    }
  }
  useEffect(() => { load(); }, [gkk]);
  useEffect(() => { setStatus('All'); list.setQuery(''); }, [gkk]);
  useEffect(() => { if (!ownGkk) api.listGkks().then((r) => setGkkNames(r.rows.map((x) => x.name))).catch(() => {}); }, [ownGkk]);

  function changed() {
    load();
    onChanged?.();
  }

  /** Add names after leaving out the ones already on the list. */
  async function addNames(newRows) {
    const existing = await api.listLastYear('All');
    const { fresh, repeated } = dropRepeatedNames(newRows, existing);
    if (!fresh.length) {
      toast.error(repeated ? 'All of these names are already on the list' : 'No names to add');
      return 0;
    }
    const added = await api.addLastYear(fresh);
    toast.success(`${added} name(s) added${repeated ? ` · ${repeated} already on the list` : ''}`);
    changed();
    return added;
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { rows: parsed, skipped } = parseLastYearCsv(parseCsv(await file.text()), { defaultGkk: gkk || null, gkkNames });
      if (ownGkk) {
        // A leader's upload goes to their own GKK only.
        const others = parsed.filter((r) => r.gkk !== ownGkk);
        others.forEach(() => skipped.push({ line: '—', reason: `Not in ${ownGkk}` }));
        parsed.splice(0, parsed.length, ...parsed.filter((r) => r.gkk === ownGkk));
      }
      if (!parsed.length) {
        toast.error(skipped.length ? `No names could be read: ${skipped[0].reason}${gkk ? '' : '. Choose a GKK first, or add a GKK column.'}` : 'The file has no names');
        return;
      }
      const perGkk = [...countLastYearList(parsed.map((r) => ({ gkk: r.gkk, status: 'Not yet' })))].map(([g, c]) => `${g}: ${c.total}`).join(', ');
      const ok = await confirm({
        title: `Add ${parsed.length} name(s) from ${file.name}?`,
        message: [
          `By GKK: ${perGkk}.`,
          skipped.length ? `${skipped.length} row(s) will be skipped — ${skipped.slice(0, 4).map((s) => `line ${s.line}: ${s.reason}`).join('; ')}${skipped.length > 4 ? '…' : ''}.` : '',
          'Names already on the list are left out.',
        ].filter(Boolean).join(' '),
        confirmLabel: 'Add names',
      });
      if (!ok) return;
      setBusy(true);
      await addNames(parsed);
    } catch (err) {
      toast.error(err.message || 'Could not read this file');
    } finally {
      setBusy(false);
    }
  }

  async function setRowStatus(r, next) {
    try {
      const saved = await api.saveLastYear(r.id, { status: next });
      setRows((rs) => rs.map((x) => (x.id === r.id ? saved : x)));
      onChanged?.();
    } catch (e) {
      toast.error(e.message || 'Could not save');
    }
  }

  async function remove(r) {
    const ok = await confirm({ title: `Remove “${r.head_name}”?`, message: 'This takes the name off the list. To keep it but stop counting it, mark it Moved away, Deceased or Duplicate instead.', confirmLabel: 'Remove', tone: 'danger' });
    if (!ok) return;
    try {
      await api.deleteLastYear(r.id);
      changed();
    } catch (e) {
      toast.error(e.message || 'Could not remove this name');
    }
  }

  async function clearAll() {
    const ok = await confirm({
      title: `Clear the whole list for ${gkk}?`,
      message: `This removes all ${counts.total} name(s), ticked or not. Do this once the census is done, so the names of families who never registered aren't kept. It can't be undone.`,
      confirmLabel: 'Clear list',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.clearLastYear(gkk);
      toast.success(`${gkk}'s list cleared`);
      changed();
    } catch (e) {
      toast.error(e.message || 'Could not clear the list');
    }
  }

  function print() {
    const notYet = (rows || []).filter((r) => r.status === 'Not yet').sort(byPurok);
    if (!notYet.length) { toast.error('Everyone on the list is ticked off'); return; }
    setPrintRows(notYet);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  return (
    <>
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <p className="m-0 text-[13.5px] text-parish-muted max-w-[640px]">
          The households on last year's paper census, typed in per GKK. Tick each one off as it registers in this census; the ones left are the households not yet registered. Only parish staff and the GKK's own leader can see these names.
        </p>
      </div>

      <div className="flex flex-wrap gap-2.5 items-center mb-4">
        {ownGkk ? (
          <span className="text-[13.5px] font-semibold text-parish-navy px-1">{ownGkk}</span>
        ) : (
          <FilterSelect aria-label="GKK" value={gkk} onChange={(e) => setGkk(e.target.value)}>
            <option value="">All GKKs (summary)</option>
            {gkkNames.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
        )}
        {gkk && (
          <>
            <FilterSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="All">Everyone</option>
              <option value="Not yet">Not yet registered</option>
              <option value="Registered">Registered</option>
              <option value="Set aside">Moved away, deceased or duplicate</option>
            </FilterSelect>
            <SearchInput placeholder="Search name, purok, note…" aria-label="Search the list" value={list.query} onChange={(e) => list.setQuery(e.target.value)} />
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {gkk && <GhostButton type="button" onClick={print} disabled={!counts?.notYet} className="px-3.5 py-2 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">Print not yet registered</GhostButton>}
          {canEdit && (
            <>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={upload} />
              <GhostButton type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="px-3.5 py-2 text-[13px]" title="A CSV with columns: GKK, Head of household, Purok, Note">
                {busy ? 'Adding…' : 'Upload spreadsheet (CSV)'}
              </GhostButton>
              {gkk && <AddButton onClick={() => setAdding(true)}>Add names</AddButton>}
            </>
          )}
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {!error && !gkk && (
        overview === null ? <LoadingState label="Loading…" /> : (
          <DataTable
            minWidth={640}
            columns={[{ label: 'GKK' }, { label: 'On the list', align: 'right' }, { label: 'Registered', align: 'right' }, { label: 'Not yet', align: 'right' }, { label: 'Set aside', align: 'right' }]}
            footer={!gkkNames.length && <EmptyState title="No GKKs yet" />}
          >
            {gkkNames.map((g) => {
              const c = overview.get(g);
              return (
                <tr key={g} className="border-t border-parish-line cursor-pointer hover:bg-parish-sunk" onClick={() => setGkk(g)}>
                  <td className="px-4 py-3 text-[14px] text-parish-navy font-semibold whitespace-nowrap">
                    <button type="button" className="appearance-none bg-transparent border-none p-0 cursor-pointer font-semibold text-parish-navy text-left" onClick={(e) => { e.stopPropagation(); setGkk(g); }}>{g}</button>
                  </td>
                  {c ? (
                    <>
                      <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{c.total}</td>
                      <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{c.registered}</td>
                      <td className="px-4 py-3 text-[14px] text-right text-parish-navy font-semibold">{c.notYet}</td>
                      <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{c.setAside}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-4 py-3 text-[13px] text-right text-parish-faint">No list yet</td>
                  )}
                </tr>
              );
            })}
          </DataTable>
        )
      )}

      {!error && gkk && (
        rows === null ? <LoadingState label="Loading the list…" /> : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-parish-muted mb-3">
              <span><strong className="text-parish-navy">{counts.total}</strong> on the list</span>
              <span><strong className="text-parish-navy">{counts.registered}</strong> registered</span>
              <span><strong className="text-parish-navy">{counts.notYet}</strong> not yet</span>
              {!!counts.setAside && <span><strong className="text-parish-navy">{counts.setAside}</strong> moved away, deceased or duplicate</span>}
            </div>
            <Panel className="overflow-hidden">
              {!rows.length && (
                <EmptyState
                  title="No names yet"
                  subtitle={canEdit ? 'Add the households from last year’s census: type or paste them one per line, or upload a spreadsheet.' : 'Nobody has typed in this GKK’s list yet.'}
                />
              )}
              {!!rows.length && !list.total && <div className="px-4 py-6 text-[13.5px] text-parish-muted">No names match.</div>}
              <ul className="list-none m-0 p-0">
                {list.rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-t border-parish-line first:border-t-0">
                    <div className="flex-1 min-w-[200px]">
                      <div className="font-semibold text-[14.5px] text-parish-navy">{r.head_name}</div>
                      <div className="text-[12.5px] text-parish-text2">
                        {[r.purok, r.note].filter(Boolean).join(' · ') || <span className="text-parish-faint">No purok</span>}
                        {r.checked_by_name && r.status !== 'Not yet' && <span className="text-parish-muted"> · {r.status.toLowerCase()} by {r.checked_by_name}</span>}
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {r.status === 'Not yet' && <RowButton tone="green" onClick={() => setRowStatus(r, 'Registered')}>✓ Registered</RowButton>}
                        <FilterSelect aria-label={`Status of ${r.head_name}`} value={r.status} onChange={(e) => setRowStatus(r, e.target.value)} className="!py-1.5 !text-[12.5px]">
                          {LAST_YEAR_STATUSES.map((s) => <option key={s} value={s}>{s === 'Not yet' ? 'Not yet registered' : s}</option>)}
                        </FilterSelect>
                        <RowButton onClick={() => setEditing(r)}>Edit</RowButton>
                        <RowButton tone="red" onClick={() => remove(r)}>Remove</RowButton>
                      </div>
                    ) : (
                      <Badge tone={LAST_YEAR_STATUS_TONES[r.status]}>{r.status === 'Not yet' ? 'Not yet registered' : r.status}</Badge>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} />
            </Panel>
            {canManage && counts.total > 0 && (
              <div className="mt-4 text-right">
                <RowButton tone="red" onClick={clearAll}>Clear {gkk}'s list</RowButton>
              </div>
            )}
          </>
        )
      )}

      {adding && <AddNamesPanel gkk={gkk} onClose={() => setAdding(false)} onAdd={addNames} />}
      {editing && <EditNamePanel row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />}
      <NotYetPrintSheet rows={printRows} gkk={gkk} parish={parish} />
    </>
  );
}

/** Type or paste names, one household per line. */
function AddNamesPanel({ gkk, onClose, onAdd }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const parsed = parseLastYearLines(text);

  async function save() {
    if (!parsed.length) { setError('Type at least one name.'); return; }
    setSaving(true);
    try {
      if (await onAdd(parsed.map((r) => ({ ...r, gkk })))) onClose();
    } catch (e) {
      setError(e.message || 'Could not add the names');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title="Add names"
      subtitle={`Last year's households in ${gkk}`}
      onClose={onClose}
      onSave={save}
      saving={saving}
      saveLabel={parsed.length ? `Add ${parsed.length} name(s)` : 'Add names'}
      error={error}
    >
      <Field label="One household per line: head of household, purok, note">
        <textarea
          autoFocus
          rows={14}
          value={text}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          placeholder={'Juan Dela Cruz, Purok 3\nMaria Santos, Purok 1, near the chapel\nPedro Reyes'}
          className={textareaClass}
        />
      </Field>
      <div className="-mt-2 text-[13px] text-parish-muted">
        Only the name is needed. You can paste a column straight from a spreadsheet. Names already on the list are left out.
      </div>
    </SidePanel>
  );
}

/** Fix a name's spelling, purok or note. */
function EditNamePanel({ row, onClose, onSaved }) {
  const [form, setForm] = useState({ head_name: row.head_name, purok: row.purok || '', note: row.note || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  async function save() {
    if (!form.head_name.trim()) { setError('Enter the head of household’s name.'); return; }
    setSaving(true);
    try {
      await api.saveLastYear(row.id, form);
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.head_name} subtitle={`On last year's list for ${row.gkk}`} onClose={onClose} onSave={save} saving={saving} saveLabel="Save changes" error={error}>
      <Field label="Head of household" required><TextInput autoFocus maxLength={200} value={form.head_name} onChange={set('head_name')} /></Field>
      <Field label="Purok / sitio"><TextInput maxLength={200} value={form.purok} onChange={set('purok')} /></Field>
      <Field label="Note"><TextInput maxLength={500} value={form.note} placeholder="e.g. near the chapel" onChange={set('note')} /></Field>
    </SidePanel>
  );
}

const cell = { border: '1px solid #bbb', padding: '5px 6px', verticalAlign: 'top' };
const head = { ...cell, fontWeight: 700, fontSize: 10, textAlign: 'left', borderBottom: '1.5px solid #000' };

/**
 * The households on last year's list not yet registered, for the GKK leader
 * to visit. Plain black on white, revealed by the #print-sheet print rules
 * in index.css like the census forms.
 */
function NotYetPrintSheet({ rows, gkk, parish }) {
  if (!rows || !rows.length) return null;
  return createPortal(
    <div id="print-sheet" aria-hidden style={{ fontSize: 11, color: '#000', background: '#fff' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 10 }}>
        {parish?.logo && <img src={parish.logo} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 21, fontWeight: 600 }}>{parish?.name || 'Our Lady of Guadalupe'}</div>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#555' }}>Wala pa makarehistro · Not yet registered</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 10.5 }}>
          <div><strong>GKK:</strong> {gkk}</div>
          <div>{rows.length} ka panimalay</div>
          <div>Gi-print {new Date().toLocaleDateString()}</div>
        </div>
      </header>
      <p style={{ margin: '0 0 8px', fontSize: 10.5 }}>
        Mga panimalay sa census sa miaging tuig nga wala pa makarehistro karong tuiga. Bisitaha ug isulat ang nahitabo (nakarehistro na, nibalhin, namatay…).
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...head, width: 28 }}>#</th>
            <th style={head}>Pangulo sa panimalay</th>
            <th style={{ ...head, width: '18%' }}>Purok</th>
            <th style={{ ...head, width: '22%' }}>Nota</th>
            <th style={{ ...head, width: '26%' }}>Resulta sa bisita</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td style={cell}>{i + 1}</td>
              <td style={{ ...cell, fontWeight: 600 }}>{r.head_name}</td>
              <td style={cell}>{r.purok || ''}</td>
              <td style={cell}>{r.note || ''}</td>
              <td style={cell} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    document.body,
  );
}
