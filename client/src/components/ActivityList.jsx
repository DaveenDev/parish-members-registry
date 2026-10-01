import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDateTime } from '../constants.js';
import { describeActivity, activityActor } from '../lib/activity.js';

/** One activity log entry: what happened, who did it and when, and each field that changed. */
export function ActivityEntry({ entry, showLabel = false, onOpen }) {
  const d = describeActivity(entry);
  return (
    <li className="py-2.5 flex gap-3">
      <span className="w-2 h-2 rounded-full bg-[var(--p-gold)] mt-[7px] flex-none" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] text-parish-navy">
          <strong>{d.title}</strong>
          {showLabel && entry.label && (
            <> · {onOpen
              ? <button type="button" onClick={() => onOpen(entry)} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue hover:underline">{entry.label}</button>
              : <span className="font-semibold">{entry.label}</span>}</>
          )}
        </div>
        <div className="text-[12px] text-parish-muted">{activityActor(entry)} · {fmtDateTime(entry.at)}</div>
        {!!d.lines.length && (
          <ul className="list-none m-0 mt-1 p-0 text-[12.5px] text-parish-text2 flex flex-col gap-0.5">
            {d.lines.map((l) => <li key={l} className="break-words">{l}</li>)}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * The change history of one household or member, newest first, ten at a
 * time. Before the 0014 migration it says so instead.
 */
export default function ActivityList({ householdId, memberId, reloadKey }) {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => { setRows(null); setPage(1); }, [householdId, memberId, reloadKey]);
  useEffect(() => {
    let cancelled = false;
    setError('');
    api.listActivity({ householdId, memberId, page, pageSize: 10 })
      .then((r) => { if (!cancelled) { setRows((prev) => (page === 1 ? r.rows : [...(prev || []), ...r.rows])); setTotal(r.total); } })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load the history'); });
    return () => { cancelled = true; };
  }, [householdId, memberId, page, reloadKey]);

  if (error) return <div className="text-[13px] text-parish-muted">{error}</div>;
  if (!rows) return <div className="text-[13px] text-parish-muted" role="status">Loading history…</div>;
  if (!rows.length) return <div className="text-[13px] text-parish-muted">No changes recorded yet. Changes are recorded from the 0014 migration on.</div>;
  return (
    <>
      <ul className="list-none m-0 p-0 divide-y divide-[#f1e8d5]">
        {rows.map((e) => <ActivityEntry key={e.id} entry={e} showLabel={!!householdId && e.table_name !== 'households'} />)}
      </ul>
      {rows.length < total && (
        <button type="button" onClick={() => setPage((p) => p + 1)} className="mt-2 appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue p-0">
          Show older changes ({total - rows.length} more)
        </button>
      )}
    </>
  );
}
