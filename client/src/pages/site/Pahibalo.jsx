import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, DataState, EmptyNote, Eyebrow, PageHeader, Pills, Segmented, Skeleton, Skeletons, WRAP } from '../../components/site/kit.jsx';
import { AnnouncementCard, ArticleCard, ArticleFeature, EventCard } from '../../components/site/cards.jsx';
import { ANNOUNCEMENT_LABELS, fmtLong, sortAnnouncements } from '../../lib/site.js';
import { listState, useAnnouncements, useArticles, useBulletins, useEvents } from './data.js';


const CATEGORY_FILTERS = [['all', 'Tanan'], ['Parish', 'Parokya'], ['GKK', 'GKK'], ['Ministry', 'Ministry'], ['Schedule change', ANNOUNCEMENT_LABELS['Schedule change']], ['urgent', 'Urgent']];
// Values match the articles_tag_check constraint (0021).
const ARTICLE_TAG_FILTERS = [['all', 'Tanan'], ['History', 'Kasaysayan'], ['Parish', 'Parokya'], ['GKK', 'GKK'], ['Ministry', 'Ministry']];
const ARTICLES_STEP = 6;
// Announcements shown at a time: three rows on desktop, six stacked on phones.
const ANNOUNCEMENTS_STEP = { desktop: 9, phone: 6 };
// A warm sand band for the articles, from the theme's gold, so it reads apart
// from both the blue band above and the page's own cream.
const ARTICLES_BAND = 'color-mix(in srgb, var(--p-gold) 24%, #fbf7ee)';

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

/**
 * Pahibalo ug Kalihokan: upcoming events and announcements on the blue band,
 * the blog articles on their own warm band below, and the weekly bulletin
 * archive under its own tab.
 */
export default function Pahibalo() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'bulletin' ? 'bulletin' : 'list';
  const setView = (v) => setParams(v === 'bulletin' ? { view: 'bulletin' } : {}, { replace: true });

  return (
    <main className="animate-fadeUp">
      {/* The first section (events and announcements, or the bulletin archive) on the light-blue band. */}
      <Band aria-label="Balita sa parokya">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <PageHeader eyebrow="Pahibalo ug Kalihokan" title="Balita sa parokya">
            <Segmented label="Pahibalo" options={[['list', 'Mga Pahibalo'], ['bulletin', 'Bulletin']]} value={view} onChange={setView} />
          </PageHeader>
          {view === 'bulletin' ? <Bulletins /> : (
            <>
              <UpcomingEvents />
              <Announcements />
            </>
          )}
        </div>
      </Band>
      {view === 'list' && <Articles />}
    </main>
  );
}

/**
 * Mga Pahibalo: urgent ones first, then pinned, then newest, a batch at a
 * time (9 on desktop, 6 on phones; urgent and pinned ones are always in the
 * first). The category filters only show once there's something to filter
 * (4 or more, in at least two categories). A lone card keeps to a readable
 * width; cards in a row share its height.
 */
