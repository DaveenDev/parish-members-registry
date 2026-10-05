import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { SearchInput, Pagination, ErrorState, LoadingState, Panel } from './admin.jsx';
import { useClientList } from '../hooks.js';
import { Field, FlagEmptyRequired, TextInput } from './ui.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from '../ToastContext.jsx';
import { AddButton, RowButton, SectionLabel, SidePanel, TextArea } from './panels.jsx';
import { FilePick, PublishSwitch } from './website/shared.jsx';
import GkkDocuments from './GkkDocuments.jsx';

const THIS_YEAR = new Date().getFullYear();
// Desktop columns: name, chapel, puroks, year, last year's households, households, actions.
const COLS = 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_64px_96px_96px_auto] lg:gap-4';
const EMPTY = { name: '', chapel_address: '', puroks: '', year_established: '', previous_households: '', history: '', history_photos: [], history_published: false };
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const lastYearPath = (name) => `/admin/census?tab=lastYear&gkk=${encodeURIComponent(name)}`;
const missingAddress = (g) => !String(g.chapel_address || '').trim();

/**
 * The parish's GKKs with their chapel details (shown and searched in the
 * website's GKK directory), each with its history (on its website page) and
 * its important documents. Add and Edit open a side panel. A GKK assigned
 * to a household, or with documents, can't be deleted.
 */
export function GkkManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState(null); // null, or { id?, original?, ...EMPTY }
  const confirm = useConfirm();
  const toast = useToast();
  const list = useClientList(rows, (r) => `${r.name} ${r.chapel_address || ''} ${r.puroks || ''}`);
  const noAddress = rows.filter(missingAddress).length;

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
    ? {
      id: g.id, original: g.name, tab, name: g.name, chapel_address: g.chapel_address || '', puroks: g.puroks || '', year_established: g.year_established ?? '', previous_households: g.previous_households ?? '',
      history: g.history || '', history_photos: g.history_photos || [], history_published: !!g.history_published,
    }
    : { ...EMPTY, tab });

  return (
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
                {g.history_published && <div className="text-[12px] text-parish-muted">History on the website</div>}
              </div>
              <span className="hidden lg:block text-[13.5px] text-parish-text2 min-w-0 break-words">{missingAddress(g) ? missing : g.chapel_address}</span>
              <span className="hidden lg:block text-[13.5px] text-parish-text2 min-w-0 break-words">{g.puroks || dash}</span>
              <span className="hidden lg:block text-[13.5px] text-parish-text2">{g.year_established || dash}</span>
              <span className="hidden lg:block text-[13.5px] text-parish-text2">{g.previous_households ?? dash}</span>
              <span className="font-semibold text-[12px] text-parish-muted whitespace-nowrap">{g.count}<span className="lg:hidden"> household(s)</span></span>
              <div className="flex items-center gap-2.5 lg:justify-end">
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

      {editing && <GkkPanel initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </Panel>
  );
}

/**
 * For a GKK leader: their own GKK's documents, and a link to its last
 * year's household list. (The GKK's details are kept by full-access staff.)
 */
export function OwnGkkDocuments({ name }) {
  const [gkk, setGkk] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    api.listGkkDetails()
      .then(({ rows }) => {
        const g = rows.find((r) => r.name === name);
        if (!g) throw new Error(`${name} wasn't found in the GKK list`);
        setGkk(g);
      })
      .catch((e) => setError(e.message || 'Could not load your GKK'));
  }
  useEffect(() => { load(); }, [name]);

  return (
    <Panel className="p-6">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">{name}</div>
      <div className="text-[13.5px] text-parish-muted mb-4">
        Your GKK's important documents. Last year's household list is on the <Link to={lastYearPath(name)} className="font-semibold text-parish-blue">Census page</Link>.
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : !gkk ? <LoadingState label="Loading…" /> : <GkkDocuments gkk={gkk} />}
    </Panel>
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

const sameHistory = (a, b) => (a.history || '').trim() === (b.history || '').trim()
  && !!a.history_published === !!b.history_published
  && JSON.stringify(a.history_photos || []) === JSON.stringify(b.history_photos || []);

/**
 * Add or edit one GKK: its name and chapel details, its history (text and
 * photos on R2, shown on its website page once published), and, once it
 * exists, its documents. History photos are uploaded as soon as they're
 * picked; on Cancel the ones uploaded here are deleted again, and photos
 * taken off a saved history are deleted once it's saved.
 */
