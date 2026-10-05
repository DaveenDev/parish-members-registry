import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { SearchInput, Pagination, ErrorState, LoadingState, Panel } from './admin.jsx';
import { useClientList } from '../hooks.js';
import { Field, FlagEmptyRequired, TextInput } from './ui.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from '../ToastContext.jsx';
import { AddButton, RowButton, SidePanel } from './panels.jsx';
import GkkDocuments from './GkkDocuments.jsx';
import { barangayCodeSuggestion, gkkParts } from '../lib/site.js';
import { ChapelFields, HistoryFields, PagePhotoFields, chapelPatch, chapelProblem, gkkForm, historyPatch, photosPatch, sameHistory, samePhotos, useGkkPhotos } from './GkkFields.jsx';

// Desktop columns: name, chapel, puroks, year, last year's households, households, actions.
const COLS = 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_64px_96px_96px_auto] lg:gap-4';
const missingAddress = (g) => !String(g.chapel_address || '').trim();

/**
 * The parish's GKKs with their chapel details (shown and searched in the
 * website's GKK directory), each with its history (on its website page) and
 * its important documents. Add and Edit open a side panel. A GKK assigned
 * to a household, or with documents, can't be deleted. Each GKK shows its
 * barangay's reference number code (0047), kept in the GKK's panel. While
 * the parish uses last year's household list (0041, 0048), each GKK's
 * "Names" button opens its part of it on the Last year's list tab
 * (`onOpenList`).
 */