function Announcements() {
  const ann = listState(useAnnouncements());
  const [cat, setCat] = useState('all');
  const [extra, setExtra] = useState(0);
  const step = useIsDesktop() ? ANNOUNCEMENTS_STEP.desktop : ANNOUNCEMENTS_STEP.phone;
  const showFilters = ann.rows.length >= 4 && new Set(ann.rows.map((a) => a.category)).size >= 2;
  const active = showFilters ? cat : 'all';
  const list = sortAnnouncements(ann.rows).filter((a) => active === 'all' || (active === 'urgent' ? a.urgent : a.category === active));
  const firstBatch = Math.max(step, list.filter((a) => a.urgent || a.pinned).length);
  const shown = list.slice(0, firstBatch + extra);
  const left = list.length - shown.length;
  const pickCat = (v) => { setCat(v); setExtra(0); };
  // Only offer the categories that have something in them.
  const filters = CATEGORY_FILTERS.filter(([v]) => v === 'all' || ann.rows.some((a) => (v === 'urgent' ? a.urgent : a.category === v)));

  return (
    <section aria-labelledby="announcements-title">
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
        <div className={`flex flex-col gap-2.5 lg:grid lg:gap-4 ${cols(shown.length)} ${shown.length === 1 ? 'lg:max-w-[760px]' : ''}`}>
          {shown.map((a) => <AnnouncementCard key={a.id} a={a} full />)}
        </div>
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

/**
 * Mga Artikulo, on a full-width warm band so it reads apart from the
 * announcements: the newest article wide, then the rest three across, six
 * more at a time. Tag filters show once articles use two or more tags.
 * Hidden while loading, on error, or when there are none.
 */
function Articles() {
  const q = listState(useArticles());
  const [tag, setTag] = useState('all');
  const [count, setCount] = useState(ARTICLES_STEP);
  const { hash } = useLocation();
  const ready = !q.loading && q.rows.length > 0;
  // Coming back from an article ("Tanang artikulo"): scroll here once the list is in.
  useEffect(() => {
    if (ready && hash === '#artikulo') document.getElementById('artikulo')?.scrollIntoView();
  }, [ready, hash]);
  if (q.loading || q.error || !q.rows.length) return null;

  const tags = new Set(q.rows.map((a) => a.tag));
  const filters = tags.size >= 2 ? ARTICLE_TAG_FILTERS.filter(([v]) => v === 'all' || tags.has(v)) : null;
  const list = q.rows.filter((a) => !filters || tag === 'all' || a.tag === tag);
  const [first, ...rest] = list;
  const shown = rest.slice(0, count);
  const pickTag = (v) => { setTag(v); setCount(ARTICLES_STEP); };

  return (
    <section
      id="artikulo" aria-labelledby="articles-title"
      className="scroll-mt-16 lg:scroll-mt-[76px] py-7 lg:py-12 border-b"
      style={{ background: ARTICLES_BAND, borderColor: 'color-mix(in srgb, var(--p-gold) 40%, white)' }}
    >
      <div className={WRAP}>
        <div className="flex items-end justify-between gap-x-6 gap-y-3 flex-wrap mb-4 lg:mb-6">
          <div className="min-w-0">
            <Eyebrow>Mga istorya sa parokya</Eyebrow>
            <h2 id="articles-title" className="m-0 font-serif text-[28px] lg:text-[36px] font-bold text-parish-navy leading-tight">Mga Artikulo</h2>
            <p className="m-0 mt-0.5 text-[15px] lg:text-[16px] leading-normal text-[#4d4636]">Kasaysayan sa parokya ug mga kalihokan nga nahitabo.</p>
          </div>
          {filters && <Pills scroll options={filters} value={tag} onChange={pickTag} />}
        </div>
        {first && <ArticleFeature a={first} />}
        {shown.length > 0 && (
          <div className="mt-3 lg:mt-5 flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-4 lg:items-start">
            {shown.map((a) => <ArticleCard key={a.id} a={a} />)}
          </div>
        )}
        {rest.length > count && (
          <div className="mt-4 lg:mt-6 flex items-center gap-3 flex-wrap">
            <button type="button" onClick={() => setCount((c) => c + ARTICLES_STEP)} className="w-full lg:w-auto min-h-[46px] px-5 rounded-[12px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[15px] hover:bg-[var(--p-blue-tint)]">
              Tan-awa pa ang {Math.min(ARTICLES_STEP, rest.length - count)}
            </button>
            <span className="text-[13.5px] text-parish-text2">Gipakita ang {1 + shown.length} sa {list.length}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The next few parish events, above the announcements, with a link to the
 * full calendar. Hidden while loading, on error, or when nothing is coming up.
 */
function UpcomingEvents() {
  const events = listState(useEvents());
  if (events.loading || events.error || !events.rows.length) return null;
  const next = events.rows.slice(0, 6);
  return (
    <section className="mb-5 lg:mb-7" aria-labelledby="upcoming-events">
      <div className="flex items-baseline justify-between gap-3 mb-2.5 lg:mb-3">
        <h2 id="upcoming-events" className="m-0 font-serif text-[22px] lg:text-[26px] font-bold text-parish-navy">Umaabot nga Kalihokan</h2>
        <Link to="/misa?view=kalendaryo" className="font-bold text-[14px] lg:text-[15px] text-parish-blueDeep whitespace-nowrap hover:underline">Tan-awa ang kalendaryo →</Link>
      </div>
      <div className={`flex flex-col gap-2 lg:grid lg:gap-3 ${cols(next.length)}`}>{next.map((e) => <EventCard key={e.id} e={e} showDate fill />)}</div>
    </section>
  );
}

function Bulletins() {
  const bul = listState(useBulletins());
  return (
    <>
      <p className="m-0 mb-3 lg:mb-4 text-[15px] lg:text-[16px] leading-normal text-[#4d4636]">Ang semanal nga bulletin sa parokya. Basaha diri.</p>
      <DataState state={bul} skeleton={<Skeleton h={220} />} errorText="Wala ma-load ang bulletin." empty={bul.empty} emptyText="Wala pay bulletin nga gi-publish.">
        {!bul.rows.length ? <EmptyNote /> : (
          <div className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] overflow-hidden lg:max-w-[820px]">
            {bul.rows.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5 py-3 pr-3 pl-3.5 lg:gap-4 lg:py-3.5 lg:px-[18px] border-b border-[#f0e8d6] last:border-b-0">
                <div className="flex-1 min-w-0 lg:flex lg:items-baseline lg:gap-4">
                  <div className="font-serif text-[20px] lg:text-[22px] font-bold text-parish-navy leading-tight lg:min-w-[120px]">{b.title}</div>
                  <div className="text-[13.5px] lg:text-[15px] text-parish-text2">{fmtLong(b.week_of)}</div>
                </div>
                <Link to={`/pahibalo/bulletin/${b.id}`} className="min-h-[44px] lg:min-h-[42px] px-3 lg:px-4 inline-flex items-center rounded-[10px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[14px] lg:text-[14.5px] hover:bg-[var(--p-blue-tint)]">
                  Basaha
                </Link>
              </div>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}
