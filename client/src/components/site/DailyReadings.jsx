import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Skeleton } from './kit.jsx';
import { BIS_DAYS, BIS_MONTHS, parseIso } from '../../lib/site.js';
import { addDays } from '../../lib/website.js';
import { DAY_RANGE, UNIVERSALIS_PAGE, manilaToday, toReadings, universalisUrl } from '../../lib/readings.js';

const NAV_BTN = 'min-h-[44px] min-w-[44px] px-3 inline-flex items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-[var(--p-blue-border)] bg-parish-card font-bold text-[14px] text-parish-blueDeep cursor-pointer appearance-none hover:bg-[var(--p-blue-tint)] disabled:opacity-40 disabled:cursor-not-allowed';

// The reading text: prose paragraphs get space between them (and keep a
// first-line indent), verse lines hang, and a new stanza gets space above.
const BODY = 'text-[16.5px] lg:text-[17.5px] leading-[1.7] text-[#3f3b2f] max-w-[68ch] [&>div+div:not([data-line])]:mt-3 [&>p+p]:mt-3 [&_[data-indent]]:indent-[1em] [&_[data-line]]:pl-[1.6em] [&_[data-line]]:-indent-[1.6em] [&_[data-gap]]:mt-3.5';
// In the psalm, the italic lines between stanzas are the response.
const PSALM = '[&_i]:font-semibold [&_i]:text-parish-blueDeep';

/** Universalis answers by calling a function of ours (JSONP). One request per day, shared. */
const days = new Map();
function loadDay(iso) {
  if (!days.has(iso)) {
    const p = new Promise((resolve, reject) => {
      const name = `universalis_${iso.replaceAll('-', '')}_${Math.random().toString(36).slice(2, 8)}`;
      const script = document.createElement('script');
      const done = () => { clearTimeout(timer); delete window[name]; script.remove(); };
      const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, 12000);
      window[name] = (data) => { done(); resolve(data); };
      script.onerror = () => { done(); reject(new Error('load')); };
      script.src = universalisUrl(iso, name);
      document.head.appendChild(script);
    });
    // A failed day can be tried again.
    p.catch(() => days.delete(iso));
    days.set(iso, p);
  }
  return days.get(iso);
}

