import React, { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { Field, TextInput, PrimaryButton, GhostButton } from '../ui.jsx';
import { LoadingState, ErrorState } from '../admin.jsx';
import { useToast } from '../../ToastContext.jsx';
import { DAYS, normalizeOfficeHours, messengerLink, messengerUsername, validCoords, mapEmbedUrl, isPhoneNumber, officeDayError } from '../../lib/website.js';
import { officeHourRows, officeStatus } from '../../lib/site.js';
import { TextArea, Panel } from './shared.jsx';
import { useViewOnly } from '../panels.jsx';

const TEXT_FIELDS = ['address', 'contact', 'mobile', 'email', 'facebook_url', 'sick_call_contact', 'directions', 'map_url', 'secretary_messenger'];
// Monday first, as the website lists the hours (DAYS and office_hours start on Sunday).
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function Card({ title, subtitle, children }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h3 className="m-0 font-serif text-[22px] font-semibold text-parish-navy">{title}</h3>
      {subtitle && <p className="m-0 mt-0.5 text-[13.5px] text-parish-muted">{subtitle}</p>}
      <div className="flex flex-col gap-4 mt-4">{children}</div>
    </Panel>
  );
}

/** Small grey line under a field: where it shows. */
function Hint({ children }) {
  return <div className="text-[12.5px] text-parish-muted mt-1">{children}</div>;
}

