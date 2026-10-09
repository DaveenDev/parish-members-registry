import React, { useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { Panel } from './admin.jsx';

/**
 * Whether the census uses last year's household list (0048), on the Census
 * page's "Last year's list" tab, for staff who can change settings.
 * On: each GKK is measured against its names on the list, and the names not
 * ticked off are the families to visit. Off: the census compares with the
 * previous census in the registry instead; the names are kept but not shown.
 * `cycles` are the census cycles, newest first; `onChanged` gets the saved settings.
 */
export default function LastYearListSwitch({ parish, cycles, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = parish?.last_year_list_enabled !== false;
  // With the list off, a census needs an earlier one in the registry to compare with.
  const latest = cycles?.[0];
  const noEarlier = cycles && cycles.length < 2;

  async function toggle(next) {
    setBusy(true);
    try {
      const res = await api.updateSettings({ last_year_list_enabled: next });
      onChanged(res.settings);
      toast.success(next ? "Last year's list is in use" : 'The census now compares with the previous census');
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-6 mb-[18px]">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px] max-w-[720px]">
          <div className="font-serif text-[22px] font-semibold text-parish-navy">Use last year's household list for CENSUS</div>
          <div className="text-[13.5px] text-parish-muted mt-1 leading-relaxed">
            How the census tracks the families who haven't registered yet. Use the list when last year's census was on paper; turn it off once the previous census was held in this registry.
          </div>
        </div>
        <label className={`flex items-center gap-3 cursor-pointer select-none ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          <span className="font-semibold text-[14px] text-parish-text2">{on ? 'On' : 'Off'}</span>
          <span className="relative inline-flex">
            <input type="checkbox" role="switch" aria-label="Use last year's household list" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} className="peer sr-only" />
            <span className="w-12 h-7 rounded-full bg-parish-sunk border border-parish-border transition peer-checked:bg-parish-fill peer-checked:border-transparent peer-focus-visible:ring-4 peer-focus-visible:ring-parish-blue/20" />
            <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
          </span>
        </label>
      </div>

      <div className="grid gap-3 mt-5 sm:grid-cols-2">
        <div className={`rounded-xl border px-4 py-3.5 ${on ? 'border-[var(--p-blue-border)] bg-[var(--p-blue-tint)]' : 'border-parish-line2 bg-parish-field opacity-75'}`}>
          <div className="font-semibold text-[14px] text-parish-navy mb-1">{on && '✓ '}On: last year's list</div>
          <div className="text-[13px] text-parish-text2 leading-relaxed">Each GKK is measured against its names below (or the household count in Parish GKK when it has none). The list comes first: a count that doesn't match a GKK's names is cleared. Tick families off as they register; the names left are printed for house visits.</div>
        </div>
        <div className={`rounded-xl border px-4 py-3.5 ${!on ? 'border-[var(--p-blue-border)] bg-[var(--p-blue-tint)]' : 'border-parish-line2 bg-parish-field opacity-75'}`}>
          <div className="font-semibold text-[14px] text-parish-navy mb-1">{!on && '✓ '}Off: the previous census</div>
          <div className="text-[13px] text-parish-text2 leading-relaxed">Each GKK is measured against the households that took part in the previous census here (until there is one, against the household count in Parish GKK). Those not registered yet are listed under Census → Results by GKK, to print or export.</div>
        </div>
      </div>
      {!on && noEarlier && (
        <div className="mt-4 px-4 py-3 rounded-xl border border-[#fdba74] bg-[#fff7ed] text-[13.5px] text-[#9a3412]">
          {latest ? <>The {latest.label} is the only census in the registry, so there's nothing earlier to compare it with.</> : <>No census has been held in the registry yet.</>}{' '}
          Until there is, each GKK is measured against its households last year set in Parish GKK, which gives how many haven't registered but not their names. Turn the list back on if last year's census was on paper.
        </div>
      )}
    </Panel>
  );
}
