import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import { Skeleton } from './kit.jsx';

const NAV_BTN = 'min-h-[44px] px-3.5 inline-flex items-center gap-1.5 rounded-xl border-[1.5px] border-[var(--p-blue-border)] bg-parish-card font-bold text-[14px] text-parish-blueDeep cursor-pointer appearance-none hover:bg-[var(--p-blue-tint)] disabled:opacity-50';

/**
 * Pulong sa Dios: one of 100 Bible verses on the heart of the Catholic
 * faith (lib/verses.js), a random one each time the page opens, with what
 * the Catechism teaches about it below. Visitors can page through the others.
 * The verses load on their own, after the page; `onLoad` says when they're in
 * (or failed).
 */
export default function VerseOfDay({ onLoad }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => {
    let live = true;
    import('../../lib/verses.js')
      .then((m) => {
        if (!live) return;
        setI(Math.floor(Math.random() * m.VERSES.length));
        setData(m);
      })
      .catch(() => live && setFailed(true))
      .finally(() => live && onLoad?.());
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (failed) return null;
  if (!data) return <Skeleton h={340} className="rounded-[20px]" />;
  const { VERSES, PARTS } = data;
  const v = VERSES[i];
  const go = (step) => setI((i + step + VERSES.length) % VERSES.length);

  return (
    <article aria-labelledby="pulong-title" className="bg-parish-card border border-parish-border rounded-[20px] shadow-card overflow-hidden">
      <div className="h-1.5" style={{ background: 'var(--p-gold)' }} />
      <div className="px-4 pt-4 pb-5 lg:px-10 lg:pt-8 lg:pb-8">
        <div className="flex items-center gap-2 flex-wrap mb-3 lg:mb-5">
          <h2 id="pulong-title" className="m-0 font-bold text-[12px] lg:text-[12.5px] tracking-[.16em] uppercase text-[var(--p-eyebrow)]">
            Pulong sa Dios
          </h2>
          <span className="font-bold text-[11px] tracking-[.06em] uppercase rounded-md px-2 py-0.5 text-parish-blueDeep border border-[var(--p-blue-border)]" style={{ background: 'var(--p-blue-tint)' }}>
            {PARTS[v.part]}
          </span>
        </div>

        <div aria-live="polite">
          <blockquote className="m-0">
            <p className="m-0 font-serif text-[20px] leading-[1.35] sm:text-[23px] lg:text-[34px] lg:leading-[1.25] text-parish-navy">{v.text}</p>
            <footer className="mt-2.5 lg:mt-3.5 font-bold text-[15px] lg:text-[17px] text-[var(--p-gold-deep)]">— {v.ref}</footer>
          </blockquote>

          <section aria-labelledby="tudlo-title" className="mt-5 lg:mt-7 pt-4 lg:pt-6 border-t border-[#f0e8d6] lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
            <div className="flex lg:flex-col gap-2.5 lg:gap-1.5 items-center lg:items-start mb-2 lg:mb-0">
              <span className="w-9 h-9 lg:w-11 lg:h-11 flex-none rounded-xl flex items-center justify-center text-parish-blue" style={{ background: 'var(--p-blue-tint)' }}>
                <Icon name="ev-seminar" size={20} />
              </span>
              <div>
                <h3 id="tudlo-title" className="m-0 font-bold text-[15px] lg:text-[16px] text-parish-navy">Ang gitudlo sa Simbahan</h3>
                <div className="text-[12.5px] lg:text-[13px] text-parish-text2">Katesismo sa Simbahang Katoliko, <abbr title="Catechism of the Catholic Church" className="no-underline">CCC</abbr> {v.ccc}</div>
              </div>
            </div>
            <p className="m-0 text-[15.5px] lg:text-[17px] leading-relaxed text-[#3f3b2f]">{v.explain}</p>
          </section>
        </div>

        <div className="mt-5 lg:mt-7 flex items-center gap-2 flex-wrap">
          <button type="button" className={NAV_BTN} onClick={() => go(-1)} aria-label="Miaging bersikulo">
            <Icon name="back" size={16} />Kaniadto
          </button>
          <button type="button" className={NAV_BTN} onClick={() => go(1)} aria-label="Sunod nga bersikulo">
            Sunod<Icon name="chev" size={16} />
          </button>
          {/* The day's Mass readings, on their own page. */}
          <Link
            to="/simbahan/pagbasa"
            className="min-h-[44px] px-4 inline-flex items-center gap-1.5 rounded-xl bg-parish-blue text-white font-bold text-[14px] shadow-btn hover:brightness-110"
          >
            <Icon name="doc" size={16} />Daily Readings
          </Link>
          <span className="ml-auto text-[13px] text-parish-text2">{i + 1} sa {VERSES.length}</span>
        </div>
        <p className="m-0 mt-3 text-[12px] text-parish-text2">Bibliya: World English Bible (public domain). Ang pagpasabot gikan sa Katesismo sa Simbahang Katoliko.</p>
      </div>
    </article>
  );
}
