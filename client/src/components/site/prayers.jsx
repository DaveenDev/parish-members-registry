import React, { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import { Chip, useSiteToast } from './kit.jsx';
import { CardShare } from './cards.jsx';
import { api } from '../../api.js';
import { fmtShort } from '../../lib/site.js';
import { prayerFrom, prayerPath, prayerTitle, prayerTypeLabel, prayerVisitorId } from '../../lib/prayers.js';

// The prayer wall's pieces, shared by its pages (pages/site/Prayers.jsx) and
// the section on Komunidad.

export const PRAYER_TONES = { 'For the sick': 'blue', Thanksgiving: 'gold', 'For the departed': 'gray', 'Special intention': 'green' };

export function PrayerChip({ r }) {
  return <Chip tone={PRAYER_TONES[r.type] || 'green'}>{prayerTypeLabel(r.type)}</Chip>;
}

// "Nag-ampo ko" taps made on this visit, by request id: { prayed, prayed_by_me }.
// The wall and a request's page are cached for the visit (usePublicData), so a
// tap on one shows on the other, and on going back, without loading again.
const taps = new Map();
const listeners = new Set();
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
function setTap(id, value) {
  if (value) taps.set(id, value); else taps.delete(id);
  listeners.forEach((fn) => fn());
}

/** Request `r`'s count and whether this browser prayed, with `pray()` to tap "Nag-ampo ko". */
export function usePrayed(r) {
  const tap = useSyncExternalStore(subscribe, () => taps.get(r.id));
  const say = useSiteToast();
  const [busy, setBusy] = useState(false);
  const prayed = tap ? tap.prayed : Number(r.prayed) || 0;
  const mine = tap ? tap.prayed_by_me : !!r.prayed_by_me;

  async function pray() {
    if (mine || busy) return;
    const before = tap || null;
    setBusy(true);
    // Counted straight away; the database's answer replaces it.
    setTap(r.id, { prayed: prayed + 1, prayed_by_me: true });
    try {
      const res = await api.prayForRequest(r.id, prayerVisitorId());
      setTap(r.id, { prayed: Number(res?.prayed) || prayed + 1, prayed_by_me: true });
    } catch (e) {
      setTap(r.id, before);
      const msg = e?.message || '';
      say(msg && !/fetch|network|failed to/i.test(msg) ? msg : 'Wala ma-ihap. Susiha ang koneksyon ug sulayi pag-usab.');
    } finally {
      setBusy(false);
    }
  }

  return { prayed, mine, busy, pray };
}

/** "Usa ka tawo ang nag-ampo" / "12 ka tawo ang nag-ampo", or an invitation when none yet. */
export function prayedText(n) {
  if (!n) return 'Mahimo ka nga una nga mag-ampo';
  return n === 1 ? 'Usa ka tawo ang nag-ampo' : `${n.toLocaleString('en-US')} ka tawo ang nag-ampo`;
}

/** "Nag-ampo ko": once per phone or computer, then it says so. `big` for a request's own page. */
export function PrayButton({ r, big = false }) {
  const { prayed, mine, busy, pray } = usePrayed(r);
  const size = big ? 'min-h-[54px] px-6 text-[16.5px] rounded-[14px]' : 'min-h-[44px] px-4 text-[14.5px] rounded-xl';
  return (
    <div className={`flex items-center gap-3 flex-wrap ${big ? 'flex-col items-stretch sm:flex-row sm:items-center' : ''}`}>
      <button
        type="button"
        aria-pressed={mine}
        onClick={pray}
        disabled={busy && !mine}
        className={`inline-flex items-center justify-center gap-2 font-bold border-[1.5px] transition-colors ${size} ${mine
          ? 'bg-parish-okBg text-parish-ok border-[#bfe0cc] cursor-default'
          : 'bg-parish-blue text-white border-parish-blue hover:bg-parish-blueDeep cursor-pointer'}`}
      >
        <Icon name={mine ? 'check' : 'heart'} size={big ? 20 : 17} />
        {mine ? 'Nag-ampo ka na' : 'Nag-ampo ko'}
      </button>
      <span className={`${big ? 'text-[15px]' : 'text-[13.5px]'} text-parish-text2`} aria-live="polite">{prayedText(prayed)}</span>
    </div>
  );
}

/** One request on the wall: its kind, who it's for, the request, who asked, and "Nag-ampo ko". */
export function PrayerCard({ r }) {
  const path = prayerPath(r.id);
  const title = prayerTitle(r);
  return (
    <article className="relative bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm p-4 lg:p-5 flex flex-col">
      <CardShare title={`Hangyo sa pag-ampo: ${title}`} path={path} />
      <div className="pr-10"><PrayerChip r={r} /></div>
      <h3 className="m-0 mt-2 font-serif font-bold text-[20px] lg:text-[22px] leading-[1.2] text-parish-navy">
        <Link to={path} className="hover:underline underline-offset-2">{title}</Link>
      </h3>
      <p className="m-0 mt-1.5 text-[15px] lg:text-[15.5px] leading-relaxed text-[#3f3b2f] whitespace-pre-line line-clamp-5 [overflow-wrap:anywhere]">{r.intention}</p>
      <div className="mt-2 text-[13px] text-parish-text2">{prayerFrom(r)} · {fmtShort(r.date)}</div>
      <div className="mt-auto pt-3.5"><PrayButton r={r} /></div>
    </article>
  );
}