function GkkPanel({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [tab, setTab] = useState(initial.tab || 'details');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
  const added = useRef(new Set());   // photos uploaded in this panel
  const removed = useRef(new Set()); // photos of the saved history, taken off here
  const isNew = !initial.id;
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  async function addPhotos(files) {
    setUploading((n) => n + files.length);
    setError('');
    for (const file of files) {
      try {
        if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
        if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB`);
        const url = await api.uploadImage(file, 'gkks');
        added.current.add(url);
        setForm((f) => ({ ...f, history_photos: [...f.history_photos, { url, caption: '' }] }));
      } catch (e) {
        setError(e.message || 'Could not upload the photo');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }
  const updatePhoto = (i, patch) => setForm((f) => ({ ...f, history_photos: f.history_photos.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const movePhoto = (i, d) => setForm((f) => {
    const photos = [...f.history_photos];
    [photos[i], photos[i + d]] = [photos[i + d], photos[i]];
    return { ...f, history_photos: photos };
  });
  function removePhoto(i) {
    const { url } = form.history_photos[i];
    if (added.current.has(url)) {
      added.current.delete(url);
      api.deleteImage(url).catch(() => {});
    } else {
      removed.current.add(url);
    }
    setForm((f) => ({ ...f, history_photos: f.history_photos.filter((_, j) => j !== i) }));
  }

  function close() {
    // Nothing was saved: take back what this panel uploaded.
    for (const url of added.current) api.deleteImage(url).catch(() => {});
    onClose();
  }

  async function save() {
    const name = form.name.trim();
    const year = String(form.year_established ?? '').trim();
    const fail = (message) => { setTab('details'); setError(message); };
    if (!name) { fail('Enter the GKK name.'); return; }
    if (!form.chapel_address.trim()) { setAddressError('Enter the chapel address.'); fail('Enter the chapel address.'); return; }
    if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1500 && Number(year) <= THIS_YEAR)) {
      fail(`Enter the year established as four digits, up to ${THIS_YEAR}.`);
      return;
    }
    const previous = String(form.previous_households ?? '').trim();
    if (previous && Number(previous) > 100000) { fail("Enter last year's household count as a number up to 100,000."); return; }
    if (uploading) { setError('Wait for the photos to finish uploading.'); return; }
    const details = { chapel_address: form.chapel_address, puroks: form.puroks, year_established: year ? Number(year) : null, previous_households: previous ? Number(previous) : null };
    // Only when it changed, so the details still save before the 0044 migration.
    if (!sameHistory(form, initial)) {
      Object.assign(details, {
        history: form.history.trim(),
        history_photos: form.history_photos.map((p) => ({ url: p.url, caption: (p.caption || '').trim() })),
        history_published: !!form.history_published,
      });
    }
    setSaving(true);
    try {
      if (isNew) {
        await api.createGkk(name, details);
      } else {
        // rename_gkk also moves the households on the old name.
        if (name !== initial.original) await api.renameGkk(initial.original, name);
        await api.saveGkkDetails(initial.id, details);
      }
      for (const url of removed.current) api.deleteImage(url).catch(() => {});
      added.current.clear();
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
            <TextInput autoFocus value={form.name} placeholder="e.g. GKK San Pedro Calungsod -Poblacion" onChange={set('name')} />
          </Field>
          <Field label="Chapel address" required error={addressError}>
            <TextInput value={form.chapel_address} placeholder="e.g. Purok 3, Brgy. San Isidro" onChange={(e) => { set('chapel_address')(e); setAddressError(''); }} />
          </Field>
          <Field label="Puroks / sitios covered">
            <TextInput value={form.puroks} placeholder="e.g. Purok 1, 2 and 3" onChange={set('puroks')} />
          </Field>
          <Field label="Year established">
            <TextInput inputMode="numeric" maxLength={4} value={form.year_established} placeholder="e.g. 1985" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, year_established: e.target.value.replace(/\D/g, '') })); setError(''); }} />
          </Field>
          <Field label="Households last year">
            <TextInput inputMode="numeric" maxLength={6} value={form.previous_households} placeholder="e.g. 120" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, previous_households: e.target.value.replace(/\D/g, '') })); setError(''); }} />
          </Field>
          <div className="-mt-2 text-[13px] text-parish-muted">
            From the previous census. The ongoing census counts how many of these households have registered and how many have not yet.
            {!isNew && <> The names themselves go on <Link to={lastYearPath(initial.original)} className="font-semibold text-parish-blue">last year's household list</Link> on the Census page.</>}
          </div>
          {!isNew && initial.name !== form.name.trim() && form.name.trim() && (
            <div className="text-[13px] text-parish-muted">Renaming also moves every household in this GKK to the new name.</div>
          )}
        </FlagEmptyRequired.Provider>
      )}

      {tab === 'history' && (
        <>
          <Field label="History of the GKK">
            <TextArea
              rows={14} maxLength={50000} value={form.history} onChange={(e) => { setForm((f) => ({ ...f, history: e.target.value })); setError(''); }}
              placeholder="How the GKK began, how the chapel was built, its patron saint, the people who served it… Blank lines start a new paragraph."
            />
          </Field>

          <SectionLabel>Photos</SectionLabel>
          {form.history_photos.length > 0 && (
            <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
              {form.history_photos.map((p, i) => (
                <li key={p.url} className="flex items-center gap-3 border border-parish-line2 rounded-xl p-2 bg-parish-field">
                  <img src={p.url} alt="" className="w-[88px] h-[60px] flex-none rounded-lg object-cover" />
                  <TextInput value={p.caption} onChange={(e) => updatePhoto(i, { caption: e.target.value })} placeholder="Caption (optional)" aria-label={`Caption for photo ${i + 1}`} className="flex-1 !py-2" />
                  <div className="flex gap-1">
                    <RowButton tone="gray" disabled={i === 0} onClick={() => movePhoto(i, -1)} aria-label="Move up">↑</RowButton>
                    <RowButton tone="gray" disabled={i === form.history_photos.length - 1} onClick={() => movePhoto(i, 1)} aria-label="Move down">↓</RowButton>
                    <RowButton tone="red" onClick={() => removePhoto(i)}>Remove</RowButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <FilePick multiple label="+ Add photos" onFiles={addPhotos} disabled={uploading > 0} />
            {uploading > 0 && <span className="text-[13px] text-parish-muted">Uploading {uploading} photo(s)…</span>}
            {!uploading && !form.history_photos.length && <span className="text-[12.5px] text-parish-muted">The chapel then and now, the founders, feasts. Pick several at once.</span>}
          </div>

          <PublishSwitch checked={!!form.history_published} onChange={(v) => setForm((f) => ({ ...f, history_published: v }))} />
          <div className="-mt-2 text-[12.5px] text-parish-muted">Published, it shows on the GKK's page under Komunidad → Mga GKK.</div>
        </>
      )}

      {tab === 'documents' && !isNew && <GkkDocuments gkk={{ id: initial.id, name: initial.original }} />}
    </SidePanel>
  );
}
