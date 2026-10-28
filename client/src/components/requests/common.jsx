import React, { useEffect, useState } from 'react';
import { Badge } from '../ui.jsx';
import { useAsyncData } from '../../hooks.js';
import { STATUS_TONES, phoneHref, smsHref } from '../../lib/requests.js';

/** Rows from a list loader, with an `upsert`/`drop` to change them in place after a save. */
export function useRows(load) {
  const { data, loading, error, reload } = useAsyncData(load, []);
  const [rows, setRows] = useState([]);
  useEffect(() => { if (data) setRows(data.rows); }, [data]);
  const upsert = (saved) => setRows((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...rs]));
  const upsertMany = (list) => list.forEach(upsert);
  const drop = (id) => setRows((rs) => rs.filter((r) => r.id !== id));
  return { rows, loading: loading && !data, error, reload, upsert, upsertMany, drop };
}

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONES[status] || 'gray'}>{status}</Badge>;
}

/** Call and Text buttons for a mobile number. `sms` pre-fills the text message. */
export function ContactLinks({ mobile, sms }) {
  const tel = phoneHref(mobile);
  if (!tel) return null;
  const cls = 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold text-[12.5px] no-underline bg-[var(--p-blue-tint)] text-parish-blue';
  return (
    <span className="inline-flex gap-1.5 flex-wrap">
      <a href={`tel:${tel}`} className={cls}>Call</a>
      <a href={smsHref(mobile, sms || '')} className={cls}>Text</a>
    </span>
  );
}

/** Row of toggle chips, e.g. Open / Ready / All. `options` is [key, label, count?]. */
export function FilterChips({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 flex-wrap">
      {options.map(([k, text, count]) => (
        <button
          key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={`appearance-none cursor-pointer px-3.5 py-2 rounded-full font-semibold text-[13px] border-[1.5px] ${value === k ? 'bg-parish-fill border-parish-blue text-white' : 'bg-parish-card border-parish-borderSoft text-parish-text2'}`}
        >
          {text}{count ? <span className={`ml-1.5 ${value === k ? 'text-white/80' : 'text-parish-muted'}`}>{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** "3 Oct" style date of a timestamp, plus "(2 days ago)" for recent ones. */
export function receivedText(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  if (days <= 0) return `${date} (today)`;
  if (days === 1) return `${date} (yesterday)`;
  if (days < 14) return `${date} (${days} days ago)`;
  return date;
}

/** "Walk-in" / "Phone" badge for requests staff entered by hand; nothing for online ones. */
export function SourceNote({ source }) {
  if (!source || source === 'Online') return null;
  return <Badge tone="gray">{source}</Badge>;
}
