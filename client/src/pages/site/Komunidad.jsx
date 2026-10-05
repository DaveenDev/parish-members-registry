import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, Card, DataState, EmptyNote, ErrorNote, Eyebrow, INNER, PageHeader, Pills, Segmented, Skeleton, Skeletons, WRAP } from '../../components/site/kit.jsx';
import ArticlesSection from './Articles.jsx';
import { Body, Gallery, Photo } from './Details.jsx';
import { censusCountdown, filterGkks, fmtLong, fmtShort, gkkParts, sortCensusGkks } from '../../lib/site.js';
import { todayIso } from '../../lib/website.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { listState, useCensusProgress, useGkkDirectory, useGkkPage } from './data.js';

const SMALL = 'Ubos sa 5';

const VIEWS = [['artikulo', 'Mga Artikulo'], ['gkk', 'Mga GKK']];

// The open census's card stands out from everything else on the page: warm
// gold, a stronger gold edge, and the alert badges on top.
const CENSUS_CARD = {
  background: 'linear-gradient(135deg, color-mix(in srgb, var(--p-gold-light) 38%, #fffaf0) 0%, color-mix(in srgb, var(--p-gold-light) 70%, #fff6df) 100%)',
  borderColor: 'var(--p-gold)',
  borderWidth: 2,
};

