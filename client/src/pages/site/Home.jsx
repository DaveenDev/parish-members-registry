import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { Card, ErrorNote, SectionHead, Skeletons, Skeleton } from '../../components/site/kit.jsx';
import { AnnouncementCard, ArticleChip, CardShare, EventCard, EventRow, MassRow } from '../../components/site/cards.jsx';
import CreditFooter from '../../components/CreditFooter.jsx';
import { censusCountdown, excerpt, fmtDayMonth, fmtLong, fmtShort, upcomingToday } from '../../lib/site.js';
import { massType, todayIso } from '../../lib/website.js';
import { api } from '../../api.js';
import { usePublicData } from '../../components/site/usePublicData.js';
import { PARISH_NAME, PARISH_SUB, SiteFooter } from './SiteLayout.jsx';
import { listState, useAnnouncements, useArticles, useCensusProgress, useEvents, useMassSchedule, useOffice, usePortalStatus } from './data.js';

const DISMISSED_KEY = 'pmr_dismissed_urgent';

function readDismissed() {
  try { return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
}

export default function Home() {
  const mass = listState(useMassSchedule());
  const ann = listState(useAnnouncements());
  const events = listState(useEvents());
  const portal = usePortalStatus().data;
  const census = useCensusProgress();
  const censusOpen = !!census.data?.open;
  const office = useOffice().data;
  const [dismissed, setDismissed] = useState(readDismissed);
  const hero = usePublicData('heroImage', api.publicParishHeroImage).data || null;

  const urgent = ann.rows.find((a) => a.urgent && !dismissed.includes(a.id));
  // The two newest by start date, urgent and pinned ones included.
  const latest = [...ann.rows].sort((a, b) => b.publish_on.localeCompare(a.publish_on) || b.id - a.id).slice(0, 2);
  // Desktop band columns (see the band below): one announcement takes one column, two take two.
  const single = latest.length === 1;
  const annCols = single ? 'lg:col-span-1' : 'lg:col-span-2';
  const evCol = single ? 'lg:col-start-2' : 'lg:col-start-3';

  function dismiss() {
    const next = [...dismissed, urgent.id];
    setDismissed(next);
    try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch {}
  }

  return (
    <main className="pb-7 animate-fadeUp">
      {urgent && (
        <div role="alert" className="mx-3.5 mt-3 bg-parish-errorBg border border-parish-errorBorder rounded-[14px] text-parish-error lg:m-0 lg:rounded-none lg:border-x-0 lg:border-t-0">
          <div className="flex gap-1.5 items-start py-2.5 pl-3 pr-1 lg:max-w-[1240px] lg:mx-auto lg:items-center lg:gap-3 lg:py-1.5 lg:pl-6 lg:pr-4">
            <Icon name="alert" className="mt-[3px] lg:mt-0 lg:w-5 lg:h-5" />
            <Link to={`/pahibalo/${urgent.id}`} className="flex-1 py-0.5 font-semibold text-[15px] leading-[1.35] lg:flex lg:items-center lg:gap-3 lg:text-[15.5px]">
              <span className="block font-bold text-[11px] lg:text-[11.5px] tracking-[.14em] uppercase mb-0.5 lg:mb-0">Urgent</span>
              <span className="lg:underline lg:underline-offset-[3px]">{urgent.title}</span>
            </Link>
            <button type="button" aria-label="Isira ang pahibalo" onClick={dismiss} className="w-11 h-11 flex-none flex items-center justify-center -mt-1.5 lg:mt-0">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>
      )}

      <section className="relative overflow-hidden lg:border-b lg:border-parish-border" style={{ background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' }}>
        {hero && (
          <>
            {/* Desktop: the photo behind the hero, faded to cream on the left so the text stays readable. */}
            <img src={hero} alt="" aria-hidden="true" className="hidden lg:block absolute inset-0 w-full h-full object-cover" />
            <div aria-hidden="true" className="hidden lg:block absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(247,242,232,.97) 0%, rgba(247,242,232,.9) 34%, rgba(247,242,232,.35) 56%, rgba(247,242,232,0) 72%)' }} />
            {/* Phones: the photo as a banner, fading into the hero below it. */}
            <div className="lg:hidden relative h-[210px]">
              <img src={hero} alt={`${PARISH_NAME}`} className="absolute inset-0 w-full h-full object-cover" />
              <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-20" style={{ background: 'linear-gradient(180deg, rgba(247,242,232,0) 0%, #f7f2e8 100%)' }} />
            </div>
          </>
        )}
        <div className="relative lg:max-w-[1240px] lg:mx-auto lg:px-6 lg:pt-16 lg:pb-[60px] lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14 lg:items-center lg:min-h-[480px]">
          <div className={`text-center px-[22px] pb-7 lg:text-left lg:p-0 ${hero ? 'pt-2' : 'pt-[30px]'}`}>
            <div className="font-bold text-[11.5px] lg:text-[12.5px] tracking-[.2em] lg:tracking-[.22em] uppercase text-[var(--p-eyebrow)] mb-2.5 lg:mb-3">Rehistro sa mga Miyembro sa Parokya</div>
            <h1 className="font-serif font-semibold text-[38px] lg:text-[64px] leading-[1.02] lg:leading-[.98] m-0 mb-1 lg:mb-1.5 text-parish-navy">{PARISH_NAME}</h1>
            <div className="font-serif text-[20px] lg:text-[27px] text-parish-blue tracking-[.04em] mb-4 lg:mb-5">{PARISH_SUB}</div>
            <p className="text-[16px] lg:text-[18.5px] leading-relaxed lg:leading-[1.6] text-[#4d4636] m-0 mb-[22px] lg:mb-[30px] lg:max-w-[560px]">
              Welcome! Irehistro ang inyong pamilya sa parokya aron kita magpabiling magkasinabot, magkauban sa pagsaulog sa mga sakramento, ug mag-alagaray sa usag usa diha sa pagtuo.
            </p>
            <div className="lg:flex lg:flex-wrap lg:gap-3 lg:items-center">
              <Link
                to="/register"
                className="w-full min-h-[56px] flex items-center justify-center font-bold text-[17px] text-white bg-parish-blue rounded-[14px] hover:bg-parish-blueDeep lg:w-auto lg:min-h-[58px] lg:px-[34px] lg:text-[18px]"
                style={{ boxShadow: '0 14px 30px -12px color-mix(in srgb, var(--p-blue) 65%, transparent)' }}
              >
                Irehistro ang Inyong Pamilya
              </Link>
              {/* The census notice below has the same button, so this one only shows without it. */}
              {portal?.open && !census.loading && !censusOpen && (
                <Link to="/census" className="w-full min-h-[50px] mt-2.5 flex items-center justify-center font-semibold text-[15.5px] text-parish-blueDeep bg-parish-card border-[1.5px] border-[var(--p-blue-border)] rounded-[14px] lg:w-auto lg:mt-0 lg:min-h-[58px] lg:px-[22px] lg:text-[16px]">
                  Narehistro na? I-update ang inyong rekord
                </Link>
              )}
            </div>
            <div className="mt-4 lg:mt-[18px] flex justify-center lg:justify-start gap-[7px] text-[13.5px] lg:text-[14px] leading-snug text-parish-text2">
              <Icon name="lock" size={15} className="mt-0.5" />
              <span>Pribado ang inyong impormasyon. Ang kawani lang sa parokya ang makakita.</span>
            </div>
          </div>
          {/* The right column stays empty on desktop so the parish photo shows. */}
        </div>
      </section>

      <CensusNotice />

      {/* A full-width navy band right under the hero, like the census notice, so the
          page keeps one when no census is open. It joins the notice when that shows. */}
      <div className={`pb-7 bg-parish-navy lg:py-12 ${censusOpen ? 'border-t border-white/15' : ''}`}>
      {/* Desktop: one 3-column grid for both sections (lg:contents), so the next
          event's card is as wide as an announcement card and the cards in the
          row share one height. Later events follow as rows under it. With one
          announcement the events move up beside it, leaving the gap on the right. */}
      <div className="lg:max-w-[1240px] lg:mx-auto lg:px-6 lg:grid lg:grid-cols-3 lg:gap-x-5">
      <section className="px-3.5 pt-7 lg:p-0 lg:contents">
        <div className={`${annCols} lg:row-start-1`}>
          <SectionHead dark title="Bag-ong pahibalo" to="/pahibalo" action="Tanan" actionLg="Tanang pahibalo →" />
        </div>
        <div className={`${annCols} lg:row-start-2`}>
          {ann.loading ? <Skeletons n={2} h={104} /> : ann.error ? (
            <p className="m-0 text-[#ffb4a8] text-[15px]">Wala ma-load ang mga pahibalo.</p>
          ) : !latest.length ? (
            <p className="m-0 text-white/75 text-[15px]">Wala pay pahibalo karong semanaha.</p>
          ) : (
            <div className={`flex flex-col gap-2.5 lg:grid lg:gap-5 lg:h-full ${single ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
              {latest.map((a) => <AnnouncementCard key={a.id} a={a} fill />)}
            </div>
          )}
        </div>
      </section>

      <section className="px-3.5 pt-7 lg:p-0 lg:contents">
        <div className={`${evCol} lg:row-start-1`}>
          <SectionHead dark title="Umaabot nga kalihokan" to="/misa?view=kalendaryo" action="Kalendaryo" actionLg="Kalendaryo →" />
        </div>
        <div className={`${evCol} lg:row-start-2`}>
          {events.loading ? <Skeleton h={150} /> : events.error ? (
            <p className="m-0 text-[#ffb4a8] text-[15px]">Wala ma-load ang kalendaryo.</p>
          ) : events.empty ? (
            <p className="m-0 text-white/75 text-[15px]">Walay kalihokan nga naka-iskedyul.</p>
          ) : (
            <EventCard e={events.rows[0]} showDate fill />
          )}
        </div>
        {events.rows.length > 1 && (
          // See-through rows on the navy for the ones after it.
          <div className={`mt-2.5 lg:mt-3.5 ${evCol} lg:row-start-3 border`}> border-white/15 rounded-2xl lg:rounded-[18px] overflow-hidden bg-white/[.06]">
            {events.rows.slice(1, 3).map((e) => <EventRow key={e.id} e={e} dark />)}
          </div>
        )}
      </section>
      </div>
      </div>

      <section className="px-3.5 pt-[22px] lg:hidden">
        <MassToday mass={mass} />
      </section>

      <ParishStats mass={mass} />

      <LatestArticles />

      <section className="px-3.5 pt-7 lg:max-w-[1240px] lg:mx-auto lg:px-6 lg:pt-12">
        <h2 className="font-serif font-semibold text-[25px] lg:text-[30px] m-0 mb-2.5 lg:mb-3.5 text-parish-navy">Unsa ang imong kinahanglan?</h2>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3.5">
          <QuickLink to="/serbisyo/susiha" icon="search" sub="Gamit ang reference number">Susiha ang akong rehistro</QuickLink>
          <QuickLink to="/serbisyo/hangyo/sertipiko" icon="doc" sub="Bunyag, Kumpil, Kasal">Pangayo og sertipiko</QuickLink>
          <QuickLink to="/serbisyo/dugo" icon="drop" sub="Nanginahanglan o mo-donate">Blood donor call</QuickLink>
          <QuickLink to="/kontak" icon="phone" sub="Tawag, text, mapa">Kontak ug oras sa opisina</QuickLink>
        </div>
      </section>


      <div className="lg:hidden">
        <SiteFooter address={office?.address} />
        <CreditFooter inline />
      </div>
    </main>
  );
}

/**
 * Important notice right under the hero while a census is open: a full-width
 * row a shade deeper than the navy band below it, with a gold top line, the
 * way in for families and the parish-wide progress. Hidden while loading and
 * when no census is open.
 */
function CensusNotice() {
  const c = useCensusProgress().data;
  if (!c?.open) return null;
  const countdown = censusCountdown(c.ends_on, todayIso());
  return (
    <section
      aria-labelledby="census-notice"
      className="text-white border-t-[3px]"
      style={{ background: 'color-mix(in srgb, var(--p-navy) 80%, black)', borderColor: 'var(--p-gold-light)' }}
    >
      <div className="px-4 py-6 lg:max-w-[1240px] lg:mx-auto lg:px-6 lg:py-7 lg:flex lg:items-center lg:gap-8">
        <div className="flex gap-3.5 items-start flex-1 min-w-0">
          <span className="w-12 h-12 lg:w-14 lg:h-14 flex-none rounded-2xl flex items-center justify-center" style={{ background: 'var(--p-gold-light)', color: 'var(--p-navy)' }}>
            <Icon name="people" size={26} />
          </span>
          <div className="min-w-0">
            <div className="font-bold text-[11.5px] lg:text-[12px] tracking-[.18em] uppercase mb-1" style={{ color: 'var(--p-gold-light)' }}>Importante nga pahibalo</div>
            <h2 id="census-notice" className="m-0 font-serif font-semibold text-[23px] lg:text-[30px] leading-[1.15]">
              Nagpadayon ang {c.label || 'census sa parokya'}
            </h2>
            <p className="m-0 mt-1.5 text-[15px] lg:text-[16px] leading-normal text-white/85">
              I-update ang rekord sa inyong pamilya gamit ang reference number ug code sa inyong census form
              {c.ends_on && !countdown ? <> — abli hangtod <strong className="text-white">{fmtLong(c.ends_on)}</strong></> : null}.
            </p>
            {countdown && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold text-[13.5px] text-parish-navy" style={{ background: 'var(--p-gold-light)' }}>
                <Icon name="clock" size={15} />{countdown} — hangtod {fmtLong(c.ends_on)}
              </div>
            )}
            {c.pct != null && (
              <div className="mt-3 flex items-center gap-3 max-w-[460px]">
                <div
                  role="progressbar"
                  aria-label="Mga pamilya nga na-update na"
                  aria-valuenow={c.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="flex-1 h-2.5 rounded-full bg-white/15 overflow-hidden"
                >
                  <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: 'var(--p-gold-light)' }} />
                </div>
                <span className="flex-none text-[13.5px] text-white/85"><strong className="text-white">{c.pct}%</strong> na-update na</span>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 lg:mt-0 lg:flex-row lg:flex-none lg:gap-3">
          <Link to="/census" className="min-h-[52px] px-6 rounded-[14px] flex items-center justify-center font-bold text-[16px] text-parish-navy hover:brightness-105" style={{ background: 'var(--p-gold-light)' }}>
            I-update ang among rekord
          </Link>
          <Link to="/komunidad" className="min-h-[48px] px-5 rounded-[14px] flex items-center justify-center font-semibold text-[15px] text-white border-[1.5px] border-white/40 hover:bg-white/10">
            Tan-awa ang progreso
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Today's remaining Masses: a card under the hero on phones, beside it on desktop. */
function MassToday({ mass }) {
  const now = new Date();
  const todays = upcomingToday(mass.rows, now);
  const anyToday = mass.rows.some((r) => r.day_of_week === now.getDay());
  return (
    <Card className="p-4 shadow-card lg:p-[22px] lg:rounded-[22px]">
      <div className="flex items-baseline justify-between gap-2 mb-2.5 lg:mb-3">
        <h2 className="font-serif font-semibold text-[23px] lg:text-[27px] m-0 text-parish-navy">Misa karong adlawa</h2>
        <span className="font-semibold text-[13px] lg:text-[14px] text-parish-text2">{fmtDayMonth(todayIso())}</span>
      </div>
      {mass.loading ? <Skeletons n={2} h={52} /> : mass.error ? (
        <ErrorNote onRetry={mass.reload}>Wala ma-load ang iskedyul.</ErrorNote>
      ) : !todays.length ? (
        <p className="mt-1 text-parish-text2 text-[15px] lg:text-[16px]">
          {anyToday ? 'Nahuman na ang mga Misa karong adlawa.' : 'Walay Misa nga naka-iskedyul karong adlawa.'}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 lg:gap-2">
          {todays.map((m) => <MassRow key={m.id} m={m} compact />)}
        </div>
      )}
      <Link to="/misa" className="min-h-[44px] mt-1.5 lg:mt-2 px-0.5 inline-flex items-center gap-1 font-bold text-[15px] lg:text-[15.5px] text-parish-blue hover:text-parish-blueDeep">
        Tibuok iskedyul sa semana<Icon name="chev" size={16} />
      </Link>
    </Card>
  );
}

// Public totals, in order. `people` counts under 5 aren't shown; the rest
// (groups, Masses) aren't about individuals, so they show as they are.
const STAT_TILES = [
  // A count of households doesn't point to anyone, so it always shows.
  { key: 'households', label: 'Pamilya', icon: 'home' },
  { key: 'members', label: 'Miyembro', icon: 'people', people: true },
  { key: 'gkks', label: 'GKK', icon: 'ev-gkk' },
  { key: 'ministries', label: 'Ministry', icon: 'heart' },
  { key: 'organizations', label: 'Organisasyon', icon: 'ev-meeting' },
  { key: 'masses', label: 'Misa matag semana', icon: 'church' },
];
// Icon-beside-number cards need ~200px, so five or six go three across until the page is wide.
const STAT_COLS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-3 xl:grid-cols-5', 6: 'grid-cols-3 xl:grid-cols-6' };

/**
 * "Parokya sa usa ka tan-aw": desktop only (kept off phones on purpose).
 * Totals only, never names. A count of people under 5 is left out so a
 * small group can't be singled out. Weekly Masses come from the public
 * schedule. Hidden when the totals can't be loaded.
 */
function ParishStats({ mass }) {
  const q = usePublicData('stats', api.publicStats);
  const s = q.data;
  if (q.error || (!q.loading && !s)) return null;
  // Each weekly row is one Mass a week (a Daily Mass has a row per day); dated ones are one-offs.
  const masses = mass.rows.filter((r) => !r.mass_date && /Mass/.test(massType(r))).length;
  const values = { ...s, masses: masses || null };
  // A people count under 5 is left out entirely, so a small group can't be singled out.
  const tiles = s ? STAT_TILES.filter((t) => values[t.key] != null && !(t.people && values[t.key] < 5)) : [];
  const sub = (t) => (t.key === 'gkks' && s.oldest_gkk_year ? `Sukad ${s.oldest_gkk_year}` : null);
  return (
    <section className="hidden lg:block max-w-[1240px] mx-auto px-6 pt-11">
      <div className="flex items-baseline justify-between gap-4 mb-3.5">
        <div>
          <div className="font-bold text-[12px] tracking-[.18em] uppercase text-[var(--p-eyebrow)] mb-1">Parokya sa usa ka tan-aw</div>
          <h2 className="font-serif font-semibold text-[32px] m-0 text-parish-navy">Atong pamilya sa parokya</h2>
        </div>
        <span className="text-[13.5px] text-parish-text2">Ihap lang, walay ngalan.</span>
      </div>
      <div className={`grid gap-3.5 ${q.loading ? STAT_COLS[6] : STAT_COLS[tiles.length] || 'grid-cols-6'}`}>
        {q.loading ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={104} className="rounded-[18px]" />) : tiles.map((t) => {
          const n = values[t.key];
          return (
            <div key={t.key} className="bg-parish-card border border-parish-border rounded-[18px] shadow-cardSm px-4 py-[18px] min-h-[104px] flex items-center gap-3.5">
              <span className="w-14 h-14 flex-none rounded-2xl flex items-center justify-center border" style={{ background: 'var(--p-blue-tint)', color: 'var(--p-blue)', borderColor: 'var(--p-blue-border)' }}>
                <Icon name={t.icon} size={30} />
              </span>
              <div className="min-w-0">
                <div className="font-serif text-[36px] font-bold text-parish-blue leading-none">{n.toLocaleString('en-US')}</div>
                <div className="font-bold text-[11px] tracking-[.1em] uppercase text-parish-text2 mt-1.5 leading-[1.3]">{t.label}</div>
                {sub(t) && <div className="text-[12px] text-parish-text2 mt-0.5">{sub(t)}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The two newest blog articles, one row each: photo then text on the first,
 * text then photo on the second (stacked, photo first, on phones). A row
 * shows only when there's an article for it; the section hides while
 * loading, on error, or when there are none. Sits between the parish totals
 * and "Unsa ang imong kinahanglan?".
 */
function LatestArticles() {
  const q = listState(useArticles());
  const rows = q.rows.slice(0, 2);
  if (q.loading || q.error || !rows.length) return null;
  return (
    <section className="px-3.5 pt-7 lg:max-w-[1240px] lg:mx-auto lg:px-6 lg:pt-12">
      <SectionHead title="Mga Artikulo" to="/pahibalo#artikulo" action="Tanan" actionLg="Tanang artikulo →" />
      <div className="flex flex-col gap-3 lg:gap-5">
        {rows.map((a, i) => <ArticleRow key={a.id} a={a} flip={i === 1} />)}
      </div>
    </section>
  );
}

function ArticleRow({ a, flip }) {
  const path = `/pahibalo/artikulo/${a.id}`;
  return (
    <div className="relative">
      <CardShare title={a.title} path={path} />
      <Link
        to={path}
        className="grid bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden transition-colors hover:border-[var(--p-blue-border)] lg:grid-cols-2"
      >
        <div className={`relative aspect-[16/9] lg:aspect-auto lg:min-h-[260px] bg-[#efe6d3] flex items-center justify-center text-[var(--p-gold-deep)] ${flip ? 'lg:order-2' : ''}`}>
          {a.photo_url ? <img src={a.photo_url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" /> : <Icon name="church" size={44} />}
        </div>
        <div className="p-4 lg:p-8 flex flex-col justify-center min-w-0">
          <div className="flex gap-2 items-center mb-1.5 lg:mb-2.5">
            <ArticleChip a={a} />
            <span className="text-[13px] lg:text-[14px] text-parish-text2">{fmtShort(a.held_on)}</span>
          </div>
          <div className="font-serif font-bold text-[21px] lg:text-[28px] leading-[1.2] text-parish-navy">{a.title}</div>
          {(a.summary || a.body) && <p className="m-0 mt-1.5 lg:mt-2.5 text-[15px] lg:text-[16px] leading-relaxed text-[#4d4636]">{excerpt(a.summary || a.body, 220)}</p>}
          <span className="mt-3 lg:mt-4 inline-flex items-center gap-1 font-bold text-[15px] text-parish-blue">Basaha<Icon name="chev" size={16} /></span>
        </div>
      </Link>
    </div>
  );
}

function QuickLink({ to, icon, sub, children }) {
  return (
    <Link to={to} className="min-h-[88px] bg-parish-card border border-parish-border rounded-2xl p-3 flex flex-col gap-2 text-parish-blue lg:rounded-[18px] lg:p-[18px] lg:gap-3 hover:border-[var(--p-blue-border)]">
      <Icon name={icon} size={24} className="lg:w-7 lg:h-7" />
      <span className="font-semibold text-[14.5px] leading-[1.25] text-parish-ink lg:font-bold lg:text-[17px]">{children}</span>
      {sub && <span className="hidden lg:block -mt-1 text-[14.5px] text-parish-text2">{sub}</span>}
    </Link>
  );
}
