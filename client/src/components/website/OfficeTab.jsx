import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { Field, TextInput, Checkbox, PrimaryButton } from '../ui.jsx';
import { LoadingState, ErrorState } from '../admin.jsx';
import { useToast } from '../../ToastContext.jsx';
import { DAYS, normalizeOfficeHours } from '../../lib/website.js';
import { TextArea, Panel } from './shared.jsx';

const TEXT_FIELDS = ['address', 'contact', 'mobile', 'email', 'facebook_url', 'sick_call_contact', 'directions', 'map_url'];

function Card({ title, subtitle, children }) {
  return (
    <Panel className="p-6">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">{title}</div>
      {subtitle && <div className="text-[13.5px] text-parish-muted mb-4">{subtitle}</div>}
      <div className="flex flex-col gap-4">{children}</div>
    </Panel>
  );
}

function validCoords(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== '' && lng !== '' && lat != null && lng != null && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !Number.isNaN(a) && !Number.isNaN(b);
}

export default function OfficeTab() {
  const toast = useToast();
  const layout = useOutletContext();
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [migrated, setMigrated] = useState(true);

  function load() {
    setLoadError('');
    api.getSettings()
      .then(({ settings }) => {
        // Before 0011 is run the new columns aren't there; saving them would fail.
        setMigrated('mobile' in settings);
        setForm(fromSettings(settings));
      })
      .catch((e) => setLoadError(e.message || 'Could not load the office details'));
  }
  useEffect(load, []);

  if (loadError) return <Panel><ErrorState message={loadError} onRetry={load} /></Panel>;
  if (!form) return <Panel><LoadingState /></Panel>;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setDay = (i, k, v) => setForm((f) => ({ ...f, office_hours: f.office_hours.map((d, j) => (j === i ? { ...d, [k]: v } : d)) }));

  function hoursError() {
    for (const [i, d] of form.office_hours.entries()) {
      if (d.closed) continue;
      if (!d.open || !d.close) return `${DAYS[i]}: enter opening and closing times, or tick Closed.`;
      if (d.close <= d.open) return `${DAYS[i]}: closing time must be after opening time.`;
      if (!!d.break_from !== !!d.break_to) return `${DAYS[i]}: enter both ends of the break, or leave both blank.`;
      if (d.break_from && (d.break_from <= d.open || d.break_to >= d.close || d.break_to <= d.break_from)) return `${DAYS[i]}: the break must fall inside office hours.`;
    }
    return '';
  }

  async function save() {
    const err = hoursError();
    if (err) { toast.error(err); return; }
    if ((form.latitude === '') !== (form.longitude === '')) { toast.error('Enter both latitude and longitude, or leave both blank.'); return; }
    if (form.latitude !== '' && !validCoords(form.latitude, form.longitude)) { toast.error('The map pin is not a valid latitude/longitude.'); return; }
    setSaving(true);
    try {
      const patch = { ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, form[k]])), latitude: form.latitude, longitude: form.longitude, office_hours: form.office_hours };
      if (!migrated) for (const k of ['mobile', 'facebook_url', 'sick_call_contact', 'directions', 'map_url', 'latitude', 'longitude', 'office_hours']) delete patch[k];
      const { settings } = await api.updateSettings(patch);
      setForm(fromSettings(settings));
      layout?.setParish?.(settings);
      toast.success('Office details saved');
    } catch (e) {
      toast.error(e.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  const pin = validCoords(form.latitude, form.longitude);

  return (
    <div className="flex flex-col gap-[18px] max-w-[760px]">
      {!migrated && (
        <div className="px-4 py-3 rounded-xl bg-[#fdf1de] text-[#8a5f1e] text-[13.5px] font-medium" role="status">
          Run the <strong>0011_website_content.sql</strong> migration in Supabase to save office hours, the map and the extra contact numbers. The address, phone and email below save already.
        </div>
      )}

      <Card title="Contact details" subtitle="Shown on the website and printed on household and census sheets.">
        <Field label="Address"><TextInput value={form.address} onChange={set('address')} placeholder="Purok 3, Mua-an, Kidapawan City, North Cotabato" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Office phone"><TextInput type="tel" value={form.contact} onChange={set('contact')} placeholder="Landline or main number" /></Field>
          <Field label="Mobile (for calls and texts)"><TextInput type="tel" value={form.mobile} onChange={set('mobile')} disabled={!migrated} placeholder="09xx xxx xxxx" /></Field>
          <Field label="Email"><TextInput type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Facebook page"><TextInput type="url" value={form.facebook_url} onChange={set('facebook_url')} disabled={!migrated} placeholder="https://facebook.com/…" /></Field>
        </div>
        <Field label="Sick call / emergency anointing">
          <TextInput value={form.sick_call_contact} onChange={set('sick_call_contact')} disabled={!migrated} placeholder="Number to call any time for a priest, e.g. 0917 xxx xxxx (Fr. …)" />
        </Field>
      </Card>

      <Card title="Office hours" subtitle="The website will show “Open now” or “Closed now” from these times.">
        <div className="flex flex-col divide-y divide-[#f1e8d5]">
          {form.office_hours.map((d, i) => (
            <div key={DAYS[i]} className="py-2.5 flex items-center gap-3 flex-wrap">
              <div className="w-[96px] font-semibold text-[14px] text-parish-navy">{DAYS[i]}</div>
              <label className="flex items-center gap-2 text-[13.5px] text-parish-text2 cursor-pointer w-[86px]">
                <Checkbox checked={d.closed} disabled={!migrated} onChange={(e) => setDay(i, 'closed', e.target.checked)} /> Closed
              </label>
              {!d.closed && (
                <div className="flex items-center gap-2 flex-wrap text-[13px] text-parish-muted">
                  <TimeBox label={`${DAYS[i]} opens`} value={d.open} onChange={(v) => setDay(i, 'open', v)} disabled={!migrated} />
                  to
                  <TimeBox label={`${DAYS[i]} closes`} value={d.close} onChange={(v) => setDay(i, 'close', v)} disabled={!migrated} />
                  <span className="ml-2">break</span>
                  <TimeBox label={`${DAYS[i]} break starts`} value={d.break_from} onChange={(v) => setDay(i, 'break_from', v)} disabled={!migrated} />
                  to
                  <TimeBox label={`${DAYS[i]} break ends`} value={d.break_to} onChange={(v) => setDay(i, 'break_to', v)} disabled={!migrated} />
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          type="button" disabled={!migrated}
          onClick={() => setForm((f) => ({ ...f, office_hours: f.office_hours.map((d, i) => (i >= 2 && i <= 5 ? { ...f.office_hours[1] } : d)) }))}
          className="self-start appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-[13px] text-parish-blue disabled:opacity-50"
        >
          Copy Monday's hours to Tuesday–Friday
        </button>
      </Card>

      <Card title="Map & directions" subtitle="Helps visitors and new families find the church.">
        <Field label="Directions / landmarks">
          <TextArea rows={3} value={form.directions} onChange={set('directions')} disabled={!migrated} placeholder="e.g. Along the national highway, beside Mua-an Elementary School. Ride a habal-habal from the Kidapawan terminal." />
        </Field>
        <Field label="Google Maps link">
          <TextInput type="url" value={form.map_url} onChange={set('map_url')} disabled={!migrated} placeholder="Open the church in Google Maps → Share → Copy link" />
        </Field>
        <div className="grid gap-4 grid-cols-2">
          <Field label="Latitude (optional)"><TextInput inputMode="decimal" value={form.latitude} onChange={set('latitude')} disabled={!migrated} placeholder="7.0083" /></Field>
          <Field label="Longitude (optional)"><TextInput inputMode="decimal" value={form.longitude} onChange={set('longitude')} disabled={!migrated} placeholder="125.0894" /></Field>
        </div>
        <div className="text-[12.5px] text-parish-muted -mt-2">
          To get these, long-press the church in Google Maps; the two numbers at the top are latitude and longitude. They place a pin on the website's map.
        </div>
        {pin && (
          <iframe
            title="Map preview"
            src={`https://maps.google.com/maps?q=${Number(form.latitude)},${Number(form.longitude)}&z=16&output=embed`}
            className="w-full h-[260px] rounded-xl border border-parish-border"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}
      </Card>

      <div>
        <PrimaryButton onClick={save} disabled={saving} className="px-[26px] py-3 text-[14.5px]">{saving ? 'Saving…' : 'Save office details'}</PrimaryButton>
      </div>
    </div>
  );
}

function TimeBox({ label, value, onChange, disabled }) {
  return (
    <input
      type="time" aria-label={label} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-2 text-[14px] text-parish-ink bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue disabled:opacity-60"
    />
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