/** "26 ka adlaw na lang · hangtod 30 Okt 2026": the days left while the census is open (nothing without an end date). */
function CensusCountdown({ endsOn, className = '' }) {
  const left = censusCountdown(endsOn, todayIso(), Infinity);
  if (!left) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-[13px] text-parish-navy ${className}`} style={{ background: 'var(--p-gold-light)' }}>
      <Icon name="clock" size={15} />{left} · hangtod {fmtShort(endsOn)}
    </span>
  );
}

/** "IMPORTANT" and "ALERT! 2026 CENSUS IS ONGOING", on top of the census card. */
function CensusAlertBadges({ label, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* Orange, with navy text so the small letters stay readable (and apart from the red alert). */}
      <span className="inline-flex items-center rounded-md px-2 py-[3px] font-bold text-[11px] tracking-[.1em] uppercase" style={{ background: '#fb923c', color: '#1a2b4a' }}>Important</span>
      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-[3px] font-bold text-[11px] tracking-[.06em] uppercase text-white" style={{ background: '#b3261e' }}>
        <span className="relative flex w-2 h-2" aria-hidden>
          <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
        </span>
        Alert! {String(label || 'Census').toUpperCase()} is ongoing
      </span>
    </div>
  );
}

/**
 * Komunidad: the parish's stories and its GKKs, under two tabs. It opens on
 * the articles (the GKK directory is reference); ?view=gkk opens the GKKs.
 * While a census is open, the GKK tab has its full progress on top (on the
 * light-blue band, with every GKK); the articles tab a one-line strip.
 */
export default function Komunidad() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'gkk' ? 'gkk' : 'artikulo';
  const setView = (v) => setParams(v === 'gkk' ? { view: 'gkk' } : {}, { replace: true });
  const q = useCensusProgress();
  // The full census progress only on the GKK tab; the articles tab has the strip.
  const open = view === 'gkk' && !!q.data?.open;

  const header = (
    <PageHeader eyebrow="Komunidad" title="Ang atong komunidad">
      <Segmented label="Komunidad" options={VIEWS} value={view} onChange={setView} />
    </PageHeader>
  );

  return (
    <main className="animate-fadeUp">
      {q.loading && view === 'gkk' && <div className={`${WRAP} ${BAND_PAD}`}><Skeleton h={220} className="lg:h-[420px]" /></div>}
      {open && (
        <Band aria-labelledby="census-h">
          <div className={`${WRAP} ${BAND_PAD}`}>
            <Eyebrow>Census sa parokya</Eyebrow>
            <h2 id="census-h" className="sr-only">Progreso sa census</h2>
            <CensusProgress />
          </div>
        </Band>
      )}
      {view === 'artikulo' ? (
        // The articles: the title and census strip on the blue band, then their warm band.
        // flow-root keeps the bottom margins inside the band (no gap above the articles).
        <>
          <Band as="div">
            <div className={`${WRAP} pt-4 lg:pt-9 flow-root`}>
              {header}
              {q.data?.open && q.data.pct != null && <CensusStrip c={q.data} onMore={() => setView('gkk')} />}
            </div>
          </Band>
          <ArticlesSection />
        </>
      ) : !q.loading && (
        // The GKKs: on the blue band with the title, or under the census band on the page's cream.
        open ? (
          <div className={`${WRAP} pt-7 pb-7 lg:pt-12 lg:pb-0`}>{header}<GkkDirectory /></div>
        ) : (
          <Band aria-label="Mga GKK sa parokya">
            <div className={`${WRAP} ${BAND_PAD}`}>{header}<GkkDirectory /></div>
          </Band>
        )
      )}
    </main>
  );
}

/** The open census in one line, for the articles tab: how far along, update, and the full progress. */
function CensusStrip({ c, onMore }) {
  return (
    <div className="mb-4 lg:mb-[22px] border rounded-2xl lg:rounded-[18px] shadow-card px-3.5 py-3 lg:px-5 flex items-center gap-3 lg:gap-4 flex-wrap" style={CENSUS_CARD}>
      <CensusAlertBadges label={c.label} className="w-full" />
      <CensusCountdown endsOn={c.ends_on} className="w-full justify-center sm:w-auto sm:justify-start" />
      <div role="img" aria-label={`${c.pct} porsyento`} className="w-12 h-12 flex-none rounded-full flex items-center justify-center" style={{ background: `conic-gradient(var(--p-blue) 0 ${c.pct}%, rgba(255,255,255,.85) 0)` }}>
        <span className="w-9 h-9 rounded-full bg-parish-card flex items-center justify-center font-bold text-[12.5px] text-parish-blue">{c.pct}%</span>
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="font-bold text-[15px] lg:text-[16px] text-parish-navy leading-snug">{c.label}: {c.pct}% sa mga pamilya na-update na</div>
        <button type="button" onClick={onMore} className="p-0 border-0 bg-transparent cursor-pointer font-semibold text-[13.5px] text-parish-blueDeep hover:underline">Tan-awa ang progreso matag GKK →</button>
      </div>
      <BigButton to="/census" className="!w-full lg:!w-auto min-h-[46px] px-5 text-[15px]">I-update ang among rekord</BigButton>
    </div>
  );
}

function GkkDirectory() {
  const dir = listState(useGkkDirectory());
  const [q, setQ] = useState('');
  const items = filterGkks(dir.rows, q);
  const count = items.length;
  const examples = [...new Set(dir.rows.map((g) => gkkParts(g.name).area).filter(Boolean))].slice(0, 3);

  return (
    <>
      <div className="lg:bg-parish-card lg:border lg:border-parish-border lg:rounded-[20px] lg:shadow-card lg:px-[22px] lg:py-5 lg:mb-[26px] lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-5 lg:gap-y-2 lg:items-end">
      <div>
      <label htmlFor="gkk-q" className="block font-bold text-[15px] text-parish-navy mb-1.5 lg:font-serif lg:text-[26px] lg:mb-2">Asa ka nagpuyo?</label>
      <div className="relative mb-1.5 lg:mb-0">
        <Icon name="search" className="absolute left-3.5 top-3.5 text-parish-text2 lg:left-4 lg:top-4" />
        <input
          id="gkk-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Barangay, sitio, purok o kapilya"
          className="w-full min-h-[50px] px-11 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-[14px] outline-none focus:border-parish-blue [&::-webkit-search-cancel-button]:hidden lg:min-h-[52px] lg:px-12 lg:text-[17px] lg:bg-parish-bg"
        />
        {q && (
          <button type="button" aria-label="Hawani" onClick={() => setQ('')} className="absolute right-[3px] top-[3px] lg:right-1 lg:top-1 w-11 h-11 flex items-center justify-center text-parish-text2">
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      </div>
      {examples.length > 0 && <div className="text-[13.5px] lg:text-[14px] text-parish-text2 mb-4 lg:mb-0 lg:pb-[15px]">Sulayi: {examples.join(', ')}</div>}
      </div>

      <DataState
        state={dir}
        skeleton={<Skeletons n={2} h={120} />}
        errorText="Wala ma-load ang GKK directory."
        empty={dir.empty}
        emptyText="Wala pay GKK nga gi-publish. Pangutana sa opisina sa parokya."
      >
        {q && <div aria-live="polite" className="font-semibold text-[14px] lg:text-[15px] text-[#4d4636] mb-2.5 lg:mb-3">{count} ka GKK ang nakit-an</div>}
        {!count ? (
          <div className="bg-parish-card border border-dashed border-[#d9cdb4] rounded-2xl p-[18px] text-center lg:max-w-[560px] lg:mx-auto lg:p-[26px] lg:rounded-[18px]">
            <div className="font-serif text-[21px] lg:text-[24px] font-bold text-parish-navy mb-1">Walay GKK nga nakit-an para sa “{q}”</div>
            <p className="m-0 mb-3 text-[15px] text-[#4d4636]">Sulayi ang ngalan sa barangay, o pangutan-a ang opisina.</p>
            <BigButton variant="secondary" to="/kontak" className="!w-auto inline-flex px-4">Kontaka ang opisina</BigButton>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5 lg:hidden">{items.map((g) => <GkkCard key={g.name} g={g} />)}</div>
            <GkkTable items={items} />
          </>
        )}
      </DataState>
    </>
  );
}

const gkkPath = (name) => `/komunidad/gkk/${encodeURIComponent(name)}`;

/** Desktop: every GKK in one table; the GKK name opens its page. */
function GkkTable({ items }) {
  const th = 'text-left px-4 py-2.5 font-bold text-[12px] tracking-[.08em] uppercase text-[#4d4636]';
  return (
    <div className="hidden lg:block bg-parish-card border border-parish-border rounded-[18px] shadow-cardSm overflow-hidden">
      <table className="w-full border-collapse">
        <thead className="bg-parish-bg">
          <tr>
            <th scope="col" className={th}>GKK</th>
            <th scope="col" className={th}>Purok / Sitio</th>
            <th scope="col" className={th}>Kapilya</th>
            <th scope="col" className={th}>Natukod</th>
            <th scope="col" className={`${th} whitespace-nowrap`}>Pamilya</th>
            <th scope="col" className={th}>Iskedyul sa tigom</th>
          </tr>
        </thead>
        <tbody>
          {items.map((g) => (
            <tr key={g.name} className="border-t border-[#f0e8d6] hover:bg-[#fbf7ef]">
              <td className="px-4 py-3">
                <Link to={gkkPath(g.name)} className="font-serif text-[18px] font-bold text-parish-navy hover:text-parish-blue">
                  {g.patron} {g.area && <span className="text-parish-blue">-{g.area}</span>}
                </Link>
              </td>
              <td className="px-4 py-3 text-[14px] text-parish-text2">{g.puroks || '—'}</td>
              <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{g.chapel_address || '—'}</td>
              <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{g.year_established || '—'}</td>
              <td className="px-4 py-3 text-[14.5px] text-[#3f3b2f] whitespace-nowrap"><strong>{g.households ?? SMALL}</strong></td>
              <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{g.meeting_schedule || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GkkCard({ g }) {
  return (
    <Card className="flex flex-col lg:rounded-[18px] hover:border-[var(--p-blue-border)]">
      <Link to={gkkPath(g.name)} className="w-full text-left px-3.5 pt-3.5 pb-2.5 lg:px-[18px] lg:pt-4 lg:pb-3 flex gap-2.5 items-start lg:flex-1">
        <div className="flex-1 min-w-0">
          <div className="font-serif text-[21px] lg:text-[23px] font-bold leading-[1.15] text-parish-navy">
            {g.patron} {g.area && <span className="text-parish-blue">-{g.area}</span>}
          </div>
          {g.puroks && <div className="text-[13.5px] text-parish-text2 mt-0.5">{g.puroks}</div>}
          {(g.chapel_address || g.year_established) && (
            <div className="text-[13.5px] text-parish-text2 mt-0.5">{[g.chapel_address && `Kapilya: ${g.chapel_address}`, g.year_established && `Natukod ${g.year_established}`].filter(Boolean).join(' · ')}</div>
          )}
          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2 text-[14px] text-[#3f3b2f]">
            <span className="flex items-center gap-[5px]"><Icon name="home" size={15} className="text-parish-blue" /><strong>{g.households ?? SMALL}</strong> pamilya</span>
            {g.meeting_schedule && <span className="flex items-center gap-[5px]"><Icon name="clock" size={15} className="text-parish-blue" />{g.meeting_schedule}</span>}
          </div>
        </div>
        <Icon name="chev" size={18} className="text-parish-muted mt-1 lg:hidden" />
      </Link>
    </Card>
  );
}

export function GkkDetail() {
  const { name } = useParams();
  const dir = listState(useGkkDirectory());
  const census = useCensusProgress().data;
  const page = useGkkPage(name).data;
  const found = dir.rows.find((g) => g.name === name);
  const { patron, area } = gkkParts(name);
  useSiteTitle(patron);

  const pad = `${INNER} lg:max-w-[760px]`;
  if (dir.loading) return <main className={pad}><Skeletons n={3} h={90} /></main>;
  if (dir.error) return <main className={pad}><ErrorNote onRetry={dir.reload}>Wala ma-load ang GKK.</ErrorNote></main>;
  if (!found) return <main className={pad}><EmptyNote>Wala namo makit-i kini nga GKK.</EmptyNote><BigButton variant="secondary" to="/komunidad?view=gkk">Tan-awa ang tanang GKK</BigButton></main>;
  const g = found;

  return (
    <main className={`${INNER} lg:max-w-[880px]`}>
      <div>
      {page?.photo_url && <Photo src={page.photo_url} h={210} hLg={440} alt={`Kapilya sa ${patron}`} />}
      {area && <div className="inline-flex items-center gap-[5px] font-bold text-[12px] lg:text-[12.5px] tracking-[.1em] uppercase text-[var(--p-eyebrow)]"><Icon name="pin" size={14} />{area}</div>}
      <h1 className="font-serif font-semibold text-[34px] lg:text-[54px] leading-[1.05] lg:leading-[1.02] mt-1 mb-1 lg:mt-1.5 lg:mb-1.5 text-parish-navy">{patron}</h1>
      {g.puroks && <div className="text-[15px] lg:text-[17px] text-[#4d4636] mb-4 lg:mb-6">{g.puroks}</div>}
      {(g.chapel_address || g.year_established) && (
        <div className={`flex gap-2.5 items-start text-[15px] lg:text-[16px] text-[#3f3b2f] mb-4 lg:mb-6 ${g.puroks ? '' : 'mt-3'}`}>
          <Icon name="home" className="text-parish-blue flex-none mt-px" />
          <div>
            {g.chapel_address && <div><span className="text-parish-text2">Kapilya:</span> <span className="font-semibold">{g.chapel_address}</span></div>}
            {g.year_established && <div className="text-parish-text2">Natukod niadtong {g.year_established}</div>}
          </div>
        </div>
      )}
      <div className={`grid gap-2.5 mb-3.5 lg:grid-cols-3 lg:gap-3.5 lg:mb-[22px] ${census?.open ? 'grid-cols-2' : 'grid-cols-1'} ${g.puroks || g.chapel_address || g.year_established ? '' : 'mt-3'}`}>
        <StatTile value={g.households} label="Pamilya" />
        {census?.open && <StatTile value={g.census_pct != null ? `${g.census_pct}%` : null} small="—" label="Census na-update" />}
        {g.meeting_schedule && (
          <div className="hidden lg:block bg-parish-card border border-parish-border rounded-[18px] p-[18px]">
            <div className="font-semibold text-[17px] leading-[1.3]">{g.meeting_schedule}</div>
            <div className="font-bold text-[11.5px] tracking-[.12em] uppercase text-parish-text2 mt-2">Bible-sharing</div>
          </div>
        )}
      </div>
      {g.meeting_place && (
        <div className="hidden lg:flex gap-3 items-center text-[16px] text-[#3f3b2f] mb-7">
          <Icon name="pin" className="text-parish-blue" />Tigomanan: {g.meeting_place}
        </div>
      )}
      {(g.meeting_schedule || g.meeting_place) && (
        <Card className="px-3.5 py-1 mb-3.5 shadow-none lg:hidden">
          {g.meeting_schedule && (
            <div className={`flex gap-3 py-3 ${g.meeting_place ? 'border-b border-[#f0e8d6]' : ''}`}>
              <Icon name="clock" className="text-parish-blue" />
              <div><div className="text-[13px] text-parish-text2">Bible-sharing</div><div className="font-semibold text-[15.5px]">{g.meeting_schedule}</div></div>
            </div>
          )}
          {g.meeting_place && (
            <div className="flex gap-3 py-3">
              <Icon name="pin" className="text-parish-blue" />
              <div><div className="text-[13px] text-parish-text2">Tigomanan</div><div className="font-semibold text-[15.5px]">{g.meeting_place}</div></div>
            </div>
          )}
        </Card>
      )}

      </div>

      <Link
        to={`/register?gkk=${encodeURIComponent(g.name)}`}
        className="w-full min-h-[56px] flex items-center justify-center text-center px-4 font-bold text-[16.5px] text-white bg-parish-blue rounded-[14px] hover:bg-parish-blueDeep lg:w-auto lg:inline-flex lg:min-h-[58px] lg:px-8 lg:text-[17px]"
        style={{ boxShadow: '0 14px 30px -12px color-mix(in srgb, var(--p-blue) 65%, transparent)' }}
      >
        Mao ni ang akong GKK, magparehistro
      </Link>
      {page?.photos?.length > 0 && (
        <div className="mt-9 lg:mt-12">
          <Gallery photos={page.photos} id="gkk-photos-title" cols="grid-cols-2 sm:grid-cols-3" />
        </div>
      )}
      {(page?.history || page?.history_photos?.length > 0) && (
        <section aria-labelledby="gkk-history-title" className="mt-9 lg:mt-12">
          <h2 id="gkk-history-title" className="font-serif font-semibold text-[26px] lg:text-[34px] m-0 mb-3 lg:mb-4 text-parish-navy">Kasaysayan</h2>
          {page.history && <Body text={page.history} />}
          <Gallery photos={page.history_photos} title="Mga litrato sa kasaysayan" id="gkk-history-photos-title" />
        </section>
      )}
    </main>
  );
}

