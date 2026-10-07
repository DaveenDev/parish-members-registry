import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { Band, DataState, PageHeader, Pills, Segmented, Skeleton, Skeletons, WRAP } from '../../components/site/kit.jsx';
import { AnnouncementCard, EventCard } from '../../components/site/cards.jsx';
import { ANNOUNCEMENT_LABELS, ARTICLES_PAGE, bulletinLists, fmtLong, fmtShort, paragraphs, sortAnnouncements } from '../../lib/site.js';
import { listState, useAnnouncements, useArticles, useBulletins, useEvents } from './data.js';


const CATEGORY_FILTERS = [['all', 'Tanan'], ['Parish', 'Parokya'], ['GKK', 'GKK'], ['Ministry', 'Ministry'], ['Schedule change', ANNOUNCEMENT_LABELS['Schedule change']], ['urgent', 'Urgent']];
// Announcements shown at a time: three rows on desktop, six stacked on phones.
const ANNOUNCEMENTS_STEP = { desktop: 9, phone: 6 };

/** True on desktop widths (Tailwind's lg), following the window as it resizes. */
function useIsDesktop() {
  const query = '(min-width: 1024px)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return undefined;
    const change = () => setOn(m.matches);
    m.addEventListener?.('change', change);
    return () => m.removeEventListener?.('change', change);
  }, []);
  return on;
}

/** Desktop columns for `n` cards: one fills the row, two split it, three or more go three across. */
const cols = (n) => (n <= 1 ? 'lg:grid-cols-1' : n === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3');

// Where a jump link lands: below the sticky header and the jump bar on phones
// (58 + 54 px), below the header on desktop.
const JUMP_TARGET = 'scroll-mt-[118px] lg:scroll-mt-[92px]';

/**
 * Pahibalo ug Kalihokan: what's happening now and next. Upcoming events on
 * the blue band, the announcements below it on the page's cream, and the
 * weekly bulletin archive under its own tab. Jump links under the title go to each part. The articles (stories
 * after the fact) are on Komunidad; a line at the end points there.
 */
export default function Pahibalo() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'bulletin' ? 'bulletin' : 'list';
  const setView = (v) => setParams(v === 'bulletin' ? { view: 'bulletin' } : {}, { replace: true });
  // Same cache as the section itself: only link to the parts that are there.
  const events = listState(useEvents());
  const jumps = [
    events.rows.length > 0 && ['kalihokan', 'Kalihokan'],
    ['pahibalo', 'Pahibalo'],
  ].filter(Boolean);

  // The blue band is split around the jump bar (it can only stay stuck to the
  // top while it's a direct child of the page); the halves join seamlessly.
  return (
    <main className="animate-fadeUp">
      <Band as="div" style={{ borderBottomWidth: 0 }}>
        {/* flow-root keeps the switch's bottom margin inside the band (no cream gap). */}
        <div className={`${WRAP} pt-4 lg:pt-9 flow-root`}>
          <PageHeader eyebrow="Pahibalo ug Kalihokan" title="Balita sa parokya">
            <Segmented label="Pahibalo" options={[['list', 'Mga Pahibalo'], ['bulletin', 'Bulletin']]} value={view} onChange={setView} />
          </PageHeader>
        </div>
      </Band>
      {view === 'list' && jumps.length > 1 && <JumpLinks links={jumps} />}
      {/* The upcoming events, or the bulletin archive, on the light-blue band
          (the events section brings its own bottom margin). */}
      <Band aria-label="Balita sa parokya">
        <div className={`${WRAP} ${view === 'list' ? 'pt-3 pb-2 lg:pt-1 lg:pb-5' : 'pt-1 pb-7 lg:pb-12'}`}>
          {view === 'bulletin' ? <Bulletins /> : <UpcomingEvents />}
        </div>
      </Band>
      {/* The announcements below it, on the page's own cream, then the pointer to the articles. */}
      {view === 'list' && (
        <div className={`${WRAP} pt-6 pb-7 lg:pt-10 lg:pb-0`}>
          <Announcements />
          <ArticlesPointer />
        </div>
      )}
    </main>
  );
}

/**
 * Kalihokan · Pahibalo, under the title. On phones it sticks below
 * the site header while scrolling, with a line under it once it's stuck.
 */
