import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import { excerpt } from '../../lib/seo.js';
import { PRAYER_WALL, prayerPath, prayerTitle } from '../../lib/prayers.js';
import { usePrayerWall } from '../../pages/site/data.js';

const MOST = 12;

/**
 * Home's running line of prayer requests, under the hero (or the census
 * notice): the newest on the prayer wall, each a link to its page, and
 * "Tanan" to the wall. Hidden while loading, on an error, and with none
 * showing. It stops on hover, on focus and with the pause button; with
 * reduced motion it doesn't move at all and scrolls sideways instead. The
 * census ticker is for the inner pages only, so the two never stack.
 */
export default function PrayerTicker() {
  const q = usePrayerWall();
  const [paused, setPaused] = useState(false);
  const rows = (q.data || []).slice(0, MOST);
  if (q.loading || q.error || !rows.length) return null;

  // Slow enough to read: about six seconds a request.
  const duration = `${Math.max(24, rows.length * 6)}s`;
  const items = (copy) => rows.map((r) => (
    <Link
      key={`${copy}-${r.id}`}
      to={prayerPath(r.id)}
      tabIndex={copy ? -1 : undefined}
      className="inline-flex items-center gap-2 whitespace-nowrap text-[14.5px] lg:text-[15px] text-parish-navy hover:underline underline-offset-2"
    >
      <Icon name="heart" size={15} className="flex-none text-[var(--p-gold-deep)]" />
      <span className="font-bold">{prayerTitle(r)}</span>
      <span className="text-[#4d4636]">— {excerpt(r.intention, 80)}</span>
    </Link>
  ));

  return (
    <section
      aria-label="Mga hangyo sa pag-ampo"
      className={`prayer-ticker border-b ${paused ? 'is-paused' : ''}`}
      style={{ background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)', '--ticker-duration': duration }}
    >
      <div className="max-w-[1240px] mx-auto min-h-[48px] pl-3 pr-1.5 lg:px-6 flex items-center gap-2.5 lg:gap-3">
        <Link to={PRAYER_WALL} className="flex-none font-bold text-[11px] lg:text-[11.5px] tracking-[.14em] uppercase text-[var(--p-eyebrow)] hover:underline">Pag-ampo</Link>
        <div className="prayer-ticker__window flex-1 min-w-0">
          <div className="prayer-ticker__track">
            <div className="prayer-ticker__copy">{items(0)}</div>
            <div className="prayer-ticker__copy" aria-hidden="true">{items(1)}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Padayona ang pag-scroll' : 'Hunonga ang pag-scroll'}
          aria-pressed={paused}
          className="prayer-ticker__pause flex-none w-9 h-9 rounded-full flex items-center justify-center text-parish-navy hover:bg-white/60 font-bold text-[13px]"
        >
          {paused ? '▶' : '❚❚'}
        </button>
        <Link to={PRAYER_WALL} className="flex-none inline-flex items-center min-h-[36px] px-1 font-bold text-[14px] text-parish-blue hover:underline">Tanan</Link>
      </div>
    </section>
  );
}
