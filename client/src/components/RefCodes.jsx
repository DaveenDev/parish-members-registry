import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorState, LoadingState, Panel } from './admin.jsx';
import { TextInput } from './ui.jsx';
import { RowButton } from './panels.jsx';
import { useToast } from '../ToastContext.jsx';

// Desktop columns: barangay, code, next number, save.
const COLS = 'lg:grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_auto] lg:gap-4';
const validCode = (c) => /^[A-Z]{3}$/.test(c);

/**
 * Each barangay's 3-letter code (0047), the start of its families'
 * reference numbers: MEO-2026-0001. The barangay is the part of a GKK name
 * after " -", so every barangay with a GKK is listed. A changed code only
 * applies to new numbers.
 */
export default function RefCodes() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState('');

  function reload() {
    setLoadError('');
    api.listBarangayRefCodes()
      .then((r) => { setRows(r); setDrafts({}); })
      .catch((e) => setLoadError(e.message || 'Could not load the codes'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function save(row) {
    const code = drafts[row.barangay];
    setSaving(row.barangay);
    try {
      await api.setBarangayRefCode(row.barangay, code);
      toast.success(`${row.barangay} is now ${code}`);
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not save this code');
    } finally {
      setSaving('');
    }
  }

  return (
    <Panel className="p-6 mt-6">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Reference numbers</div>
      <div className="text-[13.5px] text-parish-muted mb-4 max-w-[720px]">
        A family's reference number starts with the 3-letter code of its GKK's barangay, then the year it registered and a number counted per barangay,
        e.g. <strong className="text-parish-text2">MEO-2026-0001</strong>. Changing a code only affects new numbers: families keep the numbers they have.
      </div>
      {rows.length > 0 && (
        <div className={`hidden lg:grid ${COLS} px-3.5 pb-2 font-semibold text-[11.5px] tracking-wide uppercase text-parish-muted`}>
          <span>Barangay</span><span>Code</span><span>Next number</span><span />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const draft = drafts[r.barangay] ?? r.code;
          const changed = draft !== r.code;
          const bad = changed && !validCode(draft);
          return (
            <div key={r.barangay} className={`flex flex-wrap items-center gap-2.5 lg:grid ${COLS} border border-parish-line2 rounded-xl px-3.5 py-2.5 bg-parish-field`}>
              <div className="w-full lg:w-auto min-w-0">
                <div className="font-semibold text-[14.5px] text-parish-navy">{r.barangay}</div>
                <div className="text-[12.5px] text-parish-muted">{r.gkks ? `${r.gkks} GKK${r.gkks === 1 ? '' : 's'}` : 'No GKK (from a household address)'}</div>
              </div>
              <TextInput
                aria-label={`Code for ${r.barangay}`}
                aria-invalid={bad || undefined}
                value={draft}
                maxLength={3}
                autoCapitalize="characters"
                spellCheck={false}
                className="!w-[96px] !py-2 font-semibold tracking-[.08em] uppercase"
                onChange={(e) => setDrafts((d) => ({ ...d, [r.barangay]: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && changed && !bad) save(r); }}
              />
              <span className="text-[13.5px] text-parish-text2">
                {bad ? <span className="text-parish-error font-semibold">3 letters, A to Z</span>
                  : <><span className="lg:hidden">Next: </span>{changed ? r.next_ref.replace(/^[A-Z]{3}/, draft).replace(/-\d+$/, '-…') : r.next_ref}</>}
              </span>
              <div className="flex gap-2 lg:justify-end">
                {changed && <RowButton tone="gray" onClick={() => setDrafts((d) => ({ ...d, [r.barangay]: r.code }))} className="px-3.5 py-2">Undo</RowButton>}
                <RowButton onClick={() => save(r)} disabled={!changed || bad || !!saving} className="px-3.5 py-2 disabled:!opacity-50 disabled:cursor-not-allowed">
                  {saving === r.barangay ? 'Saving…' : 'Save'}
                </RowButton>
              </div>
            </div>
          );
        })}
        {loading && <LoadingState label="Loading…" />}
        {!loading && loadError && <ErrorState message={loadError} onRetry={reload} />}
        {!loading && !loadError && !rows.length && <div className="text-[13.5px] text-parish-muted">No barangays yet. Name each GKK “Patron -Barangay”, e.g. “Santo Rosario -Meohao”.</div>}
      </div>
    </Panel>
  );
}