function JumpLinks({ links }) {
  const sentinel = useRef(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    // The bar is stuck once the spot it started from has gone under the header.
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 60), { rootMargin: '-59px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function go(e, id) {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px -mb-px" style={{ background: 'var(--p-blue-tint)' }} />
      <nav
        aria-label="Adto sa"
        className={`sticky top-[58px] z-10 lg:static border-b transition-shadow ${stuck ? 'border-[var(--p-blue-border)] shadow-cardSm' : 'border-transparent'} lg:border-transparent lg:shadow-none`}
        style={{ background: 'var(--p-blue-tint)' }}
      >
        <div className={`${WRAP} flex items-center gap-2 py-2 lg:pt-0 lg:pb-3 overflow-x-auto`}>
          {links.map(([id, label]) => (
            <a
              key={id} href={`#${id}`} onClick={(e) => go(e, id)}
              className="flex-none min-h-[38px] px-4 inline-flex items-center rounded-full border-[1.5px] border-[var(--p-blue-border)] bg-parish-card font-bold text-[14.5px] text-parish-blueDeep hover:bg-[var(--p-blue-tint)]"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}

/**
 * Mga Pahibalo: pinned ones in a small "Gi-pin" strip on top (urgent ones
 * stay cards), then urgent first and newest, a batch at a time (9 on desktop,
 * 6 on phones; urgent ones are always in the first). The category filters
 * only show once there's something to filter (4 or more, in at least two
 * categories). A lone card keeps to a readable width; cards in a row share
 * its height. Old ones without an end date have already dropped off
 * (api.publicAnnouncements).
 */
function Announcements() {
  const ann = listState(useAnnouncements());
  const [cat, setCat] = useState('all');
  const [extra, setExtra] = useState(0);
  const step = useIsDesktop() ? ANNOUNCEMENTS_STEP.desktop : ANNOUNCEMENTS_STEP.phone;
  const showFilters = ann.rows.length >= 4 && new Set(ann.rows.map((a) => a.category)).size >= 2;
  const active = showFilters ? cat : 'all';
  const matching = sortAnnouncements(ann.rows).filter((a) => active === 'all' || (active === 'urgent' ? a.urgent : a.category === active));
  const isStrip = (a) => a.pinned && !a.urgent;
  const pinned = matching.filter(isStrip);
  const list = matching.filter((a) => !isStrip(a));
  const firstBatch = Math.max(step, list.filter((a) => a.urgent).length);
  const shown = list.slice(0, firstBatch + extra);
  const left = list.length - shown.length;
  const pickCat = (v) => { setCat(v); setExtra(0); };
  // Only offer the categories that have something in them.
  const filters = CATEGORY_FILTERS.filter(([v]) => v === 'all' || ann.rows.some((a) => (v === 'urgent' ? a.urgent : a.category === v)));

  return (
    <section id="pahibalo" aria-labelledby="announcements-title" className={JUMP_TARGET}>
      <div className="flex items-end justify-between gap-x-6 gap-y-3 flex-wrap mb-3.5 lg:mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 lg:w-12 lg:h-12 flex-none rounded-2xl flex items-center justify-center border" style={{ background: 'var(--p-blue-tint)', color: 'var(--p-blue)', borderColor: 'var(--p-blue-border)' }}>
            <Icon name="mega" size={24} />
          </span>
          <div className="min-w-0">
            <h2 id="announcements-title" className="m-0 font-serif text-[26px] lg:text-[32px] font-bold text-parish-navy leading-tight">Mga Pahibalo</h2>
            <p className="m-0 text-[14.5px] lg:text-[15.5px] text-[#4d4636]">Gikan sa opisina sa parokya, sa mga GKK ug mga ministry.</p>
          </div>
        </div>
        {showFilters && <Pills scroll options={filters} value={cat} onChange={pickCat} />}
      </div>
      <DataState
        state={ann}
        skeleton={<><div className="lg:hidden"><Skeletons n={2} h={120} /></div><div className="hidden lg:grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} h={220} alt={i === 1} className="rounded-[18px]" />)}</div></>}
        errorText="Wala ma-load ang mga pahibalo."
        empty={ann.empty}
        emptyText="Wala pay pahibalo. Balik lang sunod semana."
      >
        {pinned.length > 0 && <PinnedStrip rows={pinned} />}
        {shown.length > 0 && (
          <div className={`flex flex-col gap-2.5 lg:grid lg:gap-4 ${cols(shown.length)} ${shown.length === 1 ? 'lg:max-w-[760px]' : ''}`}>
            {shown.map((a) => <AnnouncementCard key={a.id} a={a} full />)}
          </div>
        )}
        {left > 0 && (
          <div className="mt-4 lg:mt-5 flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => setExtra((n) => n + step)} className="w-full lg:w-auto min-h-[46px] px-5 rounded-[12px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[15px] hover:bg-[var(--p-blue-tint)]">
              Tan-awa pa ang {Math.min(step, left)}
            </button>
            <span className="text-[13.5px] text-parish-text2">Gipakita ang {shown.length} sa {list.length}</span>
          </div>
        )}
      </DataState>
    </section>
  );
}

/** Pinned announcements as one compact strip: a line each, title and date. */
function PinnedStrip({ rows }) {
  return (
    <div className="mb-3 lg:mb-4 bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden" style={{ borderTop: '3px solid var(--p-gold)' }}>
      <div className="flex items-center gap-1.5 px-3.5 lg:px-[18px] pt-2.5 pb-1 font-bold text-[12px] tracking-[.14em] uppercase text-[var(--p-eyebrow)]">
        <Icon name="tack" size={14} />Gi-pin
      </div>
      <ul className="list-none m-0 p-0">
        {rows.map((a) => (
          <li key={a.id} className="border-t border-[#f0e8d6] first:border-t-0">
            <Link to={`/pahibalo/${a.id}`} className="flex items-center gap-3 px-3.5 lg:px-[18px] py-2.5 min-h-[48px] hover:bg-[var(--p-blue-tint)]">
              <span className="flex-1 min-w-0 font-serif font-bold text-[18px] lg:text-[20px] leading-tight text-parish-navy line-clamp-2">{a.title}</span>
              <span className="flex-none text-[13px] lg:text-[13.5px] text-parish-text2 whitespace-nowrap">{fmtShort(a.publish_on)}</span>
              <Icon name="chev" size={16} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The articles moved to Komunidad; this line at the end of the page points
 * there for anyone looking for them here. Hidden until there's one to read.
 */
function ArticlesPointer() {
  const q = listState(useArticles());
  if (q.loading || q.error || !q.rows.length) return null;
  return (
    <Link
      to={ARTICLES_PAGE}
      className="mt-6 lg:mt-8 flex items-center gap-3 rounded-2xl lg:rounded-[18px] border border-parish-border bg-parish-card px-4 py-3.5 lg:px-5 shadow-cardSm hover:border-[var(--p-blue-border)]"
    >
      <span className="w-10 h-10 flex-none rounded-xl flex items-center justify-center bg-[var(--p-gold-tint)] text-[var(--p-gold-deep)]"><Icon name="church" size={20} /></span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-[15.5px] text-parish-navy">Mga artikulo ug kasaysayan sa parokya</span>
        <span className="block text-[13.5px] text-parish-text2">Anaa na sa Komunidad</span>
      </span>
      <Icon name="chev" size={18} />
    </Link>
  );
}

/**
 * The next few parish events, above the announcements, with a link to the
 * full calendar. On phones they're a row you swipe sideways (the next card
 * peeks in), so six events don't push the announcements a screen down;
 * desktop keeps the grid. Hidden while loading, on error, or when nothing is
 * coming up.
 */
function UpcomingEvents() {
  const events = listState(useEvents());
  if (events.loading || events.error || !events.rows.length) return null;
  const next = events.rows.slice(0, 6);
  const one = next.length === 1;
  return (
    <section id="kalihokan" className={`mb-5 lg:mb-7 ${JUMP_TARGET}`} aria-labelledby="upcoming-events">
      <div className="flex items-baseline justify-between gap-3 mb-2.5 lg:mb-3">
        <h2 id="upcoming-events" className="m-0 font-serif text-[22px] lg:text-[26px] font-bold text-parish-navy">Umaabot nga Kalihokan</h2>
        <Link to="/simbahan?view=kalendaryo" className="font-bold text-[14px] lg:text-[15px] text-parish-blueDeep whitespace-nowrap hover:underline">
          <span className="lg:hidden">Kalendaryo →</span><span className="hidden lg:inline">Tan-awa ang kalendaryo →</span>
        </Link>
      </div>
      <div
        role="list" aria-label="Umaabot nga kalihokan"
        className={`flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-px-3.5 -mx-3.5 px-3.5 pb-1.5 lg:grid lg:gap-3 lg:overflow-visible lg:mx-0 lg:px-0 lg:pb-0 ${cols(next.length)}`}
      >
        {next.map((e) => (
          <div key={e.id} role="listitem" className={`snap-start flex-none ${one ? 'w-full' : 'w-[82%] max-w-[340px]'} lg:w-auto lg:max-w-none`}>
            <EventCard e={e} showDate fill />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The bulletin tab: the newest two bulletins in full, side by side on
 * desktop, then a list of the earlier ones (just their titles), kept to the
 * last 3 months when there are a lot.
 */
function Bulletins() {
  const bul = listState(useBulletins());
  const { latest, earlier, hidden } = bulletinLists(bul.rows);
  return (
    <DataState state={bul} skeleton={<Skeleton h={320} />} errorText="Wala ma-load ang bulletin." empty={bul.empty} emptyText="Wala pay bulletin nga gi-publish.">
      <p className="m-0 mb-3 lg:mb-4 text-[15px] lg:text-[16px] leading-normal text-[#4d4636]">Ang semanal nga bulletin sa parokya.</p>
      <div className={`grid gap-4 lg:gap-5 items-start ${latest.length > 1 ? 'lg:grid-cols-2' : 'lg:max-w-[820px]'}`}>
        {latest.map((b, i) => <BulletinPost key={b.id} b={b} newest={i === 0} />)}
      </div>

      {earlier.length > 0 && (
        <section className="mt-8 lg:mt-12" aria-labelledby="earlier-bulletins">
          <h2 id="earlier-bulletins" className="m-0 mb-1 font-serif text-[24px] lg:text-[30px] font-bold text-parish-navy">Mga naunang bulletin</h2>
          <p className="m-0 mb-3 text-[14px] lg:text-[15px] text-parish-text2">
            {hidden > 0 ? 'Ang katapusang 3 ka bulan.' : 'Tanang naunang bulletin.'}
          </p>
          <div className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] overflow-hidden lg:max-w-[820px]">
            {earlier.map((b) => (
              <Link key={b.id} to={`/pahibalo/bulletin/${b.id}`} className="flex items-center gap-3 py-3 pr-3 pl-3.5 lg:py-3.5 lg:px-[18px] border-b border-[#f0e8d6] last:border-b-0 hover:bg-[var(--p-blue-tint)]">
                <span className="flex-1 min-w-0 lg:flex lg:items-baseline lg:gap-4">
                  <span className="block font-serif text-[19px] lg:text-[21px] font-bold text-parish-navy leading-tight">{b.title}</span>
                  <span className="block text-[13.5px] lg:text-[15px] text-parish-text2">{fmtLong(b.week_of)}</span>
                </span>
                <Icon name="chev" size={18} className="text-parish-muted" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </DataState>
  );
}

/** One bulletin shown in full: its week, title and text, with a link to its own page (for sharing). */
function BulletinPost({ b, newest }) {
  return (
    <article className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm p-4 lg:p-6 min-w-0">
      <div className="flex gap-2 items-center flex-wrap mb-1.5">
        {newest && <span className="font-bold text-[11.5px] tracking-[.16em] uppercase text-[var(--p-eyebrow)]">Pinakabag-o</span>}
        <span className="text-[13.5px] lg:text-[14px] text-parish-text2">Semana sa {fmtLong(b.week_of)}</span>
      </div>
      <h2 className="m-0 mb-3 font-serif text-[24px] lg:text-[30px] font-bold leading-[1.15] text-parish-navy">{b.title}</h2>
      {paragraphs(b.body).map((p, i) => <p key={i} className="m-0 mb-3 text-[15.5px] lg:text-[16.5px] leading-[1.65] text-parish-ink whitespace-pre-line">{p}</p>)}
      <Link to={`/pahibalo/bulletin/${b.id}`} className="inline-flex items-center gap-1 mt-1 min-h-[40px] font-bold text-[14.5px] text-parish-blue">Ablihi sa tibuok panid ug ipaambit<Icon name="chev" size={16} /></Link>
    </article>
  );
}
