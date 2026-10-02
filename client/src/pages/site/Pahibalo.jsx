import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { DataState, EmptyNote, PAGE, PageHeader, Pills, Segmented, Skeleton, Skeletons } from '../../components/site/kit.jsx';
import { AnnouncementCard, ArticleCard, EventCard } from '../../components/site/cards.jsx';
import { ANNOUNCEMENT_LABELS, fmtLong } from '../../lib/site.js';
import { listState, useAnnouncements, useArticles, useBulletins, useEvents } from './data.js';

const CATEGORY_FILTERS = [['all', 'Tanan'], ['Parish', 'Parokya'], ['GKK', 'GKK'], ['Ministry', 'Ministry'], ['Schedule change', ANNOUNCEMENT_LABELS['Schedule change']], ['urgent', 'Urgent']];

/** Desktop columns for `n` cards: one fills the row, two split it, three or more go three across. */
const cols = (n) => (n <= 1 ? 'lg:grid-cols-1' : n === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3');

/** Mga Pahibalo: announcements by category, blog articles, and the weekly bulletin archive. */
export default function Pahibalo() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'bulletin' ? 'bulletin' : 'list';
  const setView = (v) => setParams(v === 'bulletin' ? { view: 'bulletin' } : {}, { replace: true });

  return (
    <main className={PAGE}>
      <PageHeader eyebrow="Mga Pahibalo" title="Balita sa parokya">
        <Segmented label="Pahibalo" options={[['list', 'Mga Pahibalo'], ['bulletin', 'Bulletin']]} value={view} onChange={setView} />
      </PageHeader>
      {view === 'list' ? <Announcements /> : <Bulletins />}
    </main>
  );
}

function Announcements() {
  const ann = listState(useAnnouncements());
  const [cat, setCat] = useState('all');
  const shown = ann.rows.filter((a) => cat === 'all' || (cat === 'urgent' ? a.urgent : a.category === cat));
  // Only offer the categories that have something in them.
  const filters = CATEGORY_FILTERS.filter(([v]) => v === 'all' || ann.rows.some((a) => (v === 'urgent' ? a.urgent : a.category === v)));

  return (
    <>
      <UpcomingEvents />
      {filters.length > 2 && <Pills scroll className="mb-3.5 lg:mb-5" options={filters} value={cat} onChange={setCat} />}
      <DataState
        state={ann}
        skeleton={<><div className="lg:hidden"><Skeletons n={2} h={120} /></div><div className="hidden lg:grid grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} h={220} alt={i === 1} className="rounded-[18px]" />)}</div></>}
        errorText="Wala ma-load ang mga pahibalo."
        empty={ann.empty}
        emptyText="Wala pay pahibalo. Balik lang sunod semana."
      >
        <div className={`flex flex-col gap-2.5 lg:grid lg:gap-4 lg:items-start ${cols(shown.length)}`}>{shown.map((a) => <AnnouncementCard key={a.id} a={a} full />)}</div>
      </DataState>
      <Articles />
    </>
  );
}

const ARTICLES_FIRST = 6;

/**
 * Blog articles below the announcements: parish history and write-ups of
 * events held, newest first. Hidden while loading, on error, or when there
 * are none.
 */
function Articles() {
  const q = listState(useArticles());
  const [all, setAll] = useState(false);
  const { hash } = useLocation();
  const ready = !q.loading && q.rows.length > 0;
  // Coming back from an article ("Tanang artikulo"): scroll here once the list is in.
  useEffect(() => {
    if (ready && hash === '#artikulo') document.getElementById('artikulo')?.scrollIntoView();
  }, [ready, hash]);
  if (q.loading || q.error || !q.rows.length) return null;
  const shown = all ? q.rows : q.rows.slice(0, ARTICLES_FIRST);
  return (
    <section id="artikulo" className="mt-8 lg:mt-12 scroll-mt-24" aria-labelledby="articles-title">
      <h2 id="articles-title" className="m-0 font-serif text-[26px] lg:text-[32px] font-bold text-parish-navy leading-tight">Mga Artikulo</h2>
      <p className="m-0 mt-1 mb-3.5 lg:mb-5 text-[15px] lg:text-[16px] leading-normal text-[#4d4636]">Kasaysayan sa parokya ug mga kalihokan nga nahitabo.</p>
      <div className={`flex flex-col gap-3 lg:grid lg:gap-4 lg:items-start ${cols(shown.length)}`}>{shown.map((a) => <ArticleCard key={a.id} a={a} wide={shown.length < 3} />)}</div>
      {!all && q.rows.length > ARTICLES_FIRST && (
        <button type="button" onClick={() => setAll(true)} className="mt-4 w-full lg:w-auto min-h-[46px] px-5 rounded-[12px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[15px] hover:bg-[var(--p-blue-tint)]">
          Tan-awa pa ({q.rows.length - ARTICLES_FIRST})
        </button>
      )}
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
      <div className={`flex flex-col gap-2 lg:grid lg:gap-3 ${cols(next.length)}`}>{next.map((e) => <EventCard key={e.id} e={e} showDate />)}</div>
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
