import React, { useEffect, useMemo, useState } from 'react';
import { useUrlState } from '../../hooks.js';
import { api } from '../../api.js';
import { Field, TextInput, Select, ComboInput, Badge, Checkbox } from '../ui.jsx';
import { FilterSelect, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { fmtDate } from '../../constants.js';
import {
  DAYS, MASS_KINDS, MASS_LANGUAGES, DEFAULT_LOCATION, WEEKDAYS, SPECIAL_OCCASIONS, fmtTime, toTimeInput,
  massType, groupDaily, dayList, isCurrentMass, findOccasion, nextOccasionDates, dayOfDate,
} from '../../lib/website.js';
import { useContentList, SidePanel, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton } from './shared.jsx';

/** When an entry is held, in English: "Mon–Sat", "Tue, Dec 8, 2026", "Dec 16, 2026 – Dec 24, 2026", "Saturday". */
function whenText(r) {
  if (r.days) return dayList(r.days);
  if (r.mass_date) {
    const start = String(r.mass_date).slice(0, 10);
    const end = String(r.mass_end_date || '').slice(0, 10);
    if (end && end !== start) return `${fmtDate(start)} – ${fmtDate(end)}`;
    return `${DAYS[dayOfDate(start)].slice(0, 3)}, ${fmtDate(start)}`;
  }
  return massType(r) === 'Regular Mass' ? 'Every Sunday' : `Every ${DAYS[r.day_of_week]}`;
}

const kindTitle = (r) => (massType(r) === 'Special Mass' ? r.occasion || 'Special Mass' : massType(r));
const describe = (r) => `${kindTitle(r)} · ${whenText(r)} ${fmtTime(r.start_time)}`;

/** Weekly entries Monday first, then time; dated ones after, by date. */
function byWhen(a, b) {
  if (!!a.mass_date !== !!b.mass_date) return a.mass_date ? 1 : -1;
  if (a.mass_date) return String(a.mass_date).localeCompare(String(b.mass_date)) || a.start_time.localeCompare(b.start_time);
  const day = (r) => (r.days ? (r.days[0] + 6) % 7 : (r.day_of_week + 6) % 7);
  return day(a) - day(b) || a.start_time.localeCompare(b.start_time);
}

const SECTIONS = [
  ['Regular Mass (Sunday)', (t) => t === 'Regular Mass', 'Add the Sunday Masses.'],
  ['Daily Mass', (t) => t === 'Daily Mass', 'Add the weekday Masses; one entry can cover several days.'],
  ['Special Masses', (t) => t === 'Special Mass', 'Holy days of obligation, feasts, the patronal fiesta, Simbang Gabi…'],
  ['Other Masses & services', (t) => !['Regular Mass', 'Daily Mass', 'Special Mass'].includes(t), 'Anticipated and GKK Masses, confession and adoration.'],
];

const URL_DEFAULTS = { location: 'All', language: 'All' };
const URL_ALLOWED = { language: ['All', ...MASS_LANGUAGES] };

export default function MassScheduleTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useContentList({ table: 'mass_schedules', load: api.listMassSchedules, remove: api.deleteMassSchedule, describe });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [gkks, setGkks] = useState([]);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { location, language } = url;
  const setLocation = (v) => setUrl({ location: v });
  const setLanguage = (v) => setUrl({ language: v });

  useEffect(() => { api.listGkks().then((r) => setGkks(r.rows.map((g) => g.name))).catch(() => {}); }, []);

  const locations = useMemo(() => {
    const set = new Set([DEFAULT_LOCATION, ...list.rows.map((r) => r.location).filter(Boolean)]);
    return [...set].sort((a, b) => (a === DEFAULT_LOCATION ? -1 : b === DEFAULT_LOCATION ? 1 : a.localeCompare(b)));
  }, [list.rows]);

  const shown = list.rows.filter((r) => (location === 'All' || r.location === location) && (language === 'All' || r.language === language));
  // A Daily Mass on several days is one entry, so it's edited, published and deleted together.
  const entries = groupDaily(shown);
  const sections = SECTIONS.map(([title, match, hint]) => ({ title, hint, rows: entries.filter((e) => match(massType(e))).sort(byWhen) }));

  const rowsOf = (e) => e.rows || [e];

  async function togglePublished(e) {
    setBusy(e.id);
    try {
      for (const r of rowsOf(e)) list.upsert(await api.setWebsitePublished('mass_schedules', r.id, !e.published));
      toast.success(e.published ? `${describe(e)} is now a draft` : `${describe(e)} is on the website`);
    } catch (err) {
      toast.error(err.message || 'Could not change this');
    } finally {
      setBusy(null);
    }
  }

  async function remove(e) {
    const ok = await confirm({
      title: `Delete “${describe(e)}”?`,
      message: rowsOf(e).length > 1
        ? `This deletes it on all ${rowsOf(e).length} days. To hide it without deleting, make it a draft instead.`
        : "This can't be undone. To hide it without deleting, make it a draft instead.",
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(e.id);
    const done = [];
    try {
      for (const r of rowsOf(e)) { await api.deleteMassSchedule(r.id); done.push(r.id); }
      toast.success('Deleted');
    } catch (err) {
      toast.error(err.message || 'Could not delete this');
    } finally {
      list.forget(done);
      setBusy(null);
    }
  }

  return (
    <>
      <TabIntro text="The parish's Masses: Sunday and daily Masses repeat every week; special Masses (feasts, holy days, the fiesta) are on their dates. Holy Week, fiesta or one-off changes to the usual times can also go in Announcements as a “Schedule change”.">
        <AddButton onClick={() => setEditing({ kind: 'Regular Mass', day_of_week: 0, start_time: '', location: DEFAULT_LOCATION, language: 'Bisaya', notes: '', published: true })}>
          Add time
        </AddButton>
      </TabIntro>

      {list.rows.length > 0 && (
        <div className="flex gap-2.5 flex-wrap mb-4">
          <FilterSelect value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Filter by location">
            <option value="All">All locations</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </FilterSelect>
          <FilterSelect value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Filter by language">
            <option value="All">All languages</option>
            {MASS_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </FilterSelect>
        </div>
      )}

      {list.loading ? <Panel><LoadingState /></Panel> : list.error ? <Panel><ErrorState message={list.error} onRetry={list.reload} /></Panel> : !list.rows.length ? (
        <Panel><EmptyState title="No Mass times yet" subtitle="Add the Sunday and daily Masses, then special Masses and confession times." /></Panel>
      ) : !shown.length ? (
        <Panel><EmptyState title="Nothing matches these filters" /></Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map((s) => (
            <Panel key={s.title}>
              <div className="px-5 pt-4 pb-1 font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{s.title}</div>
              {!s.rows.length && <div className="px-5 pb-4 text-[13px] text-parish-muted">{s.hint}</div>}
              {s.rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3 flex-wrap border-t border-parish-line first:border-t-0">
                  <div className="w-[84px] font-serif text-[20px] font-semibold text-parish-blue">{fmtTime(r.start_time)}</div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-[14.5px] text-parish-navy">{kindTitle(r)} · {r.location}</div>
                    <div className="text-[12.5px] text-parish-text2">{whenText(r)}{r.notes ? ` · ${r.notes}` : ''}</div>
                  </div>
                  {r.obligation && <Badge tone="gold">Obligation</Badge>}
                  <Badge tone="blue">{r.language}</Badge>
                  {!isCurrentMass(r) && <Badge tone="gray">Past</Badge>}
                  {!r.published && <StateBadge state="Draft" />}
                  <div className="flex gap-1.5">
                    <RowButton onClick={() => setEditing(r)}>Edit</RowButton>
                    <RowButton tone="gray" disabled={busy === r.id} onClick={() => togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
                    <RowButton tone="red" disabled={busy === r.id} onClick={() => remove(r)}>Delete</RowButton>
                  </div>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      )}

      {editing && (
        <MassEditor
          row={editing} locations={locations} gkks={gkks} onClose={() => setEditing(null)}
          onSaved={(saved, deleted) => { saved.forEach(list.upsert); list.forget(deleted); setEditing(null); }}
        />
      )}
    </>
  );
}

/** The editor's starting values for a row, or a grouped Daily Mass entry. */
function formFrom(row) {
  const kind = massType(row);
  return {
    kind,
    day_of_week: Number(row.day_of_week ?? 0),
    days: row.days ? [...row.days] : kind === 'Daily Mass' ? [row.day_of_week] : [...WEEKDAYS],
    start_time: toTimeInput(row.start_time),
    location: row.location || DEFAULT_LOCATION,
    language: row.language || 'Bisaya',
    notes: row.notes || '',
    published: row.published !== false,
    mass_date: row.mass_date ? String(row.mass_date).slice(0, 10) : '',
    mass_end_date: row.mass_end_date ? String(row.mass_end_date).slice(0, 10) : '',
    occasion: row.occasion || '',
    obligation: !!row.obligation,
    gkkWhen: row.mass_date ? 'date' : 'weekly',
  };
}

const OCCASION_NAMES = SPECIAL_OCCASIONS.flatMap(([, items]) => items.map((o) => o.name));

function MassEditor({ row, locations, gkks, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => formFrom(row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const existing = row.rows || (row.id ? [row] : []);
  const dated = form.kind === 'Special Mass' || (form.kind === 'GKK Mass' && form.gkkWhen === 'date');

  function setKind(kind) {
    setForm((f) => ({
      ...f,
      kind,
      day_of_week: kind === 'Regular Mass' ? 0 : kind === 'Anticipated Mass' && f.kind !== kind ? 6 : f.day_of_week,
      days: f.days.length ? f.days : [...WEEKDAYS],
      // Fields only some types use are cleared when switching away from them.
      occasion: kind === 'Special Mass' ? f.occasion : '',
      obligation: kind === 'Special Mass' ? f.obligation : false,
      mass_date: kind === 'Special Mass' || kind === 'GKK Mass' ? f.mass_date : '',
      mass_end_date: kind === 'Special Mass' ? f.mass_end_date : '',
      gkkWhen: kind === 'GKK Mass' ? f.gkkWhen : 'weekly',
    }));
  }

  function setOccasion(name) {
    const preset = findOccasion(name);
    const dates = nextOccasionDates(preset);
    setForm((f) => ({
      ...f,
      occasion: name,
      // A preset with a fixed date fills in its next one; staff can still change it.
      ...(dates ? { mass_date: dates.start, mass_end_date: dates.end } : {}),
      ...(preset ? { obligation: !!preset.obligation } : {}),
    }));
  }

  function toggleDay(d) {
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] }));
  }

  function validate() {
    if (!form.start_time) return 'Choose a time.';
    if (!String(form.location || '').trim()) return 'Enter the location, e.g. Main church or a chapel name.';
    if (form.kind === 'Daily Mass' && !form.days.length) return 'Tick at least one day.';
    if (form.kind === 'Special Mass' && !form.occasion.trim()) return 'Choose or type the occasion, e.g. Immaculate Conception.';
    if (dated && !form.mass_date) return 'Choose the date.';
    if (form.mass_end_date && form.mass_end_date < form.mass_date) return 'The last day can’t be before the first.';
    return '';
  }

  async function save() {
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    const base = {
      kind: form.kind,
      start_time: form.start_time,
      location: form.location.trim(),
      language: form.language,
      notes: form.notes.trim(),
      published: form.published,
      occasion: form.kind === 'Special Mass' ? form.occasion.trim() : '',
      obligation: form.kind === 'Special Mass' && form.obligation,
      mass_date: dated ? form.mass_date : '',
      mass_end_date: dated && form.kind === 'Special Mass' && form.mass_end_date !== form.mass_date ? form.mass_end_date : '',
    };
    const saved = [];
    const deleted = [];
    try {
      if (form.kind === 'Daily Mass') {
        // One row per ticked day: keep the rows already there, add new days,
        // reuse a leftover row (e.g. a changed type) before inserting, delete the rest.
        const byDay = new Map(existing.map((r) => [r.day_of_week, r]));
        const leftovers = existing.filter((r) => !form.days.includes(r.day_of_week));
        for (const d of WEEKDAYS.filter((x) => form.days.includes(x))) {
          const keep = byDay.get(d) || leftovers.shift();
          saved.push(await api.saveMassSchedule({ ...base, id: keep?.id, day_of_week: d }));
        }
        for (const r of leftovers) { await api.deleteMassSchedule(r.id); deleted.push(r.id); }
      } else {
        const day = dated ? dayOfDate(form.mass_date) : form.kind === 'Regular Mass' ? 0 : Number(form.day_of_week);
        const [first, ...rest] = existing;
        saved.push(await api.saveMassSchedule({ ...base, id: first?.id, day_of_week: day }));
        for (const r of rest) { await api.deleteMassSchedule(r.id); deleted.push(r.id); }
      }
      toast.success('Schedule saved');
      onSaved(saved, deleted);
    } catch (e) {
      const msg = e.message || '';
      // Before 0016 the new types and columns don't exist yet.
      setError(/kind_check|mass_date|occasion|obligation|schema cache/i.test(msg) ? 'Run the 0016_mass_types.sql migration in Supabase to use the new Mass types.' : msg || 'Could not save');
      if (saved.length || deleted.length) onSaved(saved, deleted);
    } finally {
      setSaving(false);
    }
  }

  const locationOptions = form.kind === 'GKK Mass' ? [...new Set([...gkks, ...locations])] : locations;

  return (
    <SidePanel title={row.id ? 'Edit time' : 'Add a time'} subtitle={dated ? 'On a date' : 'Repeats every week'} onClose={onClose} onSave={save} saving={saving} error={error}>
      <Field label="Type of Mass" required>
        <Select value={form.kind} onChange={(e) => setKind(e.target.value)}>
          {MASS_KINDS.map((k) => <option key={k} value={k}>{k === 'Regular Mass' ? 'Regular Mass (Sunday)' : k}</option>)}
        </Select>
      </Field>

      {form.kind === 'Special Mass' && (
        <>
          <Field label="Occasion" required>
            <ComboInput options={OCCASION_NAMES} value={form.occasion} onChange={setOccasion} placeholder="Pick a feast or type one" toggleLabel="Show occasions" />
          </Field>
          <label className="flex items-center gap-2.5 cursor-pointer text-[14px] font-semibold text-parish-navy">
            <Checkbox checked={form.obligation} onChange={(e) => set('obligation')(e.target.checked)} />
            Holy day of obligation
          </label>
        </>
      )}

      {form.kind === 'GKK Mass' && (
        <div role="radiogroup" aria-label="When is this GKK Mass?" className="flex gap-2 flex-wrap">
          {[['weekly', 'Every week'], ['date', 'On a date']].map(([v, label]) => (
            <label key={v} className={`cursor-pointer px-3.5 py-2 rounded-full border-[1.5px] text-[13px] font-semibold ${form.gkkWhen === v ? 'bg-parish-blue border-parish-blue text-white' : 'bg-parish-surface border-parish-borderSoft text-parish-text2'}`}>
              <input type="radio" name="gkk-when" className="sr-only" checked={form.gkkWhen === v} onChange={() => set('gkkWhen')(v)} />
              {label}
            </label>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {form.kind === 'Regular Mass' && (
          <Field label="Day"><TextInput value="Every Sunday" readOnly aria-readonly className="!bg-parish-field !text-parish-text2 cursor-default" /></Field>
        )}
        {dated && (
          <Field label={form.kind === 'Special Mass' ? 'Date (first day)' : 'Date'} required>
            <TextInput type="date" value={form.mass_date} onChange={(e) => set('mass_date')(e.target.value)} />
          </Field>
        )}
        {form.kind === 'Special Mass' && (
          <Field label="Until (optional)">
            <TextInput type="date" value={form.mass_end_date} min={form.mass_date || undefined} onChange={(e) => set('mass_end_date')(e.target.value)} />
          </Field>
        )}
        {!dated && !['Regular Mass', 'Daily Mass'].includes(form.kind) && (
          <Field label="Day" required>
            <Select value={form.day_of_week} onChange={(e) => set('day_of_week')(Number(e.target.value))}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Time" required><TextInput type="time" value={form.start_time} onChange={(e) => set('start_time')(e.target.value)} /></Field>
        <Field label="Language">
          <Select value={form.language} onChange={(e) => set('language')(e.target.value)}>
            {MASS_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Field>
      </div>

      {form.kind === 'Daily Mass' && (
        <fieldset className="border-none p-0 m-0">
          <legend className="block font-semibold text-[12.5px] text-parish-ink mb-1.5 tracking-wide">Days <span className="text-parish-gold">*</span></legend>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => {
              const on = form.days.includes(d);
              return (
                <label key={d} className={`cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-[1.5px] text-[13.5px] font-semibold ${on ? 'border-parish-blue bg-[var(--p-blue-tint)] text-parish-navy' : 'border-parish-borderSoft text-parish-text2'}`}>
                  <Checkbox checked={on} onChange={() => toggleDay(d)} className="w-4 h-4" />
                  {DAYS[d].slice(0, 3)}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {form.kind === 'Special Mass' && form.mass_end_date && form.mass_end_date !== form.mass_date && (
        <div className="text-[12.5px] text-parish-muted -mt-2">Held at this time every day from the first to the last day, like Simbang Gabi. For more times on the same day, add another entry with the same occasion.</div>
      )}

      <Field label="Location" required>
        <ComboInput options={locationOptions} value={form.location} onChange={set('location')} placeholder={form.kind === 'GKK Mass' ? 'Pick the GKK, or type a chapel' : 'Main church, or a chapel name'} toggleLabel="Show locations" />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="e.g. With Healing Mass, or Presided by the Bishop" maxLength={200} />
      </Field>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
