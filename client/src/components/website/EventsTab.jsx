import React, { useEffect, useState } from 'react';
import { useUrlState } from '../../hooks.js';
import { api } from '../../api.js';
import { Field, TextInput, Select, Badge, OptionSelect } from '../ui.jsx';
import { FilterSelect, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDate } from '../../constants.js';
import { useToast } from '../../ToastContext.jsx';
import { EVENT_TYPES, EVENT_TONES, fmtTime, toTimeInput, todayIso, addDays } from '../../lib/website.js';
import { useContentList, SidePanel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton } from './shared.jsx';

const describe = (r) => r.title;
const lastDay = (r) => r.end_date || r.start_date;

function monthLabel(iso) {
  return new Date(`${iso}T00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function whenText(r) {
  const days = r.end_date && r.end_date !== r.start_date ? `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}` : fmtDate(r.start_date);
  const times = r.start_time ? ` · ${fmtTime(r.start_time)}${r.end_time ? `–${fmtTime(r.end_time)}` : ''}` : '';
  return days + times;
}

const URL_DEFAULTS = { when: 'upcoming', type: 'All' };
const URL_ALLOWED = { when: ['upcoming', 'past'], type: ['All', ...EVENT_TYPES] };

export default function EventsTab() {
  const list = useContentList({ table: 'events', load: api.listEvents, remove: api.deleteEvent, describe });
  const [editing, setEditing] = useState(null);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { when, type } = url;
  const setWhen = (v) => setUrl({ when: v });
  const setType = (v) => setUrl({ type: v });
  const [gkks, setGkks] = useState([]);
  const today = todayIso();

  useEffect(() => { api.listGkks().then((r) => setGkks(r.rows.map((g) => g.name))).catch(() => {}); }, []);

  const shown = list.rows
    .filter((r) => (when === 'upcoming' ? lastDay(r) >= today : lastDay(r) < today))
    .filter((r) => type === 'All' || r.type === type)
    .sort((a, b) => (when === 'upcoming' ? 1 : -1) * (a.start_date.localeCompare(b.start_date) || String(a.start_time || '').localeCompare(String(b.start_time || ''))));

  const months = [];
  for (const r of shown) {
    const label = monthLabel(r.start_date);
    if (months[months.length - 1]?.label !== label) months.push({ label, rows: [] });
    months[months.length - 1].rows.push(r);
  }

  /** Open a new event copied from `r`, one week later, for the next in a series such as the GKK rotation. */
  function duplicate(r) {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = r;
    const gap = r.end_date ? Math.round((new Date(`${r.end_date}T00:00`) - new Date(`${r.start_date}T00:00`)) / 86400000) : 0;
    const start = addDays(r.start_date, 7);
    setEditing({ ...rest, start_date: start, end_date: r.end_date ? addDays(start, gap) : '', copiedFrom: r.title });
  }

  return (
    <>
      <TabIntro text="Fiesta, novenas, recollections, seminars and the GKK rotation. For a novena, set an end date so it shows across all nine days. Use Duplicate to add the next week of a rotation quickly.">
        <AddButton onClick={() => setEditing({ title: '', type: 'Other', start_date: today, end_date: '', start_time: '', end_time: '', location: '', gkk: '', organizer: '', description: '', published: true })}>
          Add event
        </AddButton>
      </TabIntro>

      <div className="flex gap-2.5 flex-wrap mb-4">
        <div role="group" aria-label="Upcoming or past events" className="inline-flex rounded-lg border-[1.5px] border-parish-borderSoft overflow-hidden bg-[#fffdf8]">
          {[['upcoming', 'Upcoming'], ['past', 'Past']].map(([k, label]) => (
            <button
              key={k} type="button" aria-pressed={when === k} onClick={() => setWhen(k)}
              className={`appearance-none border-none cursor-pointer px-4 py-2 font-semibold text-[13.5px] ${when === k ? 'bg-parish-blue text-white' : 'bg-transparent text-parish-text2'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <FilterSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="All">All types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </FilterSelect>
      </div>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? (
          <EmptyState title="No events yet" subtitle="Add the fiesta, novenas and the GKK rotation." />
        ) : !shown.length ? (
          <EmptyState title={when === 'upcoming' ? 'No upcoming events' : 'No past events'} subtitle={type !== 'All' ? `for ${type}` : undefined} />
        ) : (
          months.map((m) => (
            <section key={m.label} className="border-b border-[#f1e8d5] last:border-b-0">
              <div className="px-5 pt-4 pb-1 font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{m.label}</div>
              {m.rows.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-5 py-3 flex-wrap">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <Badge tone={EVENT_TONES[r.type]}>{r.type}</Badge>
                      {!r.published && <StateBadge state="Draft" />}
                    </div>
                    <div className="font-semibold text-[15px] text-parish-navy">{r.title}</div>
                    <div className="text-[12.5px] text-parish-text2">
                      {[whenText(r), r.gkk, r.location].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <RowButton onClick={() => setEditing(r)}>Edit</RowButton>
                    <RowButton tone="gray" onClick={() => duplicate(r)}>Duplicate</RowButton>
                    <RowButton tone="gray" disabled={list.busyId === r.id} onClick={() => list.togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
                    <RowButton tone="red" disabled={list.busyId === r.id} onClick={() => list.removeRow(r)}>Delete</RowButton>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </Panel>

      {editing && <EventEditor row={editing} gkks={gkks} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function EventEditor({ row, gkks, onClose, onSaved }) {
  const toast = useToast();
  const { copiedFrom, ...initial } = row;
  const [form, setForm] = useState({
    ...initial,
    end_date: initial.end_date || '',
    start_time: toTimeInput(initial.start_time),
    end_time: toTimeInput(initial.end_time),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { setError('Give the event a title.'); return; }
    if (!form.start_date) { setError('Choose the date.'); return; }
    if (form.end_date && form.end_date < form.start_date) { setError('The last day must be on or after the first day.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveEvent({ ...form, title: form.title.trim(), end_date: form.end_date === form.start_date ? '' : form.end_date });
      toast.success('Event saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const title = row.id ? 'Edit event' : copiedFrom ? 'Next in the series' : 'Add an event';
  return (
    <SidePanel title={title} subtitle={copiedFrom ? `Copied from “${copiedFrom}”, one week later` : undefined} onClose={onClose} onSave={save} saving={saving} error={error}>
      <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={150} placeholder="e.g. Novena sa Our Lady of Guadalupe" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={form.type} onChange={(e) => set('type')(e.target.value)}>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label={form.type === 'GKK Rotation' ? 'GKK' : 'GKK (optional)'}>
          <OptionSelect options={gkks} value={form.gkk || ''} onChange={set('gkk')} placeholder="Whole parish" />
        </Field>
        <Field label="First day" required><TextInput type="date" value={form.start_date} onChange={(e) => set('start_date')(e.target.value)} /></Field>
        <Field label="Last day (multi-day only)"><TextInput type="date" value={form.end_date} min={form.start_date} onChange={(e) => set('end_date')(e.target.value)} /></Field>
        <Field label="Starts at (optional)"><TextInput type="time" value={form.start_time} onChange={(e) => set('start_time')(e.target.value)} /></Field>
        <Field label="Ends at (optional)"><TextInput type="time" value={form.end_time} onChange={(e) => set('end_time')(e.target.value)} /></Field>
      </div>
      <Field label="Location"><TextInput value={form.location || ''} onChange={(e) => set('location')(e.target.value)} placeholder="e.g. Main church, or the house of the host family" /></Field>
      <Field label="Organizer"><TextInput value={form.organizer || ''} onChange={(e) => set('organizer')(e.target.value)} placeholder="e.g. Parish Pastoral Council, Youth Ministry" /></Field>
      <Field label="Details">
        <TextArea rows={4} value={form.description || ''} onChange={(e) => set('description')(e.target.value)} placeholder="What happens, who should come, what to bring" />
      </Field>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
