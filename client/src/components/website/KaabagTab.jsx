import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { useAsyncData, useUrlState } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Badge, Checkbox, ComboInput, Field, GhostButton, PrimaryButton, Select, TextInput } from '../ui.jsx';
import { EmptyState, ErrorState, FilterSelect, LoadingState, Modal, TAB_BAR, tabClass } from '../admin.jsx';
import { useViewOnly } from '../panels.jsx';
import { HolderAvatar } from '../orgchart/NodePanel.jsx';
import { usePhotoUploads } from '../orgchart/usePhotoUploads.js';
import { AddButton, FilePick, Panel, PhotoSizeHint, RowButton, SectionLabel, SidePanel, TabIntro, UploadOverlay } from './shared.jsx';
import { DAYS, DEFAULT_LOCATION, fmtTime, todayIso } from '../../lib/website.js';
import {
  DEFAULT_FILL, FILL_TYPES, addMonths, mergeSlots, monthChoices, monthDates, monthOf, monthTitleEn, moved, notListed, registryName,
  rotate, slotsByDate, slotsError, slotsFromSchedule, sortDirectory, sortSlots, turnsOf,
} from '../../lib/kaabag.js';

const VIEWS = [['rotation', 'Mass Rotation'], ['directory', 'Directory']];
const URL_DEFAULTS = { view: 'rotation', month: '' };
const URL_ALLOWED = { view: VIEWS.map(([k]) => k) };
const DISCARD = { title: 'Leave without saving?', message: 'Your changes to this month’s rotation haven’t been saved.', tone: 'danger', confirmLabel: 'Leave', cancelLabel: 'Stay' };

/** "Sun, Nov 1" */
function dayLabel(iso) {
  const d = new Date(`${iso}T00:00`);
  return `${DAYS[d.getDay()].slice(0, 3)}, ${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`;
}

/**
 * Parish Website → Kaabag (0102): the website's Kaabag page. Mass Rotation
 * is who serves at each Mass, a month at a time, published when ready;
 * Directory is the Kaabag shown there with their photos. The Kaabag
 * Structure chart is kept in Organization Structure.
 */
export default function KaabagTab() {
  const confirm = useConfirm();
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const loaded = useAsyncData(api.listKaabagMembers, []);
  const [rows, setRows] = useState(null);
  const dirty = useRef(false);
  useEffect(() => { if (loaded.data) setRows(loaded.data.rows); }, [loaded.data]);

  // Closing or reloading the browser tab with an unsaved month: the browser asks first.
  useEffect(() => {
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const directory = useMemo(() => sortDirectory(rows || []), [rows]);
  const dir = { rows: directory, setRows, loading: !rows && loaded.loading, error: loaded.error, reload: loaded.reload };

  async function switchView(view) {
    if (view === url.view) return;
    if (dirty.current && !(await confirm(DISCARD))) return;
    dirty.current = false;
    setUrl({ view });
  }

  return (
    <>
      <div role="tablist" aria-label="Kaabag" className={`${TAB_BAR} mb-4`}>
        {VIEWS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={url.view === k} onClick={() => switchView(k)} className={tabClass(url.view === k)}>
            {label}
          </button>
        ))}
      </div>
      {url.view === 'directory'
        ? <DirectoryView dir={dir} />
        : <RotationView dir={dir} month={url.month} onMonth={(month) => setUrl({ month })} dirtyRef={dirty} onDirectory={() => switchView('directory')} />}
    </>
  );
}

// ---- Mass Rotation -----------------------------------------------------------