export function GkkManager({ onOpenList }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // null, or { id?, original?, tab, name, previous_households, ...gkkForm() }
  const confirm = useConfirm();
  const toast = useToast();
  const list = useClientList(rows, (r) => `${r.name} ${r.chapel_address || ''} ${r.puroks || ''}`);
  const noAddress = rows.filter(missingAddress).length;
  const [listCounts, setListCounts] = useState(new Map());
  const [listOn, setListOn] = useState(true);
  // Each barangay's reference code by lower-case name; null before 0047.
  const [codes, setCodes] = useState(null);
  const codeOf = (name) => codes?.get(gkkParts(name).area.toLowerCase())?.code;

  useEffect(() => {
    api.lastYearCounts().then(setListCounts).catch(() => {});
    api.getSettings().then((r) => setListOn(r.settings?.last_year_list_enabled !== false)).catch(() => {});
  }, []);

  const openList = listOn && onOpenList ? (name) => { setEditing(null); onOpenList(name); } : null;

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
    // Listing also gives a code to each new barangay.
    api.listBarangayRefCodes()
      .then((r) => setCodes(new Map(r.map((c) => [c.barangay.toLowerCase(), c]))))
      .catch(() => setCodes(null));
  }
  useEffect(() => { reload(); }, []);

  async function remove(g) {
    const ok = await confirm({
      title: `Delete “${g.name}”?`,
      message: "This removes the GKK, its chapel details, its history and its last year's household list on the Census page. It can't be undone, but you can add it again later.",
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

  const open = (g, tab = 'details') => setEditing(g
    ? { ...gkkForm(g), id: g.id, original: g.name, tab, name: g.name, previous_households: g.previous_households ?? '' }
    : { ...gkkForm(null), name: '', previous_households: '', tab });

  return (
    <>
    <Panel className="p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-[18px]">
        <div className="min-w-0 max-w-[640px]">
          <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Basic Ecclesial Communities (GKK)</div>
          <div className="text-[13.5px] text-parish-muted">Each GKK's chapel, puroks, year established and history show in the website's GKK directory. Last year's household count is the baseline the census measures its progress against. Land titles and other documents stay private. A GKK assigned to a household, or with documents, can't be deleted.</div>
        </div>
        <AddButton onClick={() => open(null)}>Add GKK</AddButton>
      </div>

      {noAddress > 0 && !loading && (
        <div className="mb-3 px-3.5 py-2.5 rounded-xl border border-[#fdba74] bg-[#fff7ed] text-[13.5px] text-[#9a3412]">
          {noAddress === 1 ? '1 GKK still needs its' : `${noAddress} GKKs still need their`} chapel address. It's required: open each one marked “Missing” and add it.
        </div>
      )}
      {rows.length > 0 && (
        <div className="mb-3">
          <SearchInput placeholder="Search GKKs, chapels or puroks…" aria-label="Search GKKs" value={list.query} onChange={(e) => list.setQuery(e.target.value)} />
        </div>
      )}
      {list.rows.length > 0 && (
        <div className={`hidden lg:grid ${COLS} px-3.5 pb-2 font-semibold text-[11.5px] tracking-wide uppercase text-parish-muted`}>
          <span>GKK</span><span>Chapel address</span><span>Puroks covered</span><span>Est.</span><span>Last year</span><span>Households</span><span />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {list.rows.map((g) => {
          const info = [g.puroks, g.year_established && `Est. ${g.year_established}`, g.previous_households != null && `${g.previous_households} household(s) last year`].filter(Boolean).join(' · ');
          const dash = <span className="text-parish-faint">—</span>;
          const missing = <span className="font-semibold text-[#c2410c]">Missing</span>;
          return (
            <div key={g.id} className={`flex items-center gap-2.5 lg:grid ${COLS} border border-parish-line2 rounded-xl px-3.5 py-2.5 bg-parish-field`}>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14.5px] text-parish-navy">
                  {g.name}
                  {codeOf(g.name) && (
                    <span title={`Its families' reference numbers start with ${codeOf(g.name)}`} className="ml-2 align-[1px] inline-block px-1.5 py-px rounded-md bg-parish-sunk font-bold text-[11px] tracking-[.08em] text-parish-text2">{codeOf(g.name)}</span>
                  )}
                </div>
                <div className="text-[12.5px] text-parish-text2 truncate lg:hidden">
                  {missingAddress(g) ? <span className="font-semibold text-[#c2410c]">Chapel address missing</span> : `Chapel: ${g.chapel_address}`}{info && ` · ${info}`}
                </div>
                {g.history_published
                  ? <div className="text-[12px] text-parish-muted">History on the website</div>
                  : (String(g.history || '').trim() || (g.history_photos || []).length > 0) && <div className="text-[12px] font-semibold text-[#c2410c]">History draft, not published</div>}
              </div>
              <span className="hidden lg:block text-[13.5px] text-parish-text2 min-w-0 break-words">{missingAddress(g) ? missing : g.chapel_address}</span>
              <span className="hidden lg:block text-[13.5px] text-parish-text2 min-w-0 break-words">{g.puroks || dash}</span>
              <span className="hidden lg:block text-[13.5px] text-parish-text2">{g.year_established || dash}</span>
              <span className="hidden lg:block text-[13.5px] text-parish-text2">{g.previous_households ?? dash}</span>
              <span className="font-semibold text-[12px] text-parish-muted whitespace-nowrap">{g.count}<span className="lg:hidden"> household(s)</span></span>
              <div className="flex items-center gap-2.5 lg:justify-end">
              {openList && (
                <RowButton tone="gray" onClick={() => openList(g.name)} className="px-3.5 py-2" title="Last year's household names for this GKK">
                  Names ({listCounts.get(g.name)?.total || 0})
                </RowButton>
              )}
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

      {editing && <GkkPanel initial={editing} codes={codes} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} onOpenList={openList} />}
    </Panel>
    </>
  );
}

/**
 * The reference number code of the barangay in the GKK's name (0047): the
 * start of its families' numbers, shared by every GKK in that barangay.
 * `current` is the barangay's saved code row, if it has one yet;
 * `sameBarangay` is true when this GKK was already in it.
 */
function RefCodeField({ barangay, current, code, sameBarangay, error, onChange }) {
  const hint = 'text-[13px] text-parish-muted';
  if (!barangay) {
    return <div className={hint}>Families' reference numbers start with a code for the GKK's barangay. Put the barangay after “ -” in the name (e.g. “Santo Rosario -Meohao”) to give it one.</div>;
  }
  const shown = code || barangayCodeSuggestion(barangay);
  const year = new Date().getFullYear();
  const others = (current?.gkks || 0) - (sameBarangay ? 1 : 0);
  const changed = !!current && !!code && code !== current.code;
  return (
    <>
      <Field label={`Reference number code · ${barangay}`} error={error}>
        <TextInput
          value={code}
          maxLength={3}
          placeholder={barangayCodeSuggestion(barangay)}
          autoCapitalize="characters"
          spellCheck={false}
          className="max-w-[120px] font-semibold tracking-[.08em] uppercase"
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
        />
      </Field>
      <div className={`-mt-2 ${hint}`}>
        {current && !changed
          ? <>Families in this GKK get numbers like <strong className="text-parish-text2">{current.next_ref}</strong> (the next one).</>
          : <>Families in this GKK will get numbers like <strong className="text-parish-text2">{shown}-{year}-0001</strong>.</>}
        {others > 0 && <> The code is shared with the other {others === 1 ? 'GKK' : `${others} GKKs`} in {barangay}.</>}
        {changed && <> Only new numbers use the new code: families keep the numbers they have.</>}
      </div>
    </>
  );
}

/** The panel's own tab bar: its buttons must not submit the panel's form. */
function PanelTabs({ tabs, value, onChange }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 -mt-1 border-b border-parish-border">
      {tabs.map(([k, label]) => (
        <button
          key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className="appearance-none border-none bg-none cursor-pointer px-3.5 py-2 -mb-px font-semibold text-[14px]"
          style={{ color: value === k ? 'var(--p-blue)' : 'rgb(var(--c-muted))', borderBottom: `2.5px solid ${value === k ? 'var(--p-blue)' : 'transparent'}` }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Add or edit one GKK: its name and chapel details, its history (text and
 * photos on R2, shown on its website page once published), and, once it
 * exists, its documents. History photos are uploaded as soon as they're
 * picked; on Cancel the ones uploaded here are deleted again, and photos
 * taken off a saved history are deleted once it's saved.
 */
function GkkPanel({ initial, codes, onClose, onSaved, onOpenList }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [tab, setTab] = useState(initial.tab || 'details');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
  // The reference code belongs to the barangay in the name, so a typed code
  // only applies while the name keeps that barangay.
  const [codeDraft, setCodeDraft] = useState({ barangay: '', value: '' });
  const [codeError, setCodeError] = useState('');
  const barangay = gkkParts(form.name.trim()).area;
  const current = barangay ? codes?.get(barangay.toLowerCase()) : null;
  const code = codeDraft.barangay === barangay.toLowerCase() ? codeDraft.value : (current?.code || '');
  const pagePhotos = useGkkPhotos(setError);
  const historyPhotos = useGkkPhotos(setError);
  const isNew = !initial.id;

  function close() {
    // Nothing was saved: take back what this panel uploaded.
    pagePhotos.rollback();
    historyPhotos.rollback();
    onClose();
  }

  async function save() {
    const name = form.name.trim();
    const fail = (message) => { setTab('details'); setError(message); };
    if (!name) { fail('Enter the GKK name.'); return; }
    const problem = chapelProblem(form);
    if (problem) { if (!form.chapel_address.trim()) setAddressError(problem); fail(problem); return; }
    const previous = String(form.previous_households ?? '').trim();
    if (previous && Number(previous) > 100000) { fail("Enter last year's household count as a number up to 100,000."); return; }
    const codeChanged = !!codes && !!barangay && !!code && code !== current?.code;
    if (codeChanged) {
      const taken = [...codes.values()].find((c) => c.code === code && c.barangay.toLowerCase() !== barangay.toLowerCase());
      const problem = !/^[A-Z]{3}$/.test(code) ? 'A reference code is exactly 3 letters, A to Z.'
        : code === 'OLG' ? 'OLG is kept for households with no barangay. Choose another code.'
        : taken ? `${taken.barangay} already uses ${code}. Choose another code.` : '';
      if (problem) { setCodeError(problem); fail(problem); return; }
    }
    if (pagePhotos.uploading || historyPhotos.uploading) { setError('Wait for the photos to finish uploading.'); return; }
    const details = { ...chapelPatch(form), previous_households: previous ? Number(previous) : null };
    // Only when they changed, so the details still save before the 0044 and 0046 migrations.
    if (!samePhotos(form, initial)) Object.assign(details, photosPatch(form));
    if (!sameHistory(form, initial)) Object.assign(details, historyPatch(form));
    setSaving(true);
    try {
      if (isNew) {
        await api.createGkk(name, details);
      } else {
        // rename_gkk also moves the households on the old name.
        if (name !== initial.original) await api.renameGkk(initial.original, name);
        await api.saveGkkDetails(initial.id, details);
      }
      pagePhotos.commit();
      historyPhotos.commit();
      if (codeChanged) {
        try {
          // A new barangay only gets its row (and a default code) once listed.
          if (!current) await api.listBarangayRefCodes();
          await api.setBarangayRefCode(barangay, code);
        } catch (e) {
          toast.error(`${name} was saved, but not its reference code: ${e.message || 'try again'}`);
        }
      }
      toast.success(isNew ? `${name} added` : `${name} saved`);
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save this GKK');
    } finally {
      setSaving(false);
    }
  }

  const tabs = [['details', 'Details'], ['history', 'History'], ...(isNew ? [] : [['documents', 'Documents']])];

  return (
    <SidePanel
      title={isNew ? 'Add GKK' : initial.original}
      subtitle={isNew ? 'A new Basic Ecclesial Community and its chapel' : 'Edit the GKK, its history and its documents'}
      onClose={close}
      onSave={save}
      saving={saving}
      saveLabel={isNew ? 'Add GKK' : 'Save changes'}
      error={error}
    >
      <PanelTabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'details' && (
        <FlagEmptyRequired.Provider value>
          <Field label="GKK name" required>
            <TextInput autoFocus value={form.name} placeholder="e.g. GKK San Pedro Calungsod -Poblacion" onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setError(''); }} />
          </Field>
          {codes && <RefCodeField barangay={barangay} current={current} code={code} sameBarangay={!isNew && gkkParts(initial.original).area.toLowerCase() === barangay.toLowerCase()} error={codeError}
            onChange={(value) => { setCodeDraft({ barangay: barangay.toLowerCase(), value }); setCodeError(''); setError(''); }} />}
          <ChapelFields form={form} setForm={setForm} setError={setError} addressError={addressError} setAddressError={setAddressError} />
          <Field label="Households last year">
            <TextInput inputMode="numeric" maxLength={6} value={form.previous_households} placeholder="e.g. 120" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, previous_households: e.target.value.replace(/\D/g, '') })); setError(''); }} />
          </Field>
          <div className="-mt-2 text-[13px] text-parish-muted">
            From the previous census. The ongoing census counts how many of these households have registered and how many have not yet.
            {!isNew && onOpenList && <> The names themselves go on <button type="button" onClick={() => onOpenList(initial.original)} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue">last year's household list</button>.</>}
          </div>
          {!isNew && initial.name !== form.name.trim() && form.name.trim() && (
            <div className="text-[13px] text-parish-muted">Renaming also moves every household in this GKK to the new name.</div>
          )}
          <PagePhotoFields form={form} setForm={setForm} photos={pagePhotos} />
        </FlagEmptyRequired.Provider>
      )}

      {tab === 'history' && <HistoryFields form={form} setForm={setForm} setError={setError} photos={historyPhotos} canPublish />}

      {tab === 'documents' && !isNew && <GkkDocuments gkk={{ id: initial.id, name: initial.original }} />}
    </SidePanel>
  );
}
