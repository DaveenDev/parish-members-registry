import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { SearchInput, ErrorState, LoadingState, Panel, ActionMenu } from './admin.jsx';
import { GKK_ATTENTION, attentionCounts, filterByAttention, gkkProgress, gkkFamilyProgress } from '../lib/gkkAdmin.js';
import { useClientList } from '../hooks.js';
import { Field, FlagEmptyRequired, GhostButton, TextInput } from './ui.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from '../ToastContext.jsx';
import { AddButton, RowButton, SidePanel } from './panels.jsx';
import GkkDocuments from './GkkDocuments.jsx';
import GkkStructure from './GkkStructure.jsx';
import { barangayCodeSuggestion, gkkParts } from '../lib/site.js';
import { ChapelFields, HistoryFields, PagePhotoFields, chapelPatch, chapelProblem, gkkForm, historyPatch, photosPatch, sameHistory, samePhotos, useGkkPhotos } from './GkkFields.jsx';

// Desktop columns: name (with its reference code), chapel, year, households, census progress, actions.
// The puroks are in the GKK's panel and the search; a column for them squeezed the names.
const COLS = 'lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_56px_84px_150px_110px] lg:gap-4'; // a fixed actions column keeps the headings over their values
// A parish has a few dozen GKKs at most: they all show on one page.
const ALL_GKKS = 1000;
const missingAddress = (g) => !String(g.chapel_address || '').trim();
/** The Households page filtered to one GKK, on the All tab so Pending and Verified both show. */
const householdsPath = (gkk) => `/admin/households?status=All&gkk=${encodeURIComponent(gkk)}`;
const websitePath = (name) => `/komunidad/gkk/${encodeURIComponent(name)}`;

/** A GKK's families registered of last year (0079), under its households progress; nothing without a families baseline. */
function FamilyProgress({ p }) {
  if (!p) return null;
  return (
    <span className="block text-[12px] text-parish-muted whitespace-nowrap mt-0.5" title={`${p.notYet} of last year's ${p.of} family(ies) not yet registered`}>
      Families <strong className="text-parish-text2">{p.done}</strong> / {p.of} · {p.pct}%
    </span>
  );
}

