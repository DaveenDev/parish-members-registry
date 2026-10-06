import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { Skeleton } from './kit.jsx';
import { parseIso } from '../../lib/site.js';
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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Tuesday, October 6, 2026" */
function fmtDate(iso) {
  const d = parseIso(iso);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const WHEN = { '-1': 'Yesterday', 0: 'Today', 1: 'Tomorrow' };

/**
 * Daily Readings: the day's Mass readings (first reading, psalm, second
 * reading, Gospel) from Universalis, Philippine calendar (lib/readings.js).
 * In English throughout, like the texts: there's no Cebuano Catholic text to
 * show. On a computer the readings are a list on the left and the chosen one
 * on the right; on a phone they're tabs above the text. Visitors can move a
 * few days back or ahead. `onLoad` says when the first day is in (or
 * failed), since the card changes the page's height.
 */
export default function DailyReadings({ onLoad }) {
  const today = manilaToday();
  const [offset, setOffset] = useState(0);
  const iso = addDays(today, offset);
  const [state, setState] = useState({ status: 'loading' });
  const [picked, setPicked] = useState('Mass_G');
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

  // The Gospel first (and open), then the others in Mass order, numbered 1–3
  // among themselves, so the second reading stays number 3.
  const inOrder = state.status === 'ok' ? state.readings : [];
  const readings = [...inOrder.filter((r) => r.key === 'Mass_G'), ...inOrder.filter((r) => r.key !== 'Mass_G')];
  const at = Math.max(0, readings.findIndex((r) => r.key === picked));
  const current = readings[at];
  // "Next" reads on to the next reading there is (a weekday has no second reading).
  const next = readings.slice(at + 1).find((r) => !r.none);
  // On a phone a long reading starts folded (about nine lines), so the card
  // doesn't push the rest of the page far down; "Read the full reading" opens it.
  const [opened, setOpened] = useState('');
  const long = current ? current.html.replace(/<[^>]*>/g, '').length > 650 : false;
  const folded = long && opened !== `${iso}:${current.key}`;

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
      <div className="h-1.5" style={{ background: 'var(--p-gold)' }} />
      <div className="px-4 pt-4 pb-5 lg:px-10 lg:pt-8 lg:pb-8">
        <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-start lg:mb-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 id="pagbasa-title" className="m-0 font-bold text-[12px] lg:text-[12.5px] tracking-[.16em] uppercase text-[var(--p-eyebrow)]">Daily Readings</h3>
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
            <button type="button" className={NAV_BTN} onClick={() => setOffset(offset - 1)} disabled={offset <= DAY_RANGE.min} aria-label="Previous day">
              <Icon name="back" size={16} />
            </button>
            {offset !== 0 && <button type="button" className={NAV_BTN} onClick={() => setOffset(0)}>Today</button>}
            <button type="button" className={NAV_BTN} onClick={() => setOffset(offset + 1)} disabled={offset >= DAY_RANGE.max} aria-label="Next day">
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
            The readings couldn’t be loaded right now.{' '}
            <button type="button" className="font-bold underline text-parish-blueDeep" onClick={() => setRetry(retry + 1)}>Try again</button>
            {' '}or{' '}
            <a href={UNIVERSALIS_PAGE} target="_blank" rel="noopener noreferrer" className="font-bold underline text-parish-blueDeep">read them on Universalis</a>.
          </div>
        )}

        {current && (
          <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8 lg:items-start">
            {/* On a phone the tabs scroll sideways edge to edge; the inner row keeps the padding at both ends. */}
            <div className="-mx-4 overflow-x-auto scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden mb-4 lg:mx-0 lg:mb-0 lg:overflow-visible lg:sticky lg:top-24">
            <div
              role="tablist" aria-label="Readings" onKeyDown={onTabKey}
              className="flex gap-1.5 w-max px-4 pb-1 lg:w-auto lg:flex-col lg:gap-2 lg:px-0 lg:pb-0"
            >
              {readings.map((r) => {
                const on = r.key === current.key;
                return (
                  <button
                    key={r.key} id={`pagbasa-tab-${r.key}`} type="button" role="tab"
                    aria-selected={on} aria-controls="pagbasa-panel" tabIndex={on ? 0 : -1}
                    onClick={() => choose(r.key)}
                    className={`flex-none text-left rounded-xl border-[1.5px] px-3.5 py-2 lg:px-4 lg:py-3 min-h-[44px] transition ${on
                      ? 'bg-parish-blue border-parish-blue text-white'
                      : r.none
                        ? 'bg-transparent border-dashed border-parish-borderSoft text-parish-text2 hover:border-[var(--p-blue-border)]'
                        : 'bg-parish-card border-parish-borderSoft text-parish-ink hover:border-[var(--p-blue-border)]'}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`hidden lg:inline-flex w-6 h-6 flex-none rounded-full items-center justify-center text-[12px] font-bold ${on ? 'bg-white/20' : 'bg-[var(--p-blue-tint)] text-parish-blueDeep'}`}>
                        {r.key === 'Mass_G' ? <Icon name="cross" size={13} /> : readings.filter((x) => x.key !== 'Mass_G').indexOf(r) + 1}
                      </span>
                      <span className="font-bold text-[14.5px] whitespace-nowrap">{r.label}</span>
                    </span>
                    <span className={`hidden lg:block mt-1 lg:pl-8 text-[13px] font-semibold ${on ? 'text-white/85' : r.none ? 'italic font-normal' : 'text-[var(--p-gold-deep)]'}`}>
                      {r.none ? 'None on this day' : r.source}
                    </span>
                  </button>
                );
              })}
            </div>
            </div>

            <div ref={panel} id="pagbasa-panel" role="tabpanel" aria-labelledby={`pagbasa-tab-${current.key}`} className="scroll-mt-20 min-w-0">
              <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                <h4 className="m-0 font-serif font-normal text-[26px] lg:text-[32px] leading-tight text-parish-navy">{current.label}</h4>
                <span className="font-bold text-[15px] lg:text-[16px] text-[var(--p-gold-deep)]">{current.source}</span>
              </div>
              {current.heading && <p className="m-0 mt-1.5 font-serif italic text-[18px] lg:text-[20px] text-parish-text2">{current.heading}</p>}

              {current.acclamation && (
                <aside aria-label="Gospel Acclamation" className="mt-4 rounded-xl px-4 py-3" style={{ background: 'var(--p-blue-tint)' }}>
                  <div className="font-bold text-[11.5px] tracking-[.12em] uppercase text-parish-blueDeep mb-1">
                    Gospel Acclamation{current.acclamation.source ? ` · ${current.acclamation.source}` : ''}
                  </div>
                  <div className="text-[15px] leading-relaxed text-parish-ink [&_[data-line]]:pl-[1.6em] [&_[data-line]]:-indent-[1.6em]" dangerouslySetInnerHTML={{ __html: current.acclamation.html }} />
                </aside>
              )}

              {current.response && (
                <div className="mt-4 rounded-xl border-l-4 px-4 py-3" style={{ borderColor: 'var(--p-gold)', background: 'var(--p-gold-tint)' }}>
                  <div className="font-bold text-[11.5px] tracking-[.12em] uppercase text-[var(--p-gold-deep)] mb-0.5">Response</div>
                  <p className="m-0 font-serif italic font-semibold text-[19px] lg:text-[21px] leading-snug text-parish-navy">{current.response}</p>
                </div>
              )}

              {current.none ? (
                <p className="m-0 mt-4 max-w-[60ch] text-[15.5px] leading-relaxed text-parish-text2">
                  There is no Second Reading on this day. It is read only on Sundays and solemnities; on other days the Mass
                  has the First Reading, the Responsorial Psalm and the Gospel.
                </p>
              ) : current.html ? (
                <>
                  <div className={`relative mt-4 ${folded ? 'max-h-[16em] overflow-hidden lg:max-h-none' : ''}`}>
                    {/* Cleaned by toReadings (lib/readings.js): only plain formatting tags, no attributes. */}
                    <div className={`${BODY} ${current.key === 'Mass_Ps' ? PSALM : ''}`} dangerouslySetInnerHTML={{ __html: current.html }} />
                    {folded && <div className="lg:hidden absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-parish-card to-transparent" aria-hidden />}
                  </div>
                  {folded && (
                    <button type="button" className={`${NAV_BTN} mt-3 lg:hidden`} onClick={() => setOpened(`${iso}:${current.key}`)}>
                      Read the full reading<Icon name="down" size={16} />
                    </button>
                  )}
                </>
              ) : (
                <p className="m-0 mt-4 text-[15px] text-parish-text2">
                  The text isn’t available here yet.{' '}
                  <a href={UNIVERSALIS_PAGE} target="_blank" rel="noopener noreferrer" className="font-bold underline text-parish-blueDeep">Read it on Universalis</a>.
                </p>
              )}

              {next && (
                <button type="button" className={`${NAV_BTN} mt-6`} onClick={readNext}>
                  Next: {next.label}<Icon name="chev" size={16} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 lg:px-10 border-t border-[#f0e8d6]">
        <p className="m-0 text-[12.5px] leading-snug text-parish-text2">
          Readings from{' '}
          <a href={UNIVERSALIS_PAGE} target="_blank" rel="noopener noreferrer" className="font-bold underline text-parish-blueDeep">Universalis</a>
          {' '}(Philippine calendar). Text from the Jerusalem Bible, a Catholic Bible, with the Grail Psalms.
        </p>
        {/* Universalis asks for its copyright notice to stay visible: small, but always shown. */}
        {state.status === 'ok' && state.copyright && (
          <p className="m-0 mt-1.5 text-[10.5px] leading-snug text-parish-faint">{state.copyright}</p>
        )}
      </div>
    </article>
  );
}