function StatTile({ value, small = SMALL, label }) {
  return (
    <div className="bg-parish-card border border-parish-border rounded-2xl p-3.5 lg:rounded-[18px] lg:p-[18px]">
      {value == null
        ? <div className="font-serif text-[24px] lg:text-[28px] font-bold text-[#4d4636] leading-[1.25] lg:leading-[1.3]">{small}</div>
        : <div className="font-serif text-[36px] lg:text-[44px] font-bold text-parish-blue leading-none">{value}</div>}
      <div className="font-bold text-[11px] lg:text-[11.5px] tracking-[.12em] uppercase text-parish-text2 mt-1.5 lg:mt-2">{label}</div>
    </div>
  );
}

function CensusProgress() {
  const q = useCensusProgress();
  const c = q.data;
  const [sort, setSort] = useState('pct');

  if (q.loading) return <div className="lg:grid lg:grid-cols-[380px_1fr] lg:gap-6"><Skeleton h={200} className="mb-3 lg:h-[420px]" /><Skeleton h={260} alt className="lg:h-[520px]" /></div>;
  if (q.error) return <ErrorNote onRetry={q.reload}>Wala ma-load ang progreso sa census.</ErrorNote>;
  if (!c?.open) {
    return (
      <Card className="px-[18px] py-[22px] text-center shadow-none lg:max-w-[560px] lg:mx-auto lg:p-[30px] lg:rounded-[18px]">
        <div className="font-serif text-[23px] lg:text-[28px] font-bold text-parish-navy mb-1.5">Sirado ang census karon</div>
        <p className="m-0 text-[15px] leading-normal text-[#4d4636]">Ipakita diri ang progreso inig abli sa sunod nga census.</p>
      </Card>
    );
  }
  if (c.pct == null) return <EmptyNote>Bag-o pa lang giablihan ang census. Wala pay igo nga na-update aron ipakita.</EmptyNote>;

  // "Pinakataas" needs at least two GKKs with a percentage to show; percentages
  // of GKKs under 5 families are hidden, and those would just come out A–Z.
  const canRank = (c.gkks || []).filter((r) => r.pct != null).length >= 2;
  const rows = sortCensusGkks(c.gkks, canRank ? sort : 'name');
  // Desktop shows two columns; fill them top to bottom so the order reads down each column.
  const perColumn = Math.ceil(rows.length / 2);

  return (
    <div className="lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-6 lg:items-start">
      <Card className="px-4 py-[18px] text-center mb-4 shadow-card lg:sticky lg:top-24 lg:mb-0 lg:px-6 lg:py-7 lg:rounded-[20px]" style={CENSUS_CARD}>
        <CensusAlertBadges label={c.label} className="justify-center mb-2" />
        <CensusCountdown endsOn={c.ends_on} className="mb-3 lg:mb-4" />
        <div role="img" aria-label={`${c.pct} porsyento`} className="w-[132px] h-[132px] lg:w-[180px] lg:h-[180px] rounded-full mx-auto mb-3 lg:mb-4 flex items-center justify-center" style={{ background: `conic-gradient(var(--p-blue) 0 ${c.pct}%, rgba(255,255,255,.85) 0)` }}>
          <div className="w-[104px] h-[104px] lg:w-[144px] lg:h-[144px] rounded-full bg-parish-card flex flex-col items-center justify-center">
            <div className="font-serif text-[40px] lg:text-[54px] font-bold leading-none text-parish-blue">{c.pct}%</div>
            <div className="text-[12px] lg:text-[13px] text-parish-text2">na-update</div>
          </div>
        </div>
        <h2 className="font-serif font-semibold text-[24px] lg:text-[28px] leading-[1.15] lg:leading-[1.12] m-0 mb-1.5 lg:mb-2 text-parish-navy">{c.label}: {c.pct}% sa mga pamilya na-update na</h2>
        <p className="m-0 mb-3.5 lg:mb-[18px] text-[15px] lg:text-[15.5px] leading-normal lg:leading-[1.55] text-[#4d4636]">
          Salamat sa tanang GKK!{c.ends_on ? ` Abli pa hangtod ${fmtLong(c.ends_on)}.` : ''} Ang matag pamilya nga mo-update makatabang sa parokya sa pag-alagad.
        </p>
        <BigButton to="/census" className="min-h-[52px] text-[16px]">I-update ang among rekord</BigButton>
        {(c.gkks || []).some((r) => r.pct === 100) && (
          <div className="hidden lg:block text-[13px] text-parish-text2 mt-3">{c.gkks.filter((r) => r.pct === 100).length} ka GKK ang kompleto na</div>
        )}
      </Card>
      <div>
      <div className="flex items-center justify-between gap-2 mb-2.5 lg:mb-3">
        <h3 className="m-0 font-serif text-[21px] lg:text-[26px] font-bold text-parish-navy">Matag GKK</h3>
        {canRank && <Pills options={[['pct', 'Pinakataas'], ['name', 'Ngalan']]} value={sort} onChange={setSort} className="[&>button]:flex-none [&>button]:px-3 [&>button]:min-h-[40px] [&>button]:text-[13.5px]" />}
      </div>
      <Card
        className="px-3.5 py-1 shadow-none lg:px-[22px] lg:py-1.5 lg:rounded-[18px] lg:grid lg:grid-cols-2 lg:grid-flow-col lg:gap-x-8 lg:[grid-template-rows:repeat(var(--rows),auto)]"
        style={{ '--rows': perColumn }}
      >
        {rows.map((r, i) => (
          <div key={r.name} className={`py-[11px] lg:py-3 border-b border-[#f4eddd] last:border-b-0 ${i === perColumn - 1 ? 'lg:border-b-0' : ''}`}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <div className="flex-1 min-w-0 font-semibold text-[14.5px] leading-[1.25]">{r.name}</div>
              {r.pct === 100 && (
                <span className="inline-flex items-center gap-1 font-bold text-[11.5px] text-parish-navy rounded-full px-2 py-0.5" style={{ background: 'var(--p-gold-light)' }}>
                  <Icon name="star" size={12} />Kompleto!
                </span>
              )}
              <span className="font-bold text-[14.5px] text-parish-blueDeep min-w-[38px] text-right">{r.pct != null ? `${r.pct}%` : '—'}</span>
            </div>
            {r.pct != null ? (
              <div className="h-2 rounded-full bg-[#efe6d3] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: 'var(--p-blue-light)' }} /></div>
            ) : (
              <div className="text-[12.5px] text-parish-text2">Ubos sa 5 ka pamilya. Dili ipakita ang porsyento.</div>
            )}
          </div>
        ))}
      </Card>
      <div className="text-[12.5px] lg:text-[13px] text-parish-text2 mt-2 lg:mt-2.5">Porsyento lang ang gipakita. Walay ngalan sa pamilya.</div>
      </div>
    </div>
  );
}