/** "Martes, 6 Oktubre 2026" */
function fmtDate(iso) {
  const d = parseIso(iso);
  return `${BIS_DAYS[d.getDay()]}, ${d.getDate()} ${BIS_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const WHEN = { '-1': 'Kagahapon', 0: 'Karong adlawa', 1: 'Ugma' };

/**
 * Mga Pagbasa sa Misa: the day's readings (first reading, psalm, second
 * reading on Sundays and feasts, Gospel) from Universalis, Philippine
 * calendar (lib/readings.js). On a computer the readings are a list on the
 * left and the chosen one on the right; on a phone they're tabs above the
 * text. Visitors can move a few days back or ahead. `onLoad` says when the
 * first day is in (or failed), since the card changes the page's height.
 */
export default function DailyReadings({ onLoad }) {
  const today = manilaToday();
  const [offset, setOffset] = useState(0);
  const iso = addDays(today, offset);
  const [state, setState] = useState({ status: 'loading' });
  const [picked, setPicked] = useState('Mass_R1');
  const [retry, setRetry] = useState(0);
  const reported = useRef(false);
  const panel = useRef(null);

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    loadDay(iso)
      .then((data) => {
        if (!live) return;
        const day = toReadings(data);
        setState(day.readings.length ? { status: 'ok', ...day } : { status: 'error' });
      })
      .catch(() => live && setState({ status: 'error' }))
      .finally(() => {
        if (live && !reported.current) { reported.current = true; onLoad?.(); }
      });
    return () => { live = false; };
  }, [iso, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const readings = state.status === 'ok' ? state.readings : [];
  const at = Math.max(0, readings.findIndex((r) => r.key === picked));
  const current = readings[at];
  const next = readings[at + 1];

  function choose(key, focus) {
    setPicked(key);
    // After React has drawn the change.
    setTimeout(() => {
      const tab = document.getElementById(`pagbasa-tab-${key}`);
      // On a phone the tabs scroll sideways: bring the chosen one into view.
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (focus) tab?.focus();
    });
  }

  function readNext() {
    choose(next.key);
    // The next reading starts at the top of the text, not where this one ended.
    setTimeout(() => panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  }

  // Arrow keys move between the readings, as in any tab list.
  function onTabKey(e) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    choose(readings[(at + step + readings.length) % readings.length].key, true);
  }

  return (
    <article aria-labelledby="pagbasa-title" className="bg-parish-card border border-parish-border rounded-[20px] shadow-card overflow-hidden">
      <div className="h-1.5 bg-parish-blue" />
      <div className="px-4 pt-4 pb-5 lg:px-10 lg:pt-8 lg:pb-8">
        <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start lg:mb-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h2 id="pagbasa-title" className="m-0 font-bold text-[12px] lg:text-[12.5px] tracking-[.16em] uppercase text-[var(--p-eyebrow)]">Mga Pagbasa sa Misa</h2>
              {WHEN[offset] && (
                <span className="font-bold text-[11px] tracking-[.06em] uppercase rounded-md px-2 py-0.5 text-parish-blueDeep border border-[var(--p-blue-border)]" style={{ background: 'var(--p-blue-tint)' }}>
                  {WHEN[offset]}
                </span>
              )}
            </div>
            <div className="font-serif text-[24px] lg:text-[32px] leading-tight text-parish-navy">{fmtDate(iso)}</div>
            <div className="mt-1 text-[14.5px] lg:text-[15.5px] text-parish-text2 min-h-[1.5em]">{state.status === 'ok' ? state.day : ''}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" className={NAV_BTN} onClick={() => setOffset(offset - 1)} disabled={offset <= DAY_RANGE.min} aria-label="Miaging adlaw">
              <Icon name="back" size={16} />
            </button>
            {offset !== 0 && <button type="button" className={NAV_BTN} onClick={() => setOffset(0)}>Karong adlawa</button>}
            <button type="button" className={NAV_BTN} onClick={() => setOffset(offset + 1)} disabled={offset >= DAY_RANGE.max} aria-label="Sunod nga adlaw">
              <Icon name="chev" size={16} />
            </button>
          </div>
        </div>

        {state.status === 'loading' && (
          <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
            <Skeleton h={56} className="rounded-xl mb-4 lg:h-[260px]" />
            <Skeleton h={300} className="rounded-xl" />
          </div>
        )}

        {state.status === 'error' && (
          <div role="alert" className="rounded-xl border border-parish-border bg-[#fbf7ef] p-4 text-[15px] text-parish-ink">
            Dili makuha ang mga pagbasa karon.{' '}
            <button type="button" className="font-bold underline text-parish-blueDeep" onClick={() => setRetry(retry + 1)}>Sulayi pag-usab</button>
            {' '}o{' '}
            <a href={UNIVERSALIS_PAGE} target="_blank" rel="noopener noreferrer" className="font-bold underline text-parish-blueDeep">basaha sa Universalis</a>.
          </div>
        )}

        {current && (
          <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8 lg:items-start">
            {/* On a phone the tabs scroll sideways edge to edge; the inner row keeps the padding at both ends. */}
            <div className="-mx-4 overflow-x-auto scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-4 lg:mx-0 lg:mb-0 lg:overflow-visible lg:sticky lg:top-24">
            <div
              role="tablist" aria-label="Mga pagbasa" onKeyDown={onTabKey}
              className="flex gap-1.5 w-max px-4 pb-1 lg:w-auto lg:flex-col lg:gap-2 lg:px-0 lg:pb-0"
            >
              {readings.map((r, n) => {
                const on = r.key === current.key;
                return (
                  <button
                    key={r.key} id={`pagbasa-tab-${r.key}`} type="button" role="tab"
                    aria-selected={on} aria-controls="pagbasa-panel" tabIndex={on ? 0 : -1}
                    onClick={() => choose(r.key)}
                    className={`flex-none text-left rounded-xl border-[1.5px] px-3.5 py-2 lg:px-4 lg:py-3 min-h-[44px] transition ${on
                      ? 'bg-parish-blue border-parish-blue text-white'
                      : 'bg-parish-card border-parish-borderSoft text-parish-ink hover:border-[var(--p-blue-border)]'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`hidden lg:inline-flex w-6 h-6 flex-none rounded-full items-center justify-center text-[12px] font-bold ${on ? 'bg-white/20' : 'bg-[var(--p-blue-tint)] text-parish-blueDeep'}`}>{n + 1}</span>
                      <span className="font-bold text-[14.5px] whitespace-nowrap">{r.label}</span>
                    </span>
                    <span className={`hidden lg:block mt-1 lg:pl-8 text-[13px] font-semibold ${on ? 'text-white/85' : 'text-[var(--p-gold-deep)]'}`}>{r.source}</span>
                  </button>
                );
              })}
            </div>
            </div>

            <div ref={panel} id="pagbasa-panel" role="tabpanel" aria-labelledby={`pagbasa-tab-${current.key}`} className="scroll-mt-20 min-w-0">
              <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                <h3 className="m-0 font-serif text-[26px] lg:text-[32px] leading-tight text-parish-navy">{current.label}</h3>
                <span className="font-bold text-[15px] lg:text-[16px] text-[var(--p-gold-deep)]">{current.source}</span>
              </div>
              {current.heading && <p className="m-0 mt-1.5 font-serif italic text-[18px] lg:text-[20px] text-parish-text2">{current.heading}</p>}

              {current.acclamation && (
                <aside aria-label="Aleluya" className="mt-4 rounded-xl px-4 py-3" style={{ background: 'var(--p-blue-tint)' }}>
                  <div className="font-bold text-[11.5px] tracking-[.12em] uppercase text-parish-blueDeep mb-1">
                    Aleluya{current.acclamation.source ? ` · ${current.acclamation.source}` : ''}
                  </div>
                  <div className="text-[15px] leading-relaxed text-parish-ink [&_[data-line]]:pl-[1.6em] [&_[data-line]]:-indent-[1.6em]" dangerouslySetInnerHTML={{ __html: current.acclamation.html }} />
                </aside>
              )}

              {current.response && (
                <div className="mt-4 rounded-xl border-l-4 px-4 py-3" style={{ borderColor: 'var(--p-gold)', background: 'var(--p-gold-tint)' }}>
                  <div className="font-bold text-[11.5px] tracking-[.12em] uppercase text-[var(--p-gold-deep)] mb-0.5">Tubag</div>
                  <p className="m-0 font-serif italic font-semibold text-[19px] lg:text-[21px] leading-snug text-parish-navy">{current.response}</p>
                </div>
              )}

              {current.html ? (
                // Cleaned by toReadings (lib/readings.js): only plain formatting tags, no attributes.
                <div className={`mt-4 ${BODY} ${current.key === 'Mass_Ps' ? PSALM : ''}`} dangerouslySetInnerHTML={{ __html: current.html }} />
              ) : (
                <p className="m-0 mt-4 text-[15px] text-parish-text2">
                  Wala pa ang teksto niini dinhi.{' '}
                  <a href={UNIVERSALIS_PAGE} target="_blank" rel="noopener noreferrer" className="font-bold underline text-parish-blueDeep">Basaha sa Universalis</a>.
                </p>
              )}

              {next && (
                <button type="button" className={`${NAV_BTN} mt-6`} onClick={readNext}>
                  Sunod: {next.label}<Icon name="chev" size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3.5 lg:px-10 border-t border-[#f0e8d6] text-[12px] leading-relaxed text-parish-text2">
        Mga pagbasa gikan sa{' '}
        <a href={UNIVERSALIS_PAGE} target="_blank" rel="noopener noreferrer" className="font-bold underline text-parish-blueDeep">Universalis</a>
        {' '}(kalendaryo sa Pilipinas).{state.status === 'ok' && state.copyright ? ` ${state.copyright}` : ''}
      </div>
    </article>
  );
}
