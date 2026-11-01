import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { usePublicData } from './site/usePublicData.js';
import { filterGkks } from '../lib/site.js';

/**
 * "Dili sigurado? Tan-awa ang GKK directory": under the registration form's
 * GKK choice, a bottom sheet with the parish's GKKs to search by where the
 * family lives (barangay, purok, sitio or chapel), each with its Bible-sharing
 * time, and a button to choose it. Only what the public GKK directory shows.
 */
export default function GkkHelpSheet({ onPick }) {
  const [open, setOpen] = useState(false);
  const opener = useRef(null);
  return (
    <>
      <button
        ref={opener} type="button" onClick={() => setOpen(true)}
        className="appearance-none border-none bg-transparent p-0 mt-1.5 min-h-[44px] cursor-pointer text-left font-semibold text-[13.5px] text-parish-blue underline underline-offset-2"
      >
        Dili sigurado? Tan-awa ang GKK directory
      </button>
      {open && (
        <Sheet
          onClose={() => { setOpen(false); opener.current?.focus(); }}
          onPick={(name) => { setOpen(false); onPick(name); }}
        />
      )}
    </>
  );
}

function Sheet({ onClose, onPick }) {
  const dir = usePublicData('gkks', api.publicGkkDirectory);
  const [q, setQ] = useState('');
  const box = useRef(null);
  const search = useRef(null);
  const items = filterGkks(dir.data || [], q).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    search.current?.focus();
    return () => { document.body.style.overflow = overflow; };
  }, []);

  // Escape closes; Tab stays inside the sheet.
  function onKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab') return;
    const all = [...box.current.querySelectorAll('button, input')].filter((el) => !el.disabled);
    if (!all.length) return;
    const at = all.indexOf(document.activeElement);
    const next = e.shiftKey ? (at <= 0 ? all.length - 1 : at - 1) : (at === -1 || at === all.length - 1 ? 0 : at + 1);
    e.preventDefault();
    all[next].focus();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        ref={box} role="dialog" aria-modal="true" aria-labelledby="gkk-sheet-title" onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[560px] max-h-[85vh] flex flex-col bg-parish-bg rounded-t-[22px] sm:rounded-[22px] shadow-card"
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <h2 id="gkk-sheet-title" className="flex-1 m-0 font-serif text-[24px] font-semibold text-parish-navy">Mga GKK sa parokya</h2>
          <button type="button" aria-label="Isira" onClick={onClose} className="w-11 h-11 flex-none rounded-full border-none bg-parish-card text-[20px] cursor-pointer text-parish-navy">×</button>
        </div>
        <div className="px-4 pb-2">
          <label htmlFor="gkk-sheet-q" className="block font-bold text-[14px] text-parish-navy mb-1">Asa ka nagpuyo?</label>
          <input
            id="gkk-sheet-q" ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Barangay, sitio, purok o kapilya"
            className="w-full min-h-[48px] px-3.5 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-[14px] outline-none focus:border-parish-blue"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
          {dir.loading ? <p className="text-parish-text2 text-[15px]">Gikuha ang listahan…</p>
            : dir.error ? <p className="text-parish-error text-[15px]">Wala ma-load ang listahan. Susiha ang internet.</p>
              : !items.length ? <p className="text-parish-text2 text-[15px]">Walay GKK nga nakit-an{q ? ` para sa “${q}”` : ''}. Pangutan-a ang opisina sa parokya.</p>
                : (
                  <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
                    {items.map((g) => (
                      <li key={g.name} className="bg-parish-card border border-parish-border rounded-2xl p-3.5">
                        <div className="font-serif text-[20px] font-bold leading-tight text-parish-navy">{g.patron} {g.area && <span className="text-parish-blue">-{g.area}</span>}</div>
                        {g.puroks && <div className="text-[13.5px] text-parish-text2 mt-0.5">{g.puroks}</div>}
                        {g.chapel_address && <div className="text-[13.5px] text-parish-text2">Kapilya: {g.chapel_address}</div>}
                        {g.meeting_schedule && <div className="text-[13.5px] text-[#3f3b2f]">Bible-sharing: {g.meeting_schedule}</div>}
                        <button
                          type="button" onClick={() => onPick(g.name)}
                          className="mt-2.5 w-full min-h-[46px] rounded-xl border-none bg-parish-blue text-white font-bold text-[15px] cursor-pointer"
                        >
                          Mao ni ang among GKK
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
        </div>
      </div>
    </div>
  );
}
