import React, { useMemo, useState } from 'react';
import { useUrlState } from '../../hooks.js';
import { api } from '../../api.js';
import { Field, TextInput, Select, ComboInput, Badge } from '../ui.jsx';
import { FilterSelect, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { useToast } from '../../ToastContext.jsx';
import { DAYS, MASS_KINDS, MASS_LANGUAGES, DEFAULT_LOCATION, fmtTime, toTimeInput } from '../../lib/website.js';
import { useContentList, SidePanel, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton } from './shared.jsx';

const describe = (r) => `${DAYS[r.day_of_week]} ${fmtTime(r.start_time)} ${r.kind}`;

const URL_DEFAULTS = { location: 'All', language: 'All' };
const URL_ALLOWED = { language: ['All', ...MASS_LANGUAGES] };

export default function MassScheduleTab() {
  const list = useContentList({ table: 'mass_schedules', load: api.listMassSchedules, remove: api.deleteMassSchedule, describe });
  const [editing, setEditing] = useState(null);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { location, language } = url;
  const setLocation = (v) => setUrl({ location: v });
  const setLanguage = (v) => setUrl({ language: v });

  const locations = useMemo(() => {
    const set = new Set([DEFAULT_LOCATION, ...list.rows.map((r) => r.location).filter(Boolean)]);
    return [...set].sort((a, b) => (a === DEFAULT_LOCATION ? -1 : b === DEFAULT_LOCATION ? 1 : a.localeCompare(b)));
  }, [list.rows]);

  const shown = list.rows.filter((r) => (location === 'All' || r.location === location) && (language === 'All' || r.language === language));
  const byDay = DAYS.map((day, i) => ({
    day,
    rows: shown.filter((r) => r.day_of_week === i).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  })).filter((d) => d.rows.length);

  return (
    <>
      <TabIntro text="The weekly Mass, confession and adoration times, for the main church and each chapel. Holy Week, fiesta or one-off changes go in Announcements as a “Schedule change”.">
        <AddButton onClick={() => setEditing({ day_of_week: 0, start_time: '', kind: 'Mass', location: DEFAULT_LOCATION, language: 'Bisaya', notes: '', published: true })}>
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

      <Panel>
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? (
          <EmptyState title="No Mass times yet" subtitle="Add the Sunday and weekday Masses, then confession times." />
        ) : !byDay.length ? (
          <EmptyState title="Nothing matches these filters" />
        ) : (
          byDay.map(({ day, rows }) => (
            <section key={day} className="border-b border-[#f1e8d5] last:border-b-0">
              <div className="px-5 pt-4 pb-1 font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{day}</div>
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  <div className="w-[84px] font-serif text-[20px] font-semibold text-parish-blue">{fmtTime(r.start_time)}</div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="font-semibold text-[14.5px] text-parish-navy">{r.kind} · {r.location}</div>
                    {r.notes && <div className="text-[12.5px] text-parish-muted">{r.notes}</div>}
                  </div>
                  <Badge tone="blue">{r.language}</Badge>
                  {!r.published && <StateBadge state="Draft" />}
                  <div className="flex gap-1.5">
                    <RowButton onClick={() => setEditing(r)}>Edit</RowButton>
                    <RowButton tone="gray" disabled={list.busyId === r.id} onClick={() => list.togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
                    <RowButton tone="red" disabled={list.busyId === r.id} onClick={() => list.removeRow(r)}>Delete</RowButton>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </Panel>

      {editing && <MassEditor row={editing} locations={locations} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function MassEditor({ row, locations, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...row, start_time: toTimeInput(row.start_time) });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.start_time) { setError('Choose a time.'); return; }
    if (!String(form.location || '').trim()) { setError('Enter the location, e.g. Main church or a chapel name.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveMassSchedule({ ...form, day_of_week: Number(form.day_of_week), location: form.location.trim() });
      toast.success('Schedule saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.id ? 'Edit time' : 'Add a time'} subtitle="Repeats every week" onClose={onClose} onSave={save} saving={saving} error={error}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Day" required>
          <Select value={form.day_of_week} onChange={(e) => set('day_of_week')(e.target.value)}>
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </Select>
        </Field>
        <Field label="Time" required><TextInput type="time" value={form.start_time} onChange={(e) => set('start_time')(e.target.value)} /></Field>
        <Field label="Type">
          <Select value={form.kind} onChange={(e) => set('kind')(e.target.value)}>
            {MASS_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </Field>
        <Field label="Language">
          <Select value={form.language} onChange={(e) => set('language')(e.target.value)}>
            {MASS_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Location" required>
        <ComboInput options={locations} value={form.location} onChange={set('location')} placeholder="Main church, or a chapel name" toggleLabel="Show locations" />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={form.notes || ''} onChange={(e) => set('notes')(e.target.value)} placeholder="e.g. First Friday only, with Healing Mass" maxLength={200} />
      </Field>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
