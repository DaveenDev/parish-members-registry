import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, LoadingState, ErrorState, EmptyState, SearchInput } from './admin.jsx';
import { Select, PrimaryButton } from './ui.jsx';
import { OCCUPATION_GROUPS } from '../constants.js';
import { occupationGroupLabel, unsortedOccupations } from '../lib/ofw.js';
import { useToast } from '../ToastContext.jsx';

/**
 * Reports → Sort occupations (0121): the occupations typed with no group yet,
 * each with how many members gave it and a group to give them all at once.
 * A group the words suggest is shown, never applied without a click. For Full
 * access and GKK leaders (`gkk`: their GKK; the row rules keep them to it).
 */
export default function SortOccupations({ gkk = 'All', onClose, onSorted }) {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState({});
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');

  function load() {
    setError('');
    api.unsortedOccupationMembers({ gkk })
      .then((rows) => setItems(unsortedOccupations(rows)))
      .catch((e) => setError(e.message || 'Could not load the occupations'));
  }
  useEffect(() => { load(); }, [gkk]); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply(item) {
    const group = picked[item.key];
    if (!group) return;
    setBusy(item.key);
    try {
      const n = await api.setOccupationGroup(item.ids, group);
      toast.success(`${n} member(s) “${item.label}” → ${occupationGroupLabel(group)}`);
      setItems((list) => list.filter((x) => x.key !== item.key));
      onSorted && onSorted();
    } catch (e) {
      toast.error(e.message || 'Could not save the group');
    } finally {
      setBusy('');
    }
  }

  const q = query.trim().toLowerCase();
  const shown = (items || []).filter((x) => !q || x.key.includes(q));
  const left = (items || []).reduce((n, x) => n + x.count, 0);
  return (
    <Modal title="Sort occupations" onClose={onClose} maxWidth={760}>
      <p className="text-[13.5px] text-parish-text2 mt-0 mb-3">
        What members typed as their occupation, with no occupation group yet{gkk !== 'All' ? ` (${gkk})` : ''}. Pick a group and press
        Save to give it to everyone who typed the same words. A suggestion from the words is shown; nothing is saved until you press Save.
      </p>
      {error ? <ErrorState message={error} onRetry={load} /> : !items ? <LoadingState /> : !items.length ? (
        <EmptyState title="Every occupation is sorted" subtitle="New ones appear here as families register or the census adds them." />
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap mb-3">
            <SearchInput placeholder="Find an occupation…" aria-label="Find an occupation" value={query} onChange={(e) => setQuery(e.target.value)} />
            <span className="text-[13px] text-parish-muted">{items.length} answer(s), {left} member(s) to sort</span>
          </div>
          <ul className="list-none m-0 p-0 divide-y divide-parish-line border border-parish-line rounded-xl">
            {shown.map((item) => {
              const value = picked[item.key] || '';
              return (
                <li key={item.key} className="px-3.5 py-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-[180px] flex-1">
                    <div className="font-semibold text-[14.5px] text-parish-navy">{item.label}</div>
                    <div className="text-[12.5px] text-parish-muted">
                      {item.count} member(s)
                      {item.suggestion && !value && (
                        <>
                          {' · '}suggested:{' '}
                          <button type="button" onClick={() => setPicked((p) => ({ ...p, [item.key]: item.suggestion }))}
                            className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[12.5px] text-parish-blue underline">
                            {occupationGroupLabel(item.suggestion)}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <Select aria-label={`Occupation group for ${item.label}`} value={value} onChange={(e) => setPicked((p) => ({ ...p, [item.key]: e.target.value }))} className="!w-auto min-w-[220px]">
                    <option value="">Choose a group…</option>
                    {OCCUPATION_GROUPS.map((g) => <option key={g} value={g}>{occupationGroupLabel(g)}</option>)}
                  </Select>
                  <PrimaryButton onClick={() => apply(item)} disabled={!value || !!busy} className="px-4 py-2.5 text-[13.5px]">
                    {busy === item.key ? 'Saving…' : 'Save'}
                  </PrimaryButton>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
