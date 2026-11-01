import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Badge, Checkbox, Field, PrimaryButton, Spinner, TextInput } from '../ui.jsx';
import { EmptyState, ErrorState, FilterSelect, LoadingState } from '../admin.jsx';
import { useViewOnly } from '../panels.jsx';
import { fmtDate, fmtDateTime } from '../../constants.js';
import { fmtTime, todayIso } from '../../lib/website.js';
import {
  KAABAG_PAGE, MAX_SERVERS, groupSundays, massRule, monthChoices, monthName, monthOf, nextAutoRun, openingMonth, placesShort, setMassRule, validServers,
} from '../../lib/kaabag.js';
import { HolderAvatar } from '../orgchart/NodePanel.jsx';
import { FilePick, Panel, RowButton, SectionLabel, TabIntro } from './shared.jsx';

const place = (s) => [s.location, s.language].filter(Boolean).join(' · ');
const sunday = (iso) => `Sun, ${fmtDate(iso)}`;

/**
 * The Kaabag's Sunday schedule: the schedule itself, the rules it's made by,
 * and the list of people. The database draws the names (0113) when staff
 * press Generate and, 7 days before each month's first Sunday, by itself.
 */
export default function KaabagTab() {
  const { data, loading, error, reload } = useAsyncData(api.kaabagAdmin, []);
  if (error && !data) return <Panel><ErrorState message={error} onRetry={reload} /></Panel>;
  if (loading && !data) return <Panel><LoadingState /></Panel>;
  return (
    <>
      <TabIntro text="Who serves at each Sunday Mass. It's drawn at random from the list below by the rules below, and shared out evenly: nobody serves again until everyone has had a turn.">
        <a href={KAABAG_PAGE} target="_blank" rel="noreferrer" className="font-semibold text-[13.5px] text-parish-blue no-underline hover:underline">Open the page ↗</a>
      </TabIntro>
      <div className="flex flex-col gap-4">
        <Schedule data={data} onChanged={reload} />
        <Rules data={data} onChanged={reload} />
        <People data={data} onChanged={reload} />
      </div>
    </>
  );
}

function PanelTitle({ children }) {
  return <h3 className="m-0 font-serif text-[21px] font-semibold text-parish-navy">{children}</h3>;
}

// ---- the schedule ---------------------------------------------------------