export default function OfficeTab() {
  const toast = useToast();
  const layout = useOutletContext();
  const [form, setForm] = useState(null);
  const saved = useRef('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false); // show "enter the times" errors after a save attempt
  const [migrated, setMigrated] = useState(true);
  const [messengerReady, setMessengerReady] = useState(true);
  const viewOnly = useViewOnly();

  function apply(settings) {
    const next = fromSettings(settings);
    saved.current = JSON.stringify(next);
    setForm(next);
  }

  function load() {
    setLoadError('');
    api.getSettings()
      .then(({ settings }) => {
        // Before 0011 is run the new columns aren't there; saving them would fail.
        setMigrated('mobile' in settings);
        setMessengerReady('secretary_messenger' in settings);
        apply(settings);
      })
      .catch((e) => setLoadError(e.message || 'Could not load the office details'));
  }
  useEffect(load, []);

  if (loadError) return <Panel><ErrorState message={loadError} onRetry={load} /></Panel>;
  if (!form) return <Panel><LoadingState /></Panel>;

  const dirty = JSON.stringify(form) !== saved.current;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setDay = (i, patch) => setForm((f) => ({ ...f, office_hours: f.office_hours.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  /** Copy Monday's hours to the days in `to` (DAYS indexes). */
  const copyMonday = (to) => setForm((f) => ({ ...f, office_hours: f.office_hours.map((d, i) => (to.includes(i) ? { ...f.office_hours[1] } : d)) }));

  async function save() {
    setAttempted(true);
    const bad = WEEK.find((i) => officeDayError(form.office_hours[i]));
    if (bad !== undefined) { toast.error(`${DAYS[bad]}: ${officeDayError(form.office_hours[bad])}`); return; }
    if ((form.latitude === '') !== (form.longitude === '')) { toast.error('Enter both latitude and longitude, or leave both blank.'); return; }
    if (form.latitude !== '' && !validCoords(form.latitude, form.longitude)) { toast.error('The map pin is not a valid latitude/longitude.'); return; }
    const messenger = messengerUsername(form.secretary_messenger);
    if (messenger === null) { toast.error("The secretary's Messenger must be a Facebook profile link or username."); return; }
    setSaving(true);
    try {
      const patch = { ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, form[k]])), latitude: form.latitude, longitude: form.longitude, office_hours: form.office_hours };
      // Saved as the bare username; the website builds the m.me link from it.
      patch.secretary_messenger = messenger;
      if (!migrated) for (const k of ['mobile', 'facebook_url', 'sick_call_contact', 'directions', 'map_url', 'latitude', 'longitude', 'office_hours']) delete patch[k];
      if (!messengerReady) delete patch.secretary_messenger;
      const { settings } = await api.updateSettings(patch);
      apply(settings);
      setAttempted(false);
      layout?.setParish?.(settings);
      toast.success('Office details saved');
    } catch (e) {
      toast.error(e.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  const pin = validCoords(form.latitude, form.longitude);
  const messengerUrl = messengerLink(form.secretary_messenger);

  return (
    // View-only accounts see the details with every field and button disabled.
    <fieldset disabled={viewOnly} className="min-w-0 border-0 p-0 m-0">
      {!migrated && (
        <div className="mb-[18px] px-4 py-3 rounded-xl bg-parish-warnTint text-parish-warnStrong text-[13.5px] font-medium" role="status">
          Run the <strong>0011_website_content.sql</strong> migration in Supabase to save office hours, the map and the extra contact numbers. The address, phone and email below save already.
        </div>
      )}

      <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex flex-col gap-[18px] min-w-0">
          <Card title="Phone & messages" subtitle="How families reach the office. Shown on the website's Kontak page.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Office phone">
                <TextInput type="tel" value={form.contact} onChange={set('contact')} placeholder="Landline or main number" />
                <NotPhoneNote value={form.contact} />
              </Field>
              <Field label="Mobile (for calls and texts)">
                <TextInput type="tel" value={form.mobile} onChange={set('mobile')} disabled={!migrated} placeholder="09xx xxx xxxx" />
                <NotPhoneNote value={form.mobile} />
              </Field>
            </div>
            <Field label="Office secretary's Messenger">
              <TextInput
                value={form.secretary_messenger}
                onChange={set('secretary_messenger')}
                disabled={!messengerReady}
                placeholder="Facebook profile link or username, e.g. facebook.com/juan.delacruz"
                spellCheck={false}
              />
              <div className="text-[12.5px] text-parish-muted mt-1">
                {!messengerReady ? (
                  <>Run the <strong>0026_secretary_messenger.sql</strong> migration in Supabase to save this.</>
                ) : messengerUrl ? (
                  <>The <strong>Message Me</strong> button opens{' '}
                    <a href={messengerUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-parish-blue break-all">{messengerUrl}</a>.</>
                ) : messengerUsername(form.secretary_messenger) === null ? (
                  <span className="text-parish-error">That doesn't look like a Facebook profile link or username.</span>
                ) : (
                  'Leave blank to hide the Message Me button.'
                )}
              </div>
            </Field>
            <div className="rounded-xl border border-parish-border bg-parish-field p-4">
              <Field label="Sick call / emergency anointing">
                <TextInput value={form.sick_call_contact} onChange={set('sick_call_contact')} disabled={!migrated} placeholder="e.g. 0917 xxx xxxx (Fr. …)" />
                <NotPhoneNote value={form.sick_call_contact} sick />
                <Hint>A number to call any time for a priest. The website shows it in a dark “Sick call” box beside the page title.</Hint>
              </Field>
            </div>
          </Card>

          <Card title="Email & Facebook">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email"><TextInput type="email" value={form.email} onChange={set('email')} placeholder="parish@example.com" /></Field>
              <Field label="Facebook page"><TextInput type="url" value={form.facebook_url} onChange={set('facebook_url')} disabled={!migrated} placeholder="https://facebook.com/…" /></Field>
            </div>
          </Card>

          <Card title="Office hours" subtitle="The website shows “Open now” or “Closed” from these times.">
            <div className="flex flex-col divide-y divide-parish-line">
              {WEEK.map((i) => (
                <DayRow key={i} day={DAYS[i]} d={form.office_hours[i]} disabled={!migrated} showMissing={attempted} onChange={(patch) => setDay(i, patch)} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <QuickButton disabled={!migrated} onClick={() => copyMonday([2, 3, 4, 5])}>Copy Monday to Tuesday–Friday</QuickButton>
              <QuickButton disabled={!migrated} onClick={() => copyMonday([2, 3, 4, 5, 6])}>Copy Monday to Tuesday–Saturday</QuickButton>
            </div>
          </Card>

          <Card title="Location & map" subtitle="Helps visitors and new families find the church.">
            <Field label="Address">
              <TextInput value={form.address} onChange={set('address')} placeholder="Purok 3, Mua-an, Kidapawan City, North Cotabato" />
              <Hint>Also printed on household and census sheets.</Hint>
            </Field>
            <Field label="Directions / landmarks">
              <TextArea rows={3} value={form.directions} onChange={set('directions')} disabled={!migrated} placeholder="e.g. Along the national highway, beside Mua-an Elementary School. Ride a habal-habal from the Kidapawan terminal." />
            </Field>
            <Field label="Google Maps link">
              <TextInput type="url" value={form.map_url} onChange={set('map_url')} disabled={!migrated} placeholder="Open the church in Google Maps → Share → Copy link" />
              <Hint>Opens from “Google Maps” on the website.</Hint>
            </Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
              <Field label="Latitude (optional)"><TextInput inputMode="decimal" value={form.latitude} onChange={set('latitude')} disabled={!migrated} placeholder="7.0083" /></Field>
              <Field label="Longitude (optional)"><TextInput inputMode="decimal" value={form.longitude} onChange={set('longitude')} disabled={!migrated} placeholder="125.0894" /></Field>
            </div>
            <Hint>
              To get these, long-press the church in Google Maps; the two numbers at the top are latitude and longitude. They place the pin on the website's map and the “Mga direksyon” route.
            </Hint>
            {pin ? (
              <iframe
                title="Map preview"
                src={mapEmbedUrl(form.latitude, form.longitude)}
                className="w-full h-[260px] rounded-xl border border-parish-border"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-parish-borderSoft px-4 py-6 text-center text-[13px] text-parish-muted">
                No pin yet: the website uses the church's default location.
              </div>
            )}
          </Card>
        </div>

        <WebsitePreview form={form} />
      </div>

      {!viewOnly && <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => { setForm(JSON.parse(saved.current)); setAttempted(false); }} />}
    </fieldset>
  );
}

/** One day: Open / Closed, its hours and an optional break, with what's wrong under it. */
function DayRow({ day, d, disabled, showMissing, onChange }) {
  const err = officeDayError(d);
  const shownErr = err && (showMissing || (d.open && d.close)) ? err : '';
  function toggleOpen(open) {
    // Opening a day with no times starts it at the usual office hours.
    onChange(open ? { closed: false, ...(!d.open && !d.close ? { open: '08:00', close: '17:00' } : {}) } : { closed: true });
  }
  function addBreak() {
    // The usual lunch hour; the day's note says so if it falls outside the hours.
    onChange({ break_from: '12:00', break_to: '13:00' });
  }
  const hasBreak = !!(d.break_from || d.break_to);
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="w-[104px] font-semibold text-[14px] text-parish-navy">{day}</div>
        <OpenSwitch open={!d.closed} disabled={disabled} label={`${day} open`} onChange={toggleOpen} />
        {d.closed ? (
          <span className="text-[13.5px] text-parish-muted">Closed all day</span>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-parish-muted">
            <TimeBox label={`${day} opens`} value={d.open} onChange={(v) => onChange({ open: v })} disabled={disabled} invalid={!!shownErr} />
            <span aria-hidden>–</span>
            <TimeBox label={`${day} closes`} value={d.close} onChange={(v) => onChange({ close: v })} disabled={disabled} invalid={!!shownErr} />
            {hasBreak ? (
              <span className="flex items-center gap-2 sm:ml-3 pl-0 sm:pl-3 sm:border-l border-parish-line">
                <span className="font-semibold text-parish-text2">Break</span>
                <TimeBox label={`${day} break starts`} value={d.break_from} onChange={(v) => onChange({ break_from: v })} disabled={disabled} invalid={!!shownErr} />
                <span aria-hidden>–</span>
                <TimeBox label={`${day} break ends`} value={d.break_to} onChange={(v) => onChange({ break_to: v })} disabled={disabled} invalid={!!shownErr} />
                <button
                  type="button" disabled={disabled} onClick={() => onChange({ break_from: '', break_to: '' })} aria-label={`Remove ${day}'s break`}
                  className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted hover:text-parish-error text-[18px] leading-none px-1 disabled:opacity-50"
                >×</button>
              </span>
            ) : (
              <button
                type="button" disabled={disabled} onClick={addBreak}
                className="sm:ml-2 appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-[13px] text-parish-blue disabled:opacity-50"
              >
                + Lunch break
              </button>
            )}
          </div>
        )}
      </div>
      {shownErr && <div role="alert" className="mt-1.5 sm:ml-[120px] text-[12.5px] font-medium text-parish-error">{shownErr}</div>}
    </div>
  );
}

/** The Open / Closed switch of a day. */
function OpenSwitch({ open, disabled, label, onChange }) {
  return (
    <label className={`flex items-center gap-2 select-none w-[92px] ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="relative inline-flex">
        <input type="checkbox" role="switch" aria-label={label} checked={open} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="w-9 h-5 rounded-full bg-parish-sunk border border-parish-border transition peer-checked:bg-parish-fill peer-checked:border-transparent peer-focus-visible:ring-4 peer-focus-visible:ring-parish-blue/20" />
        <span className="absolute top-[3px] left-[3px] w-3.5 h-3.5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      <span className={`text-[13px] font-semibold ${open ? 'text-parish-okText' : 'text-parish-muted'}`}>{open ? 'Open' : 'Closed'}</span>
    </label>
  );
}

function QuickButton({ children, ...props }) {
  return (
    <button
      type="button" {...props}
      className="appearance-none cursor-pointer rounded-lg border border-parish-border bg-parish-surface px-3 py-1.5 font-semibold text-[12.5px] text-parish-blue hover:border-parish-blue disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function TimeBox({ label, value, onChange, disabled, invalid = false }) {
  return (
    <input
      type="time" aria-label={label} value={value} disabled={disabled} aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`px-2.5 py-1.5 text-[14px] text-parish-ink bg-parish-field border-[1.5px] rounded-lg outline-none focus:border-parish-blue disabled:opacity-60 ${invalid ? 'border-parish-errorBorder' : 'border-parish-borderSoft'}`}
    />
  );
}

/**
 * What the website's Kontak page shows with the details as entered (not yet
 * saved): the open / closed line, today's hours, and which buttons appear,
 * with what to fill in for the ones that don't.
 */
function WebsitePreview({ form }) {
  const hoursOk = WEEK.every((i) => !officeDayError(form.office_hours[i]));
  const status = hoursOk ? officeStatus(form.office_hours) : null;
  const today = hoursOk ? officeHourRows(form.office_hours).find((r) => r.today) : null;
  const phone = isPhoneNumber(form.mobile) || isPhoneNumber(form.contact);
  const items = [
    ['Tawag & Mag-text buttons', phone, 'Enter a phone number in Office phone or Mobile.'],
    ['Message Me button', !!messengerLink(form.secretary_messenger), "Enter the secretary's Messenger."],
    ['Sick call box', isPhoneNumber(form.sick_call_contact), 'Enter a sick call number.'],
    ['Email', !!form.email.trim(), 'Enter the office email.'],
    ['Facebook page', !!form.facebook_url.trim(), 'Enter the Facebook page link.'],
    ['Directions note', !!form.directions.trim(), 'Add directions or landmarks.'],
  ];
  return (
    <aside className="xl:sticky xl:top-4">
      <Panel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 font-serif text-[20px] font-semibold text-parish-navy">On the website</h3>
          <a href="/kontak" target="_blank" rel="noopener noreferrer" className="font-semibold text-[12.5px] text-parish-blue whitespace-nowrap">Open Kontak page ↗</a>
        </div>
        <p className="m-0 mt-0.5 mb-3.5 text-[12.5px] text-parish-muted">As visitors will see it, with the details above (save to publish them).</p>

        {status ? (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold border ${status.open ? 'text-parish-ok bg-parish-okBg border-parish-okBorder' : 'text-parish-text2 bg-parish-field border-parish-border'}`}>
            <span className={`w-2.5 h-2.5 flex-none rounded-full ${status.open ? 'bg-parish-ok' : 'bg-parish-muted'}`} aria-hidden />
            {status.text}
          </div>
        ) : (
          <div className="rounded-xl px-3 py-2.5 text-[13px] text-parish-error bg-parish-errorBg border border-parish-errorBorder">Fix the office hours to see the open / closed line.</div>
        )}
        {today && (
          <div className="mt-2 text-[12.5px] text-parish-text2">
            Today ({today.label}): <span className="font-semibold text-parish-ink">{today.hours ? today.hours.join(', ') : 'Sirado'}</span>
          </div>
        )}

        <ul className="list-none m-0 mt-4 p-0 flex flex-col gap-2.5">
          {items.map(([label, shown, todo]) => (
            <li key={label} className="flex gap-2.5 text-[13.5px]">
              <span
                className={`w-5 h-5 flex-none mt-px rounded-full flex items-center justify-center ${shown ? 'bg-parish-okBg text-parish-ok' : 'bg-parish-sunk text-parish-muted'}`}
                aria-hidden
              >
                {shown
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"><path d="M5 12h14" /></svg>}
              </span>
              <span className="min-w-0">
                <span className={`block font-semibold ${shown ? 'text-parish-ink' : 'text-parish-text2'}`}>{label}<span className="sr-only">{shown ? ': shown' : ': not shown'}</span></span>
                {!shown && <span className="block text-[12px] text-parish-muted">{todo}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </aside>
  );
}

/** Save / Discard, kept in view at the bottom while there are changes. */
function SaveBar({ dirty, saving, onSave, onDiscard }) {
  return (
    <div className="sticky bottom-0 z-10 mt-[18px] -mx-4 sm:mx-0 px-4 sm:px-5 py-3 bg-parish-card/95 backdrop-blur border-t sm:border border-parish-border sm:rounded-2xl shadow-cardSm flex items-center gap-3 flex-wrap">
      <span className={`mr-auto text-[13px] font-semibold ${dirty ? 'text-parish-warn' : 'text-parish-muted'}`} aria-live="polite">
        {dirty ? 'Unsaved changes' : 'All changes saved'}
      </span>
      {dirty && <GhostButton onClick={onDiscard} disabled={saving} className="px-4 py-2.5 text-[14px]">Discard</GhostButton>}
      <PrimaryButton onClick={onSave} disabled={saving || !dirty} className="px-[22px] py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save office details'}</PrimaryButton>
    </div>
  );
}

function fromSettings(s) {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, s[k] || ''])),
    latitude: s.latitude ?? '',
    longitude: s.longitude ?? '',
    office_hours: normalizeOfficeHours(s.office_hours),
  };
}

/** Under a phone field: what's typed isn't a number, so the website won't offer to call or text it. */
function NotPhoneNote({ value, sick = false }) {
  if (!String(value || '').trim() || isPhoneNumber(value)) return null;
  return (
    <div className="text-[12.5px] font-semibold text-parish-warn mt-1">
      {sick
        ? "This isn't a phone number, so the website won't show the Sick call box."
        : "This isn't a phone number, so the website shows it as plain text with no Call or Text button."}
    </div>
  );
}