function RotationView({ dir, month: urlMonth, onMonth, dirtyRef, onDirectory }) {
  const toast = useToast();
  const confirm = useConfirm();
  const viewOnly = useViewOnly();
  const today = todayIso();
  const month = /^\d{4}-\d{2}-01$/.test(urlMonth || '') ? urlMonth : monthOf(today);
  const months = useAsyncData(api.listKaabagMonths, []);
  const loaded = useAsyncData(() => api.getKaabagMonth(month), [month]);
  const schedule = useAsyncData(api.listMassSchedules, []);
  const [form, setForm] = useState(null);
  const saved = useRef('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // 'fill' | 'rotate' | { slot index or -1 for a new Mass }

  useEffect(() => {
    if (loaded.data?.month !== month) return;
    const f = { slots: loaded.data.slots, note: loaded.data.note, published: loaded.data.published };
    saved.current = JSON.stringify(f);
    setForm(f);
    setError('');
  }, [loaded.data, month]);

  const dirty = !!form && JSON.stringify(form) !== saved.current;
  useEffect(() => { dirtyRef.current = dirty; }, [dirty, dirtyRef]);
  useEffect(() => () => { dirtyRef.current = false; }, [dirtyRef]);

  const info = new Map((months.data || []).map((m) => [m.month, m]));
  const choices = monthChoices(today, [...info.keys(), month]);
  const byId = useMemo(() => new Map(dir.rows.map((k) => [k.id, k])), [dir.rows]);
  const locations = useMemo(() => {
    const set = new Set([DEFAULT_LOCATION, ...(schedule.data?.rows || []).map((r) => r.location).filter(Boolean), ...(form?.slots || []).map((s) => s.location).filter(Boolean)]);
    return [...set].sort((a, b) => (a === DEFAULT_LOCATION ? -1 : b === DEFAULT_LOCATION ? 1 : a.localeCompare(b)));
  }, [schedule.data, form]);

  async function goTo(m) {
    if (m === month) return;
    if (dirty && !(await confirm(DISCARD))) return;
    dirtyRef.current = false;
    setForm(null);
    onMonth(m === monthOf(today) ? '' : m);
  }

  const setSlots = (fn) => setForm((f) => ({ ...f, slots: fn(f.slots) }));
  const patchSlot = (i, patch) => setSlots((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    const problem = slotsError(form.slots, month);
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    try {
      await api.saveKaabagMonth(month, { slots: form.slots, published: form.published, note: form.note });
      const f = { ...form, note: form.note.trim(), slots: sortSlots(form.slots) };
      saved.current = JSON.stringify(f);
      setForm(f);
      months.reload();
      toast.success(form.published ? `${monthTitleEn(month)} saved. The website shows it now.` : `${monthTitleEn(month)} saved as a draft.`);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setForm(JSON.parse(saved.current));
    setError('');
  }

  const state = info.get(month);
  const status = !state ? <Badge tone="gray">Not started</Badge> : state.published ? <Badge tone="green">On the website</Badge> : <Badge tone="gray">Draft</Badge>;
  const ready = form && loaded.data?.month === month;
  const editing = typeof dialog === 'number' ? dialog : null;

  return (
    <>
      <TabIntro text="Who serves at each Mass, a month at a time. Fill the month from the Mass schedule, then pick the Kaabag for each Mass, or let Rotate hand out turns in the directory's order. The website shows a month once it's published, from last month on." />

      <div className="flex items-center gap-2 flex-wrap mb-4">
        <RowButton tone="gray" className="!py-2.5" aria-label="Previous month" disabled={!ready} onClick={() => goTo(addMonths(month, -1))}>‹</RowButton>
        <FilterSelect aria-label="Month" value={month} onChange={(e) => goTo(e.target.value)}>
          {choices.map((m) => {
            const i = info.get(m);
            return <option key={m} value={m}>{monthTitleEn(m)}{i ? (i.published ? ' · on the website' : ' · draft') : ''}</option>;
          })}
        </FilterSelect>
        <RowButton tone="gray" className="!py-2.5" aria-label="Next month" disabled={!ready} onClick={() => goTo(addMonths(month, 1))}>›</RowButton>
        {status}
        {dirty && <Badge tone="gold">Unsaved changes</Badge>}
      </div>

      {loaded.error ? <Panel><ErrorState message={loaded.error} onRetry={loaded.reload} /></Panel> : !ready ? <Panel><LoadingState label="Loading the month…" /></Panel> : (
        <>
          {!viewOnly && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <PrimaryButton type="button" onClick={() => setDialog('fill')} className="px-4 py-2.5 text-[14px]">Fill from Mass schedule</PrimaryButton>
              <GhostButton type="button" onClick={() => setDialog(-1)} className="px-4 py-2 text-[14px]">+ Add Mass</GhostButton>
              <GhostButton type="button" onClick={() => setDialog('rotate')} disabled={!form.slots.length || !dir.rows.length} className="px-4 py-2 text-[14px] disabled:opacity-50 disabled:cursor-not-allowed">Rotate Kaabag</GhostButton>
            </div>
          )}

          {!dir.loading && !dir.rows.length && (
            <Panel className="px-5 py-4 mb-4 text-[13.5px] text-parish-text2">
              The directory is empty, so there's nobody to pick yet.{' '}
              {!viewOnly && <button type="button" onClick={onDirectory} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-parish-blue hover:underline">Add the Kaabag to the directory first.</button>}
            </Panel>
          )}

          <Panel className="overflow-hidden mb-4">
            {!form.slots.length ? (
              <EmptyState title={`No Masses in ${monthTitleEn(month)} yet`} subtitle={viewOnly ? 'Nothing has been planned for this month.' : 'Fill the month from the Mass schedule, or add a Mass.'} />
            ) : slotsByDate(form.slots.map((s, i) => ({ ...s, i }))).map((day) => (
              <div key={day.date} className="border-b border-parish-line last:border-b-0">
                <div className="px-5 pt-3.5 pb-1 font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{dayLabel(day.date)}{day.date === today ? ' · today' : ''}</div>
                {day.slots.map((s) => (
                  <SlotRow
                    key={s.i} slot={s} byId={byId} directory={dir.rows} viewOnly={viewOnly}
                    onServers={(servers) => patchSlot(s.i, { servers })}
                    onEdit={() => setDialog(s.i)}
                    onRemove={() => setSlots((ss) => ss.filter((_, j) => j !== s.i))}
                  />
                ))}
              </div>
            ))}
          </Panel>

          {form.slots.length > 0 && dir.rows.length > 0 && <Turns slots={form.slots} directory={dir.rows} />}

          <Panel className="px-5 py-4 flex flex-col gap-3">
            <Field label="Note above the month on the website (optional)">
              <TextInput value={form.note} disabled={viewOnly} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Can't make your turn? Swap with another Kaabag and tell the president." />
            </Field>
            <label className={`flex items-start gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-field ${viewOnly ? '' : 'cursor-pointer'}`}>
              <input type="checkbox" disabled={viewOnly} checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} className="w-[19px] h-[19px] mt-0.5 accent-parish-blue cursor-pointer" />
              <span>
                <span className="block font-semibold text-[14px] text-parish-navy">Show {monthTitleEn(month)} on the website</span>
                <span className="block text-[12.5px] text-parish-muted">Leave unticked to keep it as a draft only staff can see.</span>
              </span>
            </label>
            {error && <div role="alert" className="text-parish-error text-[13.5px] font-medium">{error}</div>}
            {!viewOnly && (
              <div className="flex gap-2.5 justify-end flex-wrap">
                <GhostButton type="button" onClick={discard} disabled={!dirty || saving} className="px-5 py-2.5 text-[14px] disabled:opacity-50 disabled:cursor-not-allowed">Discard</GhostButton>
                <PrimaryButton type="button" onClick={save} disabled={!dirty || saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : `Save ${monthTitleEn(month)}`}</PrimaryButton>
              </div>
            )}
          </Panel>
        </>
      )}

      {dialog === 'fill' && (
        <FillDialog
          month={month} schedule={schedule} existing={form.slots}
          onClose={() => setDialog(null)}
          onFill={(extra) => { setSlots((ss) => mergeSlots(ss, extra)); setDialog(null); }}
        />
      )}
      {dialog === 'rotate' && (
        <RotateDialog
          slots={form.slots} directory={dir.rows}
          onClose={() => setDialog(null)}
          onRotate={(next) => { setSlots(() => next); setDialog(null); }}
        />
      )}
      {editing !== null && (
        <MassDialog
          month={month} locations={locations} slot={editing >= 0 ? form.slots[editing] : null}
          onClose={() => setDialog(null)}
          onSave={(slot) => {
            setSlots((ss) => sortSlots(editing >= 0 ? ss.map((s, j) => (j === editing ? { ...s, ...slot } : s)) : [...ss, { ...slot, servers: [] }]));
            setDialog(null);
          }}
        />
      )}
    </>
  );
}

/** One Mass in the month: when and where, its Kaabag (each with ×), and a list to add another. */
function SlotRow({ slot, byId, directory, viewOnly, onServers, onEdit, onRemove }) {
  const free = directory.filter((k) => !slot.servers.includes(k.id));
  return (
    <div className="flex items-start gap-3 px-5 py-3 flex-wrap border-t border-parish-line first:border-t-0">
      <div className="w-[84px] font-serif text-[20px] font-semibold text-parish-blue">{fmtTime(slot.time)}</div>
      <div className="flex-1 min-w-[220px]">
        <div className="font-semibold text-[14.5px] text-parish-navy">{slot.location || 'No place given'}{slot.note ? ` · ${slot.note}` : ''}</div>
        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
          {!slot.servers.length && <span className="text-[13px] italic text-parish-muted">No Kaabag yet</span>}
          {slot.servers.map((id) => {
            const k = byId.get(id);
            return (
              <span key={id} className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border border-parish-borderSoft bg-parish-field text-[13px] font-semibold text-parish-navy">
                <HolderAvatar photo={k?.photo_url} name={k?.name || '?'} size={22} />
                {k?.name || 'Removed from the directory'}
                {!viewOnly && (
                  <button type="button" aria-label={`Take ${k?.name || 'them'} off this Mass`} onClick={() => onServers(slot.servers.filter((x) => x !== id))} className="appearance-none border-none bg-transparent cursor-pointer p-0 ml-0.5 text-parish-muted hover:text-parish-error text-[15px] leading-none">×</button>
                )}
              </span>
            );
          })}
          {!viewOnly && free.length > 0 && (
            <FilterSelect aria-label="Add a Kaabag to this Mass" value="" onChange={(e) => { if (e.target.value) onServers([...slot.servers, Number(e.target.value)]); }} className="!py-1 !text-[13px]">
              <option value="">+ Add Kaabag</option>
              {free.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </FilterSelect>
          )}
        </div>
      </div>
      {!viewOnly && (
        <div className="flex gap-1.5">
          <RowButton onClick={onEdit}>Edit</RowButton>
          <RowButton tone="red" onClick={onRemove}>Remove</RowButton>
        </div>
      )}
    </div>
  );
}

/** How many Masses each Kaabag serves at this month, so the turns can be kept fair. */
function Turns({ slots, directory }) {
  const turns = turnsOf(slots);
  const rows = [...directory].sort((a, b) => (turns.get(b.id) || 0) - (turns.get(a.id) || 0) || a.name.localeCompare(b.name));
  return (
    <Panel className="px-5 py-4 mb-4">
      <SectionLabel>Turns this month</SectionLabel>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {rows.map((k) => {
          const n = turns.get(k.id) || 0;
          return (
            <span key={k.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[13px] font-semibold ${n ? 'border-parish-borderSoft bg-parish-field text-parish-navy' : 'border-dashed border-parish-borderStrong text-parish-muted'}`}>
              {k.name}<span className="font-bold text-parish-blue">{n}</span>
            </span>
          );
        })}
      </div>
    </Panel>
  );
}

/** Fill from the Mass schedule: which kinds of Mass, and where; the month's Masses already there stay. */
function FillDialog({ month, schedule, existing, onClose, onFill }) {
  const [types, setTypes] = useState(DEFAULT_FILL);
  const [location, setLocation] = useState('all');
  const rows = schedule.data?.rows || [];
  const places = [...new Set(rows.filter((r) => r.published !== false).map((r) => r.location).filter(Boolean))].sort();
  const found = slotsFromSchedule(rows, month, { types, location });
  const adds = mergeSlots(existing, found).length - existing.length;
  const toggle = (t) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));

  return (
    <Modal title={`Fill ${monthTitleEn(month)}`} onClose={onClose} maxWidth={520}>
      {schedule.loading && !schedule.data ? <LoadingState compact label="Loading the Mass schedule…" />
        : schedule.error ? <ErrorState message={schedule.error} onRetry={schedule.reload} />
          : (
            <div className="flex flex-col gap-4">
              <p className="m-0 text-[13.5px] text-parish-muted">Adds the month's Masses from the published Mass schedule (Parish Website → Mass Schedule). Masses already in the month stay as they are.</p>
              <fieldset className="border-none p-0 m-0">
                <legend className="block font-semibold text-[12.5px] text-parish-ink mb-1.5 tracking-wide">Masses</legend>
                <div className="flex flex-col gap-2">
                  {FILL_TYPES.map(([t, label]) => (
                    <label key={t} className="flex items-center gap-2.5 cursor-pointer text-[14px] text-parish-navy">
                      <Checkbox checked={types.includes(t)} onChange={() => toggle(t)} />{label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {places.length > 1 && (
                <Field label="Where">
                  <Select value={location} onChange={(e) => setLocation(e.target.value)}>
                    <option value="all">Every church and chapel</option>
                    {places.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </Field>
              )}
              <div className="text-[13.5px] font-semibold text-parish-text2" role="status">
                {!rows.length ? 'The Mass schedule is empty. Add the Masses under Parish Website → Mass Schedule, or add them here one by one.'
                  : adds ? `${adds} Mass${adds === 1 ? '' : 'es'} to add.` : 'Nothing new to add: these Masses are in the month already.'}
              </div>
              <div className="flex gap-2.5 justify-end">
                <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
                <PrimaryButton type="button" disabled={!adds} onClick={() => onFill(found)} className="px-6 py-2.5 text-[14px]">Add {adds || ''} Mass{adds === 1 ? '' : 'es'}</PrimaryButton>
              </div>
            </div>
          )}
    </Modal>
  );
}

/** Rotate: hand out turns in the directory's order to the Masses with nobody yet. */
function RotateDialog({ slots, directory, onClose, onRotate }) {
  const [perMass, setPerMass] = useState(2);
  const [start, setStart] = useState(directory[0]?.id || 0);
  const [shownOnly, setShownOnly] = useState(false);
  const pool = directory.filter((k) => !shownOnly || k.published);
  const from = Math.max(0, pool.findIndex((k) => k.id === Number(start)));
  const ids = [...pool.slice(from), ...pool.slice(0, from)].map((k) => k.id);
  const empty = slots.filter((s) => !s.servers.length).length;

  return (
    <Modal title="Rotate Kaabag" onClose={onClose} maxWidth={500}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[13.5px] text-parish-muted">
          Gives the {empty} Mass{empty === 1 ? '' : 'es'} with no Kaabag yet their turns, in the directory's order, so everyone serves before anyone serves twice. Masses that already have Kaabag keep them. Nothing is saved until you press Save.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kaabag per Mass">
            <Select value={perMass} onChange={(e) => setPerMass(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Start with">
            <Select value={start} onChange={(e) => setStart(Number(e.target.value))}>
              {pool.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer text-[14px] text-parish-navy">
          <Checkbox checked={shownOnly} onChange={(e) => setShownOnly(e.target.checked)} />
          Only those shown in the directory on the website
        </label>
        <div className="flex gap-2.5 justify-end">
          <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
          <PrimaryButton type="button" disabled={!empty || !ids.length} onClick={() => onRotate(rotate(slots, ids, perMass))} className="px-6 py-2.5 text-[14px]">Rotate</PrimaryButton>
        </div>
      </div>
    </Modal>
  );
}

/** Add a Mass to the month, or change one's date, time, place or note. */
function MassDialog({ month, locations, slot, onClose, onSave }) {
  const days = monthDates(month);
  const [form, setForm] = useState(() => ({ date: slot?.date || '', time: slot?.time || '', location: slot?.location ?? DEFAULT_LOCATION, note: slot?.note || '' }));
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e) {
    e.preventDefault();
    if (!form.date || monthOf(form.date) !== month) { setError(`Choose a day in ${monthTitleEn(month)}.`); return; }
    if (!form.time) { setError('Choose the time.'); return; }
    onSave({ date: form.date, time: form.time, location: form.location.trim(), note: form.note.trim() });
  }

  return (
    <Modal title={slot ? 'Edit Mass' : 'Add a Mass'} onClose={onClose} maxWidth={500}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <TextInput type="date" value={form.date} min={days[0]} max={days[days.length - 1]} onChange={(e) => set('date')(e.target.value)} />
          </Field>
          <Field label="Time" required><TextInput type="time" value={form.time} onChange={(e) => set('time')(e.target.value)} /></Field>
        </div>
        <Field label="Place">
          <ComboInput options={locations} value={form.location} onChange={set('location')} maxLength={120} placeholder="Main church, or a chapel name" toggleLabel="Show places" />
        </Field>
        <Field label="Note (optional)">
          <TextInput value={form.note} maxLength={200} onChange={(e) => set('note')(e.target.value)} placeholder="e.g. Fiesta Mass, or Bring the white uniform" />
        </Field>
        {error && <div role="alert" className="text-parish-error text-[13.5px] font-medium">{error}</div>}
        <div className="flex gap-2.5 justify-end">
          <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
          <PrimaryButton type="submit" className="px-6 py-2.5 text-[14px]">{slot ? 'Done' : 'Add Mass'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

// ---- Directory ---------------------------------------------------------------

function DirectoryView({ dir }) {
  const toast = useToast();
  const confirm = useConfirm();
  const viewOnly = useViewOnly();
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const rows = dir.rows;

  const upsert = (saved) => dir.setRows((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [...rs, saved]));

  async function move(i, d) {
    const ids = moved(rows, i, d);
    setBusy('order');
    try {
      await api.reorderKaabagMembers(ids);
      const order = new Map(ids.map((id, n) => [id, n + 1]));
      dir.setRows((rs) => rs.map((r) => ({ ...r, sort_order: order.get(r.id) ?? r.sort_order })));
    } catch (e) {
      toast.error(e.message || 'Could not change the order');
    } finally {
      setBusy(null);
    }
  }

  async function toggle(k) {
    setBusy(k.id);
    try {
      upsert(await api.setKaabagPublished(k.id, !k.published));
      toast.success(k.published ? `${k.name} is off the website's directory` : `${k.name} is in the website's directory`);
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusy(null);
    }
  }

  async function remove(k) {
    const ok = await confirm({
      title: `Delete ${k.name}?`,
      message: 'They come off the directory and off every month’s rotation, and their photo is deleted. To keep them off the website only, hide them instead.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(k.id);
    try {
      await api.deleteKaabagMember(k.id);
      dir.setRows((rs) => rs.filter((r) => r.id !== k.id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message || 'Could not delete this');
    } finally {
      setBusy(null);
    }
  }

  const nextOrder = rows.length ? Math.max(...rows.map((r) => r.sort_order || 0)) + 1 : 1;

  return (
    <>
      <TabIntro text="The Kaabag the website's Kaabag page lists, with their photos, in this order. Add them from the registry (the members in the Kaabag ministry) or type a name. Only those shown are listed in the directory; on a published rotation everyone is named, with their photo only when shown here.">
        {!viewOnly && <GhostButton type="button" onClick={() => setAdding(true)} className="px-4 py-2 text-[14px] whitespace-nowrap">Add from registry</GhostButton>}
        <AddButton onClick={() => setEditing({ name: '', role: '', photo_url: '', published: false, sort_order: nextOrder })}>Add name</AddButton>
      </TabIntro>

      <Panel className="overflow-hidden">
        {dir.loading ? <LoadingState /> : dir.error ? <ErrorState message={dir.error} onRetry={dir.reload} /> : !rows.length ? (
          <EmptyState title="No Kaabag in the directory yet" subtitle="Add them from the registry, or type a name." />
        ) : rows.map((k, i) => (
          <div key={k.id} className="flex items-center gap-3 px-5 py-3 border-b border-parish-line last:border-b-0 flex-wrap">
            <HolderAvatar photo={k.photo_url} name={k.name} size={44} />
            <div className="flex-1 min-w-[180px]">
              <div className="font-semibold text-[15px] text-parish-navy">{k.name}</div>
              <div className="text-[12.5px] text-parish-muted">{[k.role, k.member_id ? 'In the registry' : 'Typed name', k.photo_url ? '' : 'No photo'].filter(Boolean).join(' · ')}</div>
            </div>
            <Badge tone={k.published ? 'green' : 'gray'}>{k.published ? 'Shown' : 'Hidden'}</Badge>
            <div className="flex gap-1.5 flex-wrap">
              <RowButton tone="gray" aria-label={`Move ${k.name} up`} disabled={i === 0 || !!busy} onClick={() => move(i, -1)}>↑</RowButton>
              <RowButton tone="gray" aria-label={`Move ${k.name} down`} disabled={i === rows.length - 1 || !!busy} onClick={() => move(i, 1)}>↓</RowButton>
              <RowButton onClick={() => setEditing(k)} viewLabel="View">Edit</RowButton>
              <RowButton tone="gray" disabled={busy === k.id} onClick={() => toggle(k)}>{k.published ? 'Hide' : 'Show'}</RowButton>
              <RowButton tone="red" disabled={busy === k.id} onClick={() => remove(k)}>Delete</RowButton>
            </div>
          </div>
        ))}
      </Panel>

      {editing && <KaabagEditor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { upsert(saved); setEditing(null); }} />}
      {adding && (
        <RegistryDialog
          directory={rows} startOrder={nextOrder}
          onClose={() => setAdding(false)}
          onAdded={(added) => { dir.setRows((rs) => [...rs, ...added]); setAdding(false); }}
        />
      )}
    </>
  );
}

/** One directory entry: name, role, photo and whether the website shows it. */
function KaabagEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const photos = usePhotoUploads();
  const [form, setForm] = useState({ ...row, role: row.role || '', photo_url: row.photo_url || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function pick([file]) {
    setError('');
    try {
      const url = await photos.upload(file);
      if (form.photo_url !== row.photo_url) photos.drop(form.photo_url);
      set('photo_url')(url);
    } catch (e) {
      setError(e.message || 'Could not upload the photo');
    }
  }

  function removePhoto() {
    if (form.photo_url !== row.photo_url) photos.drop(form.photo_url);
    set('photo_url')('');
  }

  function close() {
    photos.forget();
    onClose();
  }

  async function save() {
    if (photos.uploading) { setError('Wait for the photo to finish uploading.'); return; }
    if (!form.name.trim()) { setError('Type the name.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveKaabagMember({ id: row.id, name: form.name, role: form.role, photo_url: form.photo_url, published: !!form.published, ...(row.id ? {} : { sort_order: row.sort_order }) });
      photos.forget([saved.photo_url]);
      // The photo it had before, replaced or taken off.
      if (row.photo_url && row.photo_url !== saved.photo_url) api.deleteImage(row.photo_url).catch(() => {});
      toast.success(`${saved.name} saved`);
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.id ? 'Edit Kaabag' : 'Add a Kaabag'} subtitle="Ang Simbahan → Kaabag on the website" onClose={close} onSave={save} saving={saving} error={error}>
      <Field label="Name" required><TextInput value={form.name} maxLength={120} onChange={(e) => set('name')(e.target.value)} placeholder="As it should show on the website" /></Field>
      {row.member_id && <p className="m-0 -mt-2 text-[12.5px] text-parish-muted">Linked to their member record in the registry. The name here is the one the website shows.</p>}
      <Field label="Role (optional)"><TextInput value={form.role} maxLength={80} onChange={(e) => set('role')(e.target.value)} placeholder="e.g. Presidente, Grupo 1" /></Field>

      <SectionLabel>Photo</SectionLabel>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative">
          <HolderAvatar photo={form.photo_url} name={form.name} size={88} />
          <UploadOverlay busy={photos.uploading} round />
        </div>
        <div className="flex flex-col gap-2 items-start flex-1 min-w-[200px]">
          <FilePick label={form.photo_url ? 'Replace photo' : 'Upload photo'} onFiles={pick} busy={photos.uploading} />
          {form.photo_url && !photos.uploading && <button type="button" onClick={removePhoto} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error">Remove photo</button>}
          <PhotoSizeHint kind="portrait" />
          <span className="text-[12px] text-parish-muted max-w-[300px]">With no photo, the website shows their initials.</span>
        </div>
      </div>

      <label className="flex items-start gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-field cursor-pointer">
        <input type="checkbox" checked={!!form.published} onChange={(e) => set('published')(e.target.checked)} className="w-[19px] h-[19px] mt-0.5 accent-parish-blue cursor-pointer" />
        <span>
          <span className="block font-semibold text-[14px] text-parish-navy">Show in the directory on the website</span>
          <span className="block text-[12.5px] text-parish-muted">Their name and photo, for anyone to see. Ask them first.</span>
        </span>
      </label>
    </SidePanel>
  );
}

/** Add from the registry: the members in the Kaabag ministry not in the directory yet. */
function RegistryDialog({ directory, startOrder, onClose, onAdded }) {
  const toast = useToast();
  const q = useAsyncData(api.listKaabagRegistry, []);
  const left = useMemo(() => notListed(q.data?.rows || [], directory), [q.data, directory]);
  const [picked, setPicked] = useState(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = picked || new Set(left.map((m) => m.id));
  const toggle = (id) => setPicked(() => { const s = new Set(chosen); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  async function add() {
    const members = left.filter((m) => chosen.has(m.id));
    if (!members.length) return;
    setBusy(true);
    setError('');
    try {
      let added = await api.addKaabagFromRegistry(members, startOrder);
      if (show) added = await Promise.all(added.map((k) => api.setKaabagPublished(k.id, true)));
      toast.success(`${added.length} added to the directory`);
      onAdded(added);
    } catch (e) {
      setError(e.message || 'Could not add them');
      setBusy(false);
    }
  }

  return (
    <Modal title="Add from the registry" onClose={onClose} maxWidth={560}>
      {q.loading && !q.data ? <LoadingState compact label="Loading the Kaabag ministry…" />
        : q.error ? <ErrorState message={q.error} onRetry={q.reload} />
          : !q.data?.ministry ? <p className="m-0 text-[14px] text-parish-text2">There's no Kaabag ministry in the ministry list (Settings → Ministries & Organizations), so there's nobody to add from the registry. Type the names instead.</p>
            : !left.length ? <p className="m-0 text-[14px] text-parish-text2">Everyone in the {q.data.ministry} ministry is in the directory already. Add a member to the ministry in their record first, or type a name.</p>
              : (
                <div className="flex flex-col gap-4">
                  <p className="m-0 text-[13.5px] text-parish-muted">The members in the {q.data.ministry} ministry who aren't in the directory yet. They're added at the end, with their name as the registry has it.</p>
                  <div className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="font-semibold text-parish-text2">{chosen.size} of {left.length} picked</span>
                    <span className="flex gap-3">
                      <button type="button" onClick={() => setPicked(new Set(left.map((m) => m.id)))} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-parish-blue">All</button>
                      <button type="button" onClick={() => setPicked(new Set())} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-parish-blue">None</button>
                    </span>
                  </div>
                  <ul className="list-none m-0 p-0 max-h-[46vh] overflow-y-auto border border-parish-line2 rounded-xl divide-y divide-parish-line">
                    {left.map((m) => (
                      <li key={m.id}>
                        <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer text-[14px] text-parish-navy">
                          <Checkbox checked={chosen.has(m.id)} onChange={() => toggle(m.id)} />
                          {registryName(m)}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <label className="flex items-center gap-2.5 cursor-pointer text-[14px] text-parish-navy">
                    <Checkbox checked={show} onChange={(e) => setShow(e.target.checked)} />
                    Show them in the directory on the website now
                  </label>
                  {error && <div role="alert" className="text-parish-error text-[13.5px] font-medium">{error}</div>}
                  <div className="flex gap-2.5 justify-end">
                    <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
                    <PrimaryButton type="button" disabled={busy || !chosen.size} onClick={add} className="px-6 py-2.5 text-[14px]">{busy ? 'Adding…' : `Add ${chosen.size}`}</PrimaryButton>
                  </div>
                </div>
              )}
    </Modal>
  );
}