function Schedule({ data, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const viewOnly = useViewOnly();
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const dates = data.services.map((s) => String(s.service_date));
  const months = monthChoices(today, dates);
  const month = picked || openingMonth(dates, months, today);
  const services = data.services.filter((s) => monthOf(s.service_date) === month);
  const sundays = groupSundays(services, 'service_date');
  const short = services.reduce((n, s) => n + placesShort(s), 0);
  const hasUpcoming = services.some((s) => String(s.service_date) >= today);
  const made = services[services.length - 1];

  async function generate() {
    if (hasUpcoming) {
      const ok = await confirm({
        title: `Redo ${monthName(month)}?`,
        message: 'Sundays still to come get new names, and any changes made by hand to them are lost. Sundays already past stay as they were.',
        confirmLabel: 'Redo the schedule',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const r = await api.generateKaabag(month, hasUpcoming);
      await onChanged();
      toast.success(`${monthName(month)} is ready: ${r.filled} of ${r.places} places filled`);
    } catch (e) {
      toast.error(e.message || 'Could not make the schedule');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="flex items-center gap-3 flex-wrap px-5 pt-4 pb-3">
        <PanelTitle>Schedule</PanelTitle>
        <FilterSelect value={month} onChange={(e) => setPicked(e.target.value)} aria-label="Month">
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </FilterSelect>
        {short > 0 && <Badge tone="red">{short} {short === 1 ? 'place' : 'places'} short</Badge>}
        {!viewOnly && (
          <PrimaryButton type="button" disabled={busy} onClick={generate} className="ml-auto px-[18px] py-2.5 text-[14px] whitespace-nowrap inline-flex items-center gap-2">
            {busy && <Spinner />}{hasUpcoming ? `Redo ${monthName(month)}` : `Generate ${monthName(month)}`}
          </PrimaryButton>
        )}
      </div>
      {made && (
        <p className="m-0 px-5 pb-3 text-[12.5px] text-parish-muted">
          {made.generated_by === 'Automatic' ? 'Made automatically' : `Made by ${made.generated_by}`} on {fmtDateTime(made.created_at, { time: false })}.
          {' '}Names with a dashed outline aren't shown on the website yet (see The list).
        </p>
      )}
      {!sundays.length ? (
        <EmptyState title={`No schedule for ${monthName(month)} yet`} subtitle={viewOnly ? undefined : 'Check the rules and the list below, then press Generate.'} />
      ) : sundays.map((s) => (
        <div key={s.date} className="border-t border-parish-line">
          <div className="px-5 pt-3 pb-1 font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">
            {sunday(s.date)}{s.date < today ? ' · past' : ''}
          </div>
          {s.masses.map((service) => <ServiceRow key={service.id} service={service} roster={data.roster} onChanged={onChanged} />)}
        </div>
      ))}
    </Panel>
  );
}

/** One Mass on one Sunday: its time and place, who serves, and swapping someone by hand. */
function ServiceRow({ service, roster, onChanged }) {
  const toast = useToast();
  const viewOnly = useViewOnly();
  const [busy, setBusy] = useState(false);
  const short = placesShort(service);
  const here = new Set(service.people.map((p) => p.roster_id));
  const shown = new Set(roster.filter((r) => r.show_publicly).map((r) => r.id));

  async function change(run) {
    setBusy(true);
    try {
      await run();
      await onChanged();
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-3 px-5 py-2.5 flex-wrap">
      <div className="w-[190px] flex-none">
        <span className="font-serif text-[19px] font-semibold text-parish-blue">{fmtTime(service.start_time)}</span>
        <div className="text-[12.5px] text-parish-text2">{place(service)}</div>
      </div>
      <div className="flex-1 min-w-[200px] flex items-center gap-1.5 flex-wrap">
        {service.people.map((p) => (
          <span
            key={p.id}
            title={shown.has(p.roster_id) ? undefined : 'Not shown by name on the website yet'}
            className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[13px] font-semibold text-parish-navy bg-[var(--p-blue-tint)] border ${shown.has(p.roster_id) ? 'border-transparent' : 'border-dashed border-parish-muted'}`}
          >
            {p.name}
            {!viewOnly && (
              <button
                type="button" disabled={busy} aria-label={`Take ${p.name} off the ${fmtTime(service.start_time)} Mass`}
                onClick={() => change(() => api.removeKaabagFromMass(p.id))}
                className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted hover:text-parish-error text-[15px] leading-none px-0.5 disabled:opacity-50"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {short > 0 && <Badge tone="red">{short} short</Badge>}
        {!viewOnly && (
          <FilterSelect
            value="" disabled={busy} aria-label={`Add someone to the ${fmtTime(service.start_time)} Mass`} className="!py-1 !text-[12.5px]"
            onChange={(e) => {
              const person = roster.find((r) => String(r.id) === e.target.value);
              if (person) change(() => api.addKaabagToMass(service.id, person));
            }}
          >
            <option value="">+ Add</option>
            {roster.filter((r) => !here.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </FilterSelect>
        )}
      </div>
    </div>
  );
}

// ---- the rules ------------------------------------------------------------

function Rules({ data, onChanged }) {
  const toast = useToast();
  const viewOnly = useViewOnly();
  const [form, setForm] = useState(() => ({ ...data.settings, mass_rules: data.settings.mass_rules || {} }));
  const [perMass, setPerMass] = useState(String(data.settings.servers_per_mass));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  const run = nextAutoRun(todayIso(), data.services.map((s) => String(s.service_date)));
  const rule = (id, patch) => setForm((f) => ({ ...f, mass_rules: setMassRule(f.mass_rules, id, patch) }));

  async function save() {
    const servers = Number(perMass);
    const bad = Object.values(form.mass_rules).some((r) => r.servers !== undefined && !validServers(r.servers));
    if (!validServers(servers) || bad) { setProblem(`The number of Kaabag at a Mass must be from 1 to ${MAX_SERVERS}.`); return; }
    setSaving(true);
    setProblem('');
    try {
      await api.saveKaabagSettings({ ...form, servers_per_mass: servers });
      await onChanged();
      toast.success('Rules saved. They apply to the next schedule made.');
    } catch (e) {
      setProblem(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <fieldset disabled={viewOnly} className="contents">
        <div className="px-5 pt-4 pb-4 flex flex-col gap-4">
          <PanelTitle>Rules</PanelTitle>
          <div className="max-w-[220px]">
            <Field label="Kaabag at each Mass">
              <TextInput type="number" min={1} max={MAX_SERVERS} value={perMass} onChange={(e) => setPerMass(e.target.value)} />
            </Field>
          </div>

          <div>
            <SectionLabel>Sunday Masses</SectionLabel>
            {!data.masses.length && <p className="m-0 mt-2 text-[13.5px] text-parish-muted">No published Sunday Masses yet. Add them in the Mass Schedule tab.</p>}
            {data.masses.map((m) => {
              const r = massRule(form.mass_rules, m.id);
              return (
                <div key={m.id} className="flex items-center gap-3 flex-wrap py-2 border-b border-parish-line last:border-b-0">
                  <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-[240px]">
                    <Checkbox checked={!r.skip} onChange={(e) => rule(m.id, { skip: !e.target.checked })} aria-label={`Kaabag serve at the ${fmtTime(m.start_time)} Mass`} />
                    <span className="font-semibold text-[14px] text-parish-navy">{fmtTime(m.start_time)}</span>
                    <span className="text-[13px] text-parish-text2">{place(m)}</span>
                  </label>
                  {r.skip ? <span className="text-[12.5px] text-parish-muted">No Kaabag at this Mass</span> : (
                    <label className="flex items-center gap-2 text-[12.5px] text-parish-text2">
                      Its own number
                      <TextInput
                        type="number" min={1} max={MAX_SERVERS} placeholder={perMass} value={r.servers ?? ''} className="!w-[76px] !py-1.5"
                        aria-label={`Kaabag at the ${fmtTime(m.start_time)} Mass`}
                        onChange={(e) => rule(m.id, { servers: e.target.value === '' ? undefined : Number(e.target.value) })}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          <label className="flex items-start gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-field cursor-pointer">
            <input
              type="checkbox" checked={form.auto_generate} onChange={(e) => setForm((f) => ({ ...f, auto_generate: e.target.checked }))}
              className="w-[19px] h-[19px] mt-0.5 accent-parish-blue cursor-pointer"
            />
            <span>
              <span className="block font-semibold text-[14px] text-parish-navy">Make the schedule automatically</span>
              <span className="block text-[12.5px] text-parish-muted">
                7 days before each month's first Sunday, unless that month already has one.
                {form.auto_generate && data.cron && run ? ` Next: ${fmtDate(run.on)}, for ${monthName(run.month)}.` : ''}
              </span>
            </span>
          </label>
          {form.auto_generate && !data.cron && (
            <div role="alert" className="rounded-xl px-4 py-3 text-[13px] text-parish-error bg-parish-errorBg">
              The automatic run isn't set up on this database, so only the Generate button works for now. Turn on <strong>pg_cron</strong> in Supabase (Database → Extensions), then run <code>0113_kaabag_schedule.sql</code> again.
            </div>
          )}
          {problem && <div className="text-parish-error text-[13.5px] font-medium" role="alert">{problem}</div>}
          {!viewOnly && (
            <div><PrimaryButton type="button" disabled={saving} onClick={save} className="px-5 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save rules'}</PrimaryButton></div>
          )}
        </div>
      </fieldset>
    </Panel>
  );
}

// ---- the list -------------------------------------------------------------

function People({ data, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const viewOnly = useViewOnly();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const { roster } = data;
  const drawn = roster.filter((r) => r.on_rotation).length;
  const named = roster.filter((r) => r.show_publicly).length;

  async function act(run, failed = 'Could not change this') {
    setBusy(true);
    try {
      await run();
      await onChanged();
    } catch (e) {
      toast.error(e.message || failed);
    } finally {
      setBusy(false);
    }
  }

  async function remove(r) {
    const ok = await confirm({
      title: `Take ${r.name} off the list?`,
      message: 'They stay on any schedule already made, so change those by hand or redo the month. Their past service stays on record.',
      confirmLabel: 'Take off the list',
      tone: 'danger',
    });
    if (ok) act(async () => { await api.removeKaabagName(r.id); if (r.photo_url) api.deleteImage(r.photo_url).catch(() => {}); });
  }

  function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    act(async () => { await api.addKaabagName(name); setName(''); }, 'Could not add this name');
  }

  return (
    <Panel>
      <div className="px-5 pt-4 pb-3">
        <PanelTitle>The list</PanelTitle>
        <p className="m-0 mt-1 text-[13.5px] text-parish-muted max-w-[640px]">
          Members in the Kaabag ministry come in by themselves from <Link to="/admin/ministries" className="text-parish-blue font-semibold no-underline hover:underline">Ministry rosters</Link>. With nobody registered yet, type the names here and they go into the draw the same way.
        </p>
        <p className="m-0 mt-2 text-[13.5px] text-parish-text2 max-w-[640px]">
          <strong className="text-parish-navy">Names stay off the website until the person agrees</strong> (Data Privacy Act). Until then the website only counts them. Tick “Show on the website” once they have; the day is noted. The photo goes with the name, in the directory on the Kaabag page.
        </p>
        <p className="m-0 mt-2 text-[12.5px] text-parish-muted">{roster.length} on the list · {drawn} in the draw · {named} shown by name on the website</p>
        {!viewOnly && (
          <form onSubmit={add} className="flex gap-2 flex-wrap mt-3">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Type a name" maxLength={120} aria-label="Name to add to the list" className="!w-[280px] max-w-full" />
            <PrimaryButton type="submit" disabled={busy || !name.trim()} className="px-[18px] py-2.5 text-[14px]">Add name</PrimaryButton>
          </form>
        )}
      </div>
      {!roster.length ? <EmptyState title="Nobody on the list yet" subtitle="Add members to the Kaabag ministry, or type names above." /> : roster.map((r) => (
        <div key={r.id} className="flex items-center gap-x-4 gap-y-1.5 px-5 py-2.5 flex-wrap border-t border-parish-line">
          <div className="flex-1 min-w-[190px] flex items-center gap-2 flex-wrap">
            <HolderAvatar photo={r.photo_url} name={r.name} size={36} />
            <span className="font-semibold text-[14.5px] text-parish-navy">{r.name}</span>
            <Badge tone={r.member_id ? 'blue' : 'gray'}>{r.member_id ? 'Registered' : 'Typed name'}</Badge>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-parish-text2 cursor-pointer">
            <Checkbox checked={r.on_rotation} disabled={viewOnly || busy} onChange={(e) => act(() => api.saveKaabagPerson(r.id, { on_rotation: e.target.checked }))} className="w-4 h-4" />
            In the draw
          </label>
          <label className="flex items-center gap-2 text-[13px] text-parish-text2 cursor-pointer" title={r.consent_on ? `Agreed ${fmtDate(r.consent_on)}` : undefined}>
            <Checkbox checked={r.show_publicly} disabled={viewOnly || busy} onChange={(e) => act(() => api.saveKaabagPerson(r.id, { show_publicly: e.target.checked }))} className="w-4 h-4" />
            Show on the website
          </label>
          <PhotoButtons person={r} busy={busy} onChanged={onChanged} />
          {!r.member_id && <RowButton tone="red" disabled={busy} onClick={() => remove(r)}>Remove</RowButton>}
        </div>
      ))}
    </Panel>
  );
}

/**
 * A person's photo for the website's directory (0115): upload or replace it,
 * or take it off. The photo they had is deleted from the photo storage once
 * the new one is saved, and a new one that can't be saved is deleted again.
 * It shows on the website only once they're ticked "Show on the website".
 */
function PhotoButtons({ person, busy, onChanged }) {
  const toast = useToast();
  const viewOnly = useViewOnly();
  const [working, setWorking] = useState(false);
  if (viewOnly) return null;

  async function change(file) {
    setWorking(true);
    let uploaded = null;
    try {
      if (file) {
        if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
        uploaded = await api.uploadImage(file, 'org');
      }
      await api.saveKaabagPerson(person.id, { photo_url: uploaded });
      if (person.photo_url) api.deleteImage(person.photo_url).catch(() => {});
      await onChanged();
    } catch (e) {
      if (uploaded) api.deleteImage(uploaded).catch(() => {});
      toast.error(e.message || 'Could not change the photo');
    } finally {
      setWorking(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <FilePick label={person.photo_url ? 'Change photo' : 'Add photo'} onFiles={([f]) => change(f)} busy={working} disabled={busy} />
      {person.photo_url && !working && <RowButton tone="gray" disabled={busy} onClick={() => change(null)}>Remove photo</RowButton>}
    </span>
  );
}
