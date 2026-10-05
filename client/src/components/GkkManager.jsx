import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { SearchInput, Pagination, ErrorState, LoadingState, Panel } from './admin.jsx';
import { useClientList } from '../hooks.js';
import { Field, FlagEmptyRequired, TextInput } from './ui.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from '../ToastContext.jsx';
import { AddButton, RowButton, SidePanel } from './panels.jsx';
import GkkDocuments from './GkkDocuments.jsx';
import LastYearList from './LastYearList.jsx';
import RefCodes from './RefCodes.jsx';
import { ChapelFields, HistoryFields, PagePhotoFields, chapelPatch, chapelProblem, gkkForm, historyPatch, photosPatch, sameHistory, samePhotos, useGkkPhotos } from './GkkFields.jsx';

// Desktop columns: name, chapel, puroks, year, last year's households, households, actions.
const COLS = 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_64px_96px_96px_auto] lg:gap-4';
const missingAddress = (g) => !String(g.chapel_address || '').trim();

/**
 * The parish's GKKs with their chapel details (shown and searched in the
 * website's GKK directory), each with its history (on its website page) and
 * its important documents. Add and Edit open a side panel. A GKK assigned
 * to a household, or with documents, can't be deleted. Below the GKKs are
 * each barangay's reference number code (0047) and last year's household
 * list (0041), the paper census names the census ticks off; each GKK's
 * "Names" button opens its part of it.
 */
export function GkkManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // null, or { id?, original?, tab, name, previous_households, ...gkkForm() }
  const confirm = useConfirm();
  const toast = useToast();
  const list = useClientList(rows, (r) => `${r.name} ${r.chapel_address || ''} ${r.puroks || ''}`);
  const noAddress = rows.filter(missingAddress).length;
  const [listGkk, setListGkk] = useState(''); // the GKK shown in last year's list ('' = all)
  const [listCounts, setListCounts] = useState(new Map());
  const [parish, setParish] = useState(null);
  const listRef = useRef(null);

  const reloadCounts = () => api.lastYearCounts().then(setListCounts).catch(() => {});
  useEffect(() => {
    reloadCounts();
    api.getSettings().then((r) => setParish(r.settings)).catch(() => {});
  }, []);

  function openList(name) {
    setEditing(null);
    setListGkk(name);
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

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
                <div className="font-semibold text-[14.5px] text-parish-navy">{g.name}</div>
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
              <RowButton tone="gray" onClick={() => openList(g.name)} className="px-3.5 py-2" title="Last year's household names for this GKK">
                Names ({listCounts.get(g.name)?.total || 0})
              </RowButton>
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

      {editing && <GkkPanel initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} onOpenList={openList} />}
    </Panel>

    {/* Keyed on the GKK names, so a new barangay shows up (with its code) once its GKK is saved. */}
    {!loading && <RefCodes key={rows.map((g) => g.name).join('|')} />}

    <div ref={listRef} className="scroll-mt-4">
      <Panel className="p-6 mt-6">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Last year's household list</div>
        <div className="text-[13.5px] text-parish-muted mb-4">
          The names from the previous paper census, the reference for this census: each household head, their purok and a note.
          Choose a GKK, then type or paste its names, or upload a spreadsheet. The same list is on the Census page, where families are ticked off as they register.
        </div>
        <LastYearList key={listGkk} initialGkk={listGkk} parish={parish} canEdit canManage onChanged={reloadCounts} />
      </Panel>
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
function GkkPanel({ initial, onClose, onSaved, onOpenList }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [tab, setTab] = useState(initial.tab || 'details');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
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
          <ChapelFields form={form} setForm={setForm} setError={setError} addressError={addressError} setAddressError={setAddressError} />
          <Field label="Households last year">
            <TextInput inputMode="numeric" maxLength={6} value={form.previous_households} placeholder="e.g. 120" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, previous_households: e.target.value.replace(/\D/g, '') })); setError(''); }} />
          </Field>
          <div className="-mt-2 text-[13px] text-parish-muted">
            From the previous census. The ongoing census counts how many of these households have registered and how many have not yet.
            {!isNew && <> The names themselves go on <button type="button" onClick={() => onOpenList(initial.original)} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue">last year's household list</button>, below the GKKs.</>}
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
