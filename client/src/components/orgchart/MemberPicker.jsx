import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useDebounced } from '../../hooks.js';
import { memberFullName } from '../../lib/util.js';
import { TextInput } from '../ui.jsx';
import { RowButton } from '../panels.jsx';

/** Search the registry for a position's holder. `gkk` limits it to one GKK's members. */
export default function MemberPicker({ onPick, gkk = null, disabled = false }) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 350);
  const [state, setState] = useState({ rows: [], loading: false, error: '' });

  useEffect(() => {
    if (debounced.length < 2) { setState({ rows: [], loading: false, error: '' }); return undefined; }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    api.listMembers({ search: debounced, pageSize: 6, ...(gkk ? { gkk } : {}) })
      .then((r) => { if (!cancelled) setState({ rows: r.rows, loading: false, error: '' }); })
      .catch((e) => { if (!cancelled) setState({ rows: [], loading: false, error: e.message || 'Search failed' }); });
    return () => { cancelled = true; };
  }, [debounced, gkk]);

  return (
    <div className="flex flex-col gap-2">
      <TextInput
        aria-label="Search the member registry" value={query} disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={gkk ? `Search members of ${gkk}` : 'Search members by name'}
        className="!py-2.5 !text-[15px]"
      />
      {state.loading && <div className="text-[13px] text-parish-muted">Searching…</div>}
      {state.error && <div className="text-[13px] text-parish-error">{state.error}</div>}
      {!state.loading && debounced.length >= 2 && !state.rows.length && !state.error && (
        <div className="text-[13px] text-parish-muted">No registered member matches. Type the name below instead.</div>
      )}
      {state.rows.map((m) => (
        <div key={m.id} className="flex items-center gap-3 border border-parish-line2 rounded-xl bg-parish-field px-3 py-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[13.5px] text-parish-navy truncate">{memberFullName(m)}{m.suffix ? ` ${m.suffix}` : ''}</div>
            <div className="text-[12px] text-parish-muted truncate">{[m.household_name, m.household_gkk].filter(Boolean).join(' · ')}</div>
          </div>
          <RowButton onClick={() => { onPick(m); setQuery(''); }}>Pick</RowButton>
        </div>
      ))}
    </div>
  );
}

/** "Juan Dela Cruz Jr." for a members_with_household row. */
export const pickedName = (m) => [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ');