/** A GKK's census progress, as the Census page counts it: done / last year, with a bar. */
function Progress({ p, compact = false }) {
  if (!p) return <span className="text-parish-faint">—</span>;
  if (p.of == null) return <span className="text-[12.5px] text-parish-muted">{p.registered} registered · no baseline</span>;
  const done = p.pct >= 100;
  return (
    <span className="flex flex-col gap-1 min-w-0" title={`${p.notYet} of last year's ${p.of} household(s) not yet registered${p.fromList ? " (from last year's list)" : ''}`}>
      <span className="text-[12.5px] text-parish-text2 whitespace-nowrap">
        <strong className="text-parish-navy">{p.done}</strong> / {p.of} · {p.pct}%{compact && ' registered'}
      </span>
      {!compact && (
        <span className="block h-1.5 rounded-full bg-parish-sunk overflow-hidden" aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${p.pct}%`, background: done ? '#3a8a5e' : 'var(--p-blue)' }} />
        </span>
      )}
    </span>
  );
}

/**
 * The parish's GKKs with their chapel details (shown and searched in the
 * website's GKK directory), each with its history (on its website page) and
 * its important documents. Add and Edit open a side panel. A GKK assigned
 * to a household, or with documents, can't be deleted. Each GKK shows its
 * barangay's reference number code (0047), kept in the GKK's panel. While
 * the parish uses last year's household list (0041, 0048), each GKK's
 * "Names" button opens its part of it on the Last year's list tab
 * (`onOpenList`). `historyOf` (a GKK id, from the "GKK history to review"
 * notification's ?history=) opens that GKK on its History tab, to review and
 * publish; `onHistoryOpened` then drops it from the address.
 */
export function GkkManager({ onOpenList, historyOf = '', onHistoryOpened, structureOf = '', onStructureOpened }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // null, or { id?, original?, tab, name, previous_households, ...gkkForm() }
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  // Every GKK's name, one per line, for pasting into a message or a sheet.
  async function copyNames() {
    try {
      await navigator.clipboard.writeText(rows.map((g) => g.name).join('\n'));
      toast.success(`${rows.length} GKK name${rows.length === 1 ? '' : 's'} copied`);
    } catch {
      toast.error('Could not copy the names');
    }
  }
  // A "needs attention" chip ('all' shows every GKK).
  const [show, setShow] = useState('all');
  const gaps = attentionCounts(rows);
  const list = useClientList(filterByAttention(rows, show), (r) => `${r.name} ${r.chapel_address || ''} ${r.puroks || ''}`, ALL_GKKS);
  // Census progress by GKK (api.censusVsLastYear(), as on the Census page: households in `rows`, `families`); null until loaded or if it fails.
  const [progress, setProgress] = useState(null);
  const [listCounts, setListCounts] = useState(new Map());
  const [listOn, setListOn] = useState(true);
  // GKKs whose structure has changes waiting (0081): name → status.
  const [structures, setStructures] = useState(new Map());
  // Each barangay's reference code by lower-case name; null before 0047.
  const [codes, setCodes] = useState(null);
  const codeOf = (name) => codes?.get(gkkParts(name).area.toLowerCase())?.code;

  useEffect(() => {
    api.lastYearCounts().then(setListCounts).catch(() => {});
    api.getSettings().then((r) => setListOn(r.settings?.last_year_list_enabled !== false)).catch(() => {});
  }, []);

  const openList = listOn && onOpenList ? (name) => { setEditing(null); onOpenList(name); } : null;
  // Names on last year's list that still count (0058): while the list is on, they're the GKK's baseline, not the typed count.
  const listNames = (name) => {
    const c = listOn && listCounts.get(name);
    return c ? c.total - c.setAside : 0;
  };

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
    // The open census (or the latest), measured the way the Census page measures it.
    api.listCensusCycles()
      .then((cycles) => api.censusVsLastYear(cycles.find((c) => c.status === 'Open') || cycles[0] || null, cycles))
      .then((res) => setProgress(res))
      .catch(() => setProgress(null));
    api.gkkStructureStates().then(setStructures).catch(() => {});
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
    ? { ...gkkForm(g), id: g.id, original: g.name, tab, name: g.name, previous_households: g.previous_households ?? '', previous_families: g.previous_families ?? '' }
    : { ...gkkForm(null), name: '', previous_households: '', previous_families: '', tab });

  // Once the GKKs are loaded, and again if another notification is clicked
  // while this page is open. A GKK that's gone just shows the list.
  useEffect(() => {
    if (!historyOf || loading) return;
    const g = rows.find((r) => String(r.id) === historyOf);
    if (g) open(g, 'history');
    onHistoryOpened?.();
  }, [historyOf, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // The same for "GKK structure to approve" (?structure=<id>): its Structure tab.
  useEffect(() => {
    if (!structureOf || loading) return;
    const g = rows.find((r) => String(r.id) === structureOf);
    if (g) open(g, 'structure');
    onStructureOpened?.();
  }, [structureOf, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
    <Panel className="p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-[18px]">
        <div className="min-w-0 max-w-[640px]">
          <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Basic Ecclesial Communities (GKK)</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rows.length > 0 && <GhostButton onClick={copyNames} className="px-[18px] py-2.5 text-[14px] whitespace-nowrap">Copy names</GhostButton>}
          <AddButton onClick={() => open(null)}>Add GKK</AddButton>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Show GKKs that need attention">
          {[['all', 'All GKKs', rows.length], ...GKK_ATTENTION.map(([key, label]) => [key, label, gaps[key]])].map(([key, label, n]) => {
            if (key !== 'all' && !n && show !== key) return null;
            const on = show === key;
            // A missing chapel address is required, so its chip stays orange until it's fixed.
            const urgent = key === 'address' && n > 0;
            return (
              <button
                key={key} type="button" aria-pressed={on} onClick={() => setShow(on && key !== 'all' ? 'all' : key)}
                className={`appearance-none cursor-pointer px-3 py-1.5 rounded-full border text-[12.5px] font-semibold transition-colors ${
                  on ? 'border-transparent bg-parish-fill text-white'
                    : urgent ? 'border-[#fdba74] bg-[#fff7ed] text-[#9a3412]'
                      : 'border-parish-borderSoft bg-parish-card text-parish-text2'}`}
              >
                {label} <span className={on ? 'opacity-80' : 'text-parish-muted'}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
      {rows.length > 0 && (
        <div className="mb-3">
          <SearchInput placeholder="Search GKKs, chapels or puroks…" aria-label="Search GKKs" value={list.query} onChange={(e) => list.setQuery(e.target.value)} />
        </div>
      )}
      {list.rows.length > 0 && (
        <div className={`hidden lg:grid ${COLS} px-3.5 pb-2 font-semibold text-[11.5px] tracking-wide uppercase text-parish-muted`}>
          <span>GKK</span><span>Chapel address</span><span>Est.</span><span>Households</span><span>Census</span><span />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {list.rows.map((g) => {
          const p = gkkProgress(progress?.rows, g.name);
          const fp = gkkFamilyProgress(progress?.families, g.name);
          const info = [g.puroks, g.year_established && `Est. ${g.year_established}`].filter(Boolean).join(' · ');
          // The GKK's households: the Households page filtered to it, every status.
          const householdsLink = (children, className = '') => (!g.count ? <span className="text-parish-text2">{children}</span> :
            <Link to={householdsPath(g.name)} title={`Open the households of ${g.name}`} className={`font-semibold text-parish-blue hover:underline ${className}`}>{children}</Link>
          );
          const dash = <span className="text-parish-faint">—</span>;
          const missing = <span className="font-semibold text-[#c2410c]">Missing</span>;
          return (
            // The whole row opens the GKK; its buttons and menu do their own thing.
            <div
              key={g.id}
              onClick={(e) => { if (!e.target.closest('button, a')) open(g); }}
              className={`flex items-center gap-2.5 lg:grid ${COLS} border border-parish-line2 rounded-xl px-3.5 py-2.5 bg-parish-field cursor-pointer hover:border-parish-borderSoft hover:bg-parish-hover transition-colors`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14.5px] text-parish-navy">
                  <button type="button" onClick={() => open(g)} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-[14.5px] text-parish-navy text-left hover:underline">{g.name}</button>
                  {codeOf(g.name) && (
                    <span title={`Its families' reference numbers start with ${codeOf(g.name)}`} className="ml-2 align-[1px] inline-block px-1.5 py-px rounded-md bg-parish-sunk font-bold text-[11px] tracking-[.08em] text-parish-text2">{codeOf(g.name)}</span>
                  )}
                </div>
                <div className="text-[12.5px] text-parish-text2 lg:hidden">
                  {missingAddress(g) ? <span className="font-semibold text-[#c2410c]">Chapel address missing</span> : `Chapel: ${g.chapel_address}`}{info && ` · ${info}`}
                  {' · '}{householdsLink(`${g.count} household(s)`)}
                </div>
                <div className="lg:hidden mt-0.5"><Progress p={p} compact /><FamilyProgress p={fp} /></div>
                {g.history_published
                  ? <div className="text-[12px] text-parish-muted">History on the website</div>
                  : (String(g.history || '').trim() || (g.history_photos || []).length > 0) && <div className="text-[12px] font-semibold text-[#c2410c]">History draft, not published</div>}
                {structures.get(g.name) === 'submitted' && (
                  <button type="button" onClick={() => open(g, 'structure')} className="appearance-none border-none bg-transparent p-0 cursor-pointer text-[12px] font-semibold text-[#c2410c] hover:underline text-left">Structure waiting for approval</button>
                )}
              </div>
              <span className="hidden lg:block text-[13.5px] text-parish-text2 min-w-0 break-words">{missingAddress(g) ? missing : g.chapel_address}</span>
              <span className="hidden lg:block text-[13.5px] text-parish-text2">{g.year_established || dash}</span>
              <span className="hidden lg:block text-[13.5px]">{householdsLink(g.count, 'inline-block min-w-[28px] px-1 -mx-1 rounded')}</span>
              <span className="hidden lg:block min-w-0"><Progress p={p} /><FamilyProgress p={fp} /></span>
              <div className="flex items-center gap-2 lg:justify-end">
                <RowButton onClick={() => open(g)} className="px-3.5 py-2">Edit</RowButton>
                <ActionMenu
                  label={`More for ${g.name}`}
                  items={[
                    openList && { label: `Last year's names (${listCounts.get(g.name)?.total || 0})`, onClick: () => openList(g.name) },
                    { label: `Households (${g.count})`, onClick: () => navigate(householdsPath(g.name)) },
                    { label: 'Members', onClick: () => navigate(`/admin/members?gkk=${encodeURIComponent(g.name)}`) },
                    { label: 'View on website', onClick: () => window.open(websitePath(g.name), '_blank', 'noopener') },
                    // A GKK with households can't be deleted (they'd lose their GKK); move them first.
                    !g.count && { label: 'Delete GKK', tone: 'danger', onClick: () => remove(g) },
                  ]}
                />
              </div>
            </div>
          );
        })}
        {loading && <LoadingState label="Loading…" />}
        {!loading && loadError && <ErrorState message={loadError} onRetry={reload} />}
        {!loading && !loadError && !rows.length && <div className="text-[13.5px] text-parish-muted">No GKKs yet. Add the first one.</div>}
        {!!rows.length && !list.total && (
          <div className="text-[13.5px] text-parish-muted">
            {list.query ? <>No GKK matches “{list.query}”{show !== 'all' && ' with this filter'}.</> : 'No GKK needs this any more.'}
            {show !== 'all' && <> <button type="button" onClick={() => setShow('all')} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue">Show all GKKs</button></>}
          </div>
        )}
      </div>

      <p className="mt-4 mb-0 text-[13px] text-parish-muted">Each GKK's chapel, puroks, year established and history show in the website's GKK directory. Last year's household and family counts are the baselines the census measures its progress against. Land titles and other documents stay private. A GKK assigned to a household, or with documents, can't be deleted.</p>

      {editing && <GkkPanel key={editing.id ?? 'new'} initial={editing} codes={codes} listNames={editing.original ? listNames(editing.original) : 0} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} onOpenList={openList} />}
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
    <div role="tablist" className="flex gap-1 -mt-1 border-b border-parish-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap">
      {tabs.map(([k, label]) => (
        <button
          key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className="appearance-none border-none bg-none cursor-pointer px-3.5 py-2 -mb-px font-semibold text-[14px] whitespace-nowrap shrink-0"
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
function GkkPanel({ initial, codes, listNames = 0, onClose, onSaved, onOpenList }) {
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
    // While the GKK has names on the list, a count that doesn't match them saves empty (as 0058 does).
    const count = previous ? Number(previous) : null;
    const details = { ...chapelPatch(form), previous_households: listNames > 0 && count !== listNames ? null : count };
    // Only when they changed, so the details still save before the 0044 and 0046 migrations.
    if (!samePhotos(form, initial)) Object.assign(details, photosPatch(form));
    if (!sameHistory(form, initial)) Object.assign(details, historyPatch(form));
    // Families last year (0079), only when changed, so other details still save before 0079.
    const families = String(form.previous_families ?? '').trim();
    if (families && Number(families) > 100000) { fail("Enter last year's family count as a number up to 100,000."); return; }
    if (families !== String(initial.previous_families ?? '').trim()) details.previous_families = families ? Number(families) : null;
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

  const tabs = [['details', 'Details'], ...(isNew ? [] : [['structure', 'Structure']]), ['history', 'History'], ...(isNew ? [] : [['documents', 'Documents']])];

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
            {listNames > 0
              ? <TextInput value={listNames} disabled readOnly aria-label="Households last year, from last year's list" className="max-w-[160px]" />
              : <TextInput inputMode="numeric" maxLength={6} value={form.previous_households} placeholder="e.g. 120" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, previous_households: e.target.value.replace(/\D/g, '') })); setError(''); }} />}
          </Field>
          <div className="-mt-2 text-[13px] text-parish-muted">
            {listNames > 0
              ? <>From the {listNames} name(s) on {onOpenList ? <button type="button" onClick={() => onOpenList(initial.original)} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue">last year's household list</button> : "last year's household list"}, which come first: a typed count that doesn't match them is cleared. It's used once, until a census is recorded in the registry.</>
              : <>From the previous census. The ongoing census counts how many of these households have registered and how many have not yet, until a census is recorded in the registry.
                {!isNew && onOpenList && <> The names themselves go on <button type="button" onClick={() => onOpenList(initial.original)} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue">last year's household list</button>; once a GKK has names there, they're used instead of this count.</>}</>}
          </div>
          <Field label="Families last year">
            <TextInput inputMode="numeric" maxLength={6} value={form.previous_families ?? ''} placeholder="e.g. 140" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, previous_families: e.target.value.replace(/\D/g, '') })); setError(''); }} />
          </Field>
          <div className="-mt-2 text-[13px] text-parish-muted">
            A house can hold more than one family, each with its own head. The census counts how many of these families have registered, until a census is recorded in the registry.
          </div>
          {!isNew && initial.name !== form.name.trim() && form.name.trim() && (
            <div className="text-[13px] text-parish-muted">Renaming also moves every household in this GKK to the new name.</div>
          )}
          <PagePhotoFields form={form} setForm={setForm} photos={pagePhotos} />
        </FlagEmptyRequired.Provider>
      )}

      {tab === 'history' && <HistoryFields form={form} setForm={setForm} setError={setError} photos={historyPhotos} canPublish />}

      {tab === 'structure' && !isNew && <GkkStructure gkk={initial.original} office />}

      {tab === 'documents' && !isNew && <GkkDocuments gkk={{ id: initial.id, name: initial.original }} />}
    </SidePanel>
  );
}
