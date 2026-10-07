import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import SacramentIcon from '../../components/SacramentIcon.jsx';
import { BAND_PAD, Band, BigButton, DataState, EmptyNote, Eyebrow, Segmented, Skeleton, Skeletons, WRAP } from '../../components/site/kit.jsx';
import { Organisasyon } from '../../components/site/OrgCharts.jsx';
import VerseOfDay from '../../components/site/VerseOfDay.jsx';
import { MassRow } from '../../components/site/cards.jsx';
import { KALENDARYO_PAGE, guideShortTitle, massLocations, massSections } from '../../lib/site.js';
import { HISTORY_PAGE, openingParagraph } from '../../lib/history.js';
import { listState, useAnnouncements, useHistory, useMassSchedule, useOrgCharts, useSacramentGuides } from './data.js';

// The sections under Mass: the sacrament guides and the org charts, as tabs
// (?tab=): [key, title when it's the only one, label on the switch].
const TEACH_TABS = [['sakramento', 'Mga Sakramento ug Pormasyon', 'Mga Sakramento'], ['organisasyon', 'Organisasyon', 'Organisasyon']];
// Sideways-scrolling rows on a phone: no scrollbar under them.
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * Ang Simbahan: a random Bible verse with what the Catechism teaches about
 * it (and a way to the day's readings, /simbahan/pagbasa), on the light-blue
 * band; then the Mass schedule; then the sacrament guides and the parish's
 * organization charts, as two tabs on the band again; last, the parish's
 * history (its main article's photo and opening paragraph, on to
 * /simbahan/kasaysayan). Old /misa links land here (?view=sakramento still
 * works). The Kalendaryo moved to Pahibalo ug Kalihokan: old
 * ?view=kalendaryo links go there.
 */
export default function Simbahan() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'organisasyon' ? 'organisasyon' : 'sakramento';
  // Change some of the address's parameters, keep the rest.
  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  // Arriving for the sacraments or the org charts: go straight to them.
  const [jump] = useState(() => params.get('view') === 'sakramento' || params.has('tab'));
  // The verse above changes the page's height when it comes in: jump after it.
  const [verseIn, setVerseIn] = useState(false);

  if (params.get('view') === 'kalendaryo') return <Navigate replace to={KALENDARYO_PAGE} />;
  return (
    <main className="animate-fadeUp">
      <Band aria-labelledby="simbahan-title">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <div className="lg:flex lg:items-end lg:justify-between lg:gap-6 lg:mb-[22px]">
            <div>
              <Eyebrow>Pulong, Misa ug Sakramento</Eyebrow>
              <h1 id="simbahan-title" className="font-serif font-semibold text-[32px] lg:text-[46px] leading-[1.08] mt-0.5 mb-3 lg:mb-0 text-parish-navy">Ang Simbahan</h1>
            </div>
            <PageJumps onTab={(t) => update({ tab: t === 'sakramento' ? null : t, view: null })} />
          </div>
          <VerseOfDay onLoad={() => setVerseIn(true)} />
        </div>
      </Band>

      <section id="misa" aria-labelledby="misa-title" className="scroll-mt-16 lg:scroll-mt-[76px] py-7 lg:py-12">
        <div className={WRAP}>
          <div className="mb-3 lg:mb-[22px]">
            <Eyebrow>Iskedyul sa Misa</Eyebrow>
            <h2 id="misa-title" className="m-0 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">Misa</h2>
          </div>
          <MassSchedule />
        </div>
      </section>

      <TeachingTabs tab={tab} onTab={(t) => update({ tab: t === 'sakramento' ? null : t, chart: null })} chart={params.get('chart')} onChart={(slug) => update({ tab: 'organisasyon', chart: slug })} jump={jump && verseIn} />

      <HistoryFeature />
    </main>
  );
}

const scrollTo = (id, behavior = 'smooth') => document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' });

/** "On this page": the Mass schedule, the sacraments, the org charts and the history (those that have something to show). */
function PageJumps({ onTab }) {
  const guides = listState(useSacramentGuides());
  const charts = listState(useOrgCharts());
  const history = useHistory();
  const btn = 'flex-none min-h-[40px] px-3 sm:px-3.5 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--p-blue-border)] bg-parish-card font-bold text-[14px] text-parish-blueDeep cursor-pointer appearance-none hover:bg-[var(--p-blue-tint)]';
  // On a phone the icons go, so all three fit across without scrolling.
  const icon = (name) => <Icon name={name} size={16} className="hidden sm:block" />;
  const open = (t) => { onTab(t); requestAnimationFrame(() => scrollTo('tudlo')); };
  return (
    <nav aria-label="Niini nga panid" className={`flex gap-2 overflow-x-auto ${NO_SCROLLBAR} -mx-3.5 px-3.5 mb-3.5 lg:mb-0 lg:mx-0 lg:px-0 lg:flex-wrap`}>
      <button type="button" className={btn} onClick={() => scrollTo('misa')}>{icon('clock')}<span className="lg:hidden">Misa ↓</span><span className="hidden lg:inline">Iskedyul sa Misa ↓</span></button>
      {guides.rows.length > 0 && <button type="button" className={btn} onClick={() => open('sakramento')}>{icon('church')}<span className="lg:hidden">Sakramento ↓</span><span className="hidden lg:inline">Mga Sakramento ↓</span></button>}
      {charts.rows.length > 0 && <button type="button" className={btn} onClick={() => open('organisasyon')}>{icon('people')}Organisasyon ↓</button>}
      {history.data?.main && <button type="button" className={btn} onClick={() => scrollTo('kasaysayan')}>{icon('cross')}Kasaysayan ↓</button>}
    </nav>
  );
}

/**
 * The sacrament guides and the org charts, as tabs on the light-blue band.
 * A tab with nothing published is left out, and the section with it when
 * neither has anything. `jump` scrolls down to it once it's there.
 */
function TeachingTabs({ tab, onTab, chart, onChart, jump }) {
  const guides = listState(useSacramentGuides());
  const charts = listState(useOrgCharts());
  const tabs = TEACH_TABS.filter(([k]) => (k === 'sakramento' ? guides.rows.length : charts.rows.length) > 0);
  const current = tabs.find(([k]) => k === tab) || tabs[0];
  const ready = !guides.loading && !charts.loading && tabs.length > 0;
  // Straight there on arrival: a smooth scroll stops short when the chart draws under it.
  useEffect(() => { if (jump && ready) scrollTo('tudlo', 'auto'); }, [jump, ready]);

  if (!ready) return null;
  return (
    <Band id="tudlo" aria-labelledby="tudlo-section-title" className="scroll-mt-16 lg:scroll-mt-[76px] border-t">
      <div className={`${WRAP} ${BAND_PAD}`}>
        <div className="lg:flex lg:items-end lg:justify-between lg:gap-6 lg:mb-[22px]">
          <div>
            <Eyebrow>Mga giya ug ang parokya</Eyebrow>
            {/* The switch names the part shown, so the heading names the section, not the part again. */}
            <h2 id="tudlo-section-title" className="m-0 mb-3 lg:mb-0 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">
              {tabs.length > 1 ? 'Sakramento ug Organisasyon' : current[1]}
            </h2>
          </div>
          {tabs.length > 1 && <Segmented label="Sakramento ug Organisasyon" options={tabs.map(([k, , short]) => [k, short])} value={current[0]} onChange={onTab} />}
        </div>
        {current[0] === 'sakramento' ? <SacramentGuides rows={guides.rows} /> : <Organisasyon slug={chart} onPick={onChart} />}
      </div>
    </Band>
  );
}

/**
 * Giunsa Kini Pagsugod: the way in to the History page, at the bottom of
 * this one. The main history article's photo and opening paragraph, and a
 * button to read the whole story. Only once the main article is published.
 */
function HistoryFeature() {
  const { data } = useHistory();
  const main = data?.main;
  if (!main) return null;
  const excerpt = openingParagraph(main.body);
  return (
    <section id="kasaysayan" aria-labelledby="kasaysayan-section-title" className="scroll-mt-16 lg:scroll-mt-[76px] py-8 lg:py-16">
      <div className={WRAP}>
        {/* The section's label above the card, over the main photo on the left. */}
        <Eyebrow className="mb-2.5 lg:mb-3.5">Kasaysayan sa Parokya</Eyebrow>
        <div className={`bg-parish-card border border-parish-border rounded-[20px] lg:rounded-[26px] shadow-card overflow-hidden ${main.photo_url ? 'lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]' : ''}`}>
          {main.photo_url && (
            <Link to={HISTORY_PAGE} tabIndex={-1} aria-hidden className="block bg-[#efe6d3]">
              <img src={main.photo_url} alt="" loading="lazy" className="w-full h-full aspect-[16/10] lg:aspect-auto lg:min-h-[460px] object-cover" />
            </Link>
          )}
          <div className="p-5 lg:p-12 flex flex-col justify-center">
            <h2 id="kasaysayan-section-title" className="m-0 mb-1.5 font-serif text-[32px] lg:text-[48px] font-bold text-parish-navy leading-[1.05]">Giunsa Kini Pagsugod</h2>
            <div className="font-serif italic text-[18px] lg:text-[21px] text-[var(--p-gold-deep)] mb-3.5 lg:mb-5">{main.title}</div>
            {excerpt && <p className="m-0 mb-5 lg:mb-7 text-[16px] lg:text-[17.5px] leading-[1.65] text-[#3f3b2f] whitespace-pre-line line-clamp-[8]">{excerpt}</p>}
            <BigButton to={HISTORY_PAGE} className="lg:w-auto lg:self-start lg:px-7">Basaha ang among kasaysayan →</BigButton>
          </div>
        </div>
      </div>
    </section>
  );
}

// The guides people ask about most come first; the rest follow the office's order.
const GUIDE_FIRST = ['baptism', 'wedding', 'ocia'];
const guideRank = (g) => (GUIDE_FIRST.includes(g.key) ? GUIDE_FIRST.indexOf(g.key) : GUIDE_FIRST.length + (g.sort || 0));
// Desktop columns for the sacrament cards, so a row of them fills the width.
const PICKER_COLS = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' };

/**
 * Mga Sakramento ug Pormasyon: a card per published guide to pick from,
 * then that sacrament's guide.
 */
function SacramentGuides({ rows }) {
  const guides = [...rows].sort((a, b) => guideRank(a) - guideRank(b) || a.id - b.id);
  const [key, setKey] = useState('');
  const g = guides.find((x) => x.key === key) || guides[0];
  return (
    <>
      <p className="m-0 mb-4 lg:mb-6 text-[15px] lg:text-[16.5px] leading-normal text-[#4d4636] lg:max-w-[760px]">
        Unsa ang dad-on ug unsa ang mga lakang sa matag sakramento. Palihug duol sa opisina sa parokya una sa tanan aron makumpirma.
      </p>
      {guides.length > 1 && (
        <div
          role="group" aria-label="Pili og sakramento"
          className={`grid grid-cols-2 gap-2.5 mb-4 sm:grid-cols-3 lg:gap-3.5 lg:mb-6 ${PICKER_COLS[guides.length] || 'lg:grid-cols-6'}`}
        >
          {guides.map((x) => <SacramentChoice key={x.key} g={x} on={x.key === g?.key} onPick={() => setKey(x.key)} />)}
        </div>
      )}
      {g && <GuideCard g={g} />}
    </>
  );
}

/** One sacrament to pick: its icon, short name and how many documents to bring. */
function SacramentChoice({ g, on, onPick }) {
  const docs = (g.requirements || []).filter(Boolean).length;
  return (
    <button
      type="button" aria-pressed={on} onClick={onPick}
      className={`text-left appearance-none cursor-pointer rounded-2xl border-[1.5px] p-3 lg:p-4 transition-colors ${on ? 'bg-parish-blue border-parish-blue text-white shadow-card' : 'bg-parish-card border-parish-border text-parish-navy hover:border-[var(--p-blue-border)]'}`}
    >
      <span
        className={`w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center mb-2 ${on ? 'bg-white/15 text-white' : 'text-parish-blue'}`}
        style={on ? undefined : { background: 'var(--p-blue-tint)' }}
      >
        <SacramentIcon sacrament={g.key} size={24} />
      </span>
      <span className="block font-serif font-bold text-[18px] lg:text-[21px] leading-tight">{guideShortTitle(g.title)}</span>
      {/* Always a second line, so the cards line up. */}
      <span className={`block mt-0.5 text-[12.5px] lg:text-[13px] ${on ? 'text-white/80' : 'text-parish-text2'}`}>{docs > 0 ? `${docs} ka dokumento` : 'Walay dokumento'}</span>
    </button>
  );
}

/**
 * One sacrament's guide. Phones: one column. Desktop: the steps and the
 * checklist of documents on the left, and a side box with the schedule,
 * donation, reminders and the office buttons on the right. With none of
 * those to show, there's no side box: the buttons go in a row underneath.
 */
// Guides the parish issues a certificate for (the certType in forms.js), and
// the ones people can ask to avail of from here (the request form's id).
const GUIDE_CERT = { baptism: 'baptism', confirmation: 'confirmation', wedding: 'matrimony' };
const GUIDE_AVAIL = { ocia: 'ocia', anointing: 'pagdihog' };
const BTN_MAIN = 'min-h-[44px] px-4 inline-flex items-center justify-center rounded-[10px] bg-parish-blue text-white font-bold text-[14.5px] hover:brightness-110';
const BTN_SECOND = 'min-h-[44px] px-4 inline-flex items-center justify-center rounded-[10px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[14.5px] hover:bg-[var(--p-blue-tint)]';

function GuideCard({ g }) {
  const steps = (g.steps || []).filter((s) => s.title || s.detail);
  const docs = (g.requirements || []).filter(Boolean);
  const extras = [['Iskedyul', g.schedule, 'clock'], ['Donasyon', g.fees, 'heart'], ['Pahinumdom', g.notes, 'alert']].filter(([, v]) => v);
  const side = extras.length > 0;
  return (
    <article className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden">
      <header className="flex gap-3 items-start px-4 py-3.5 lg:gap-4 lg:px-6 lg:py-5 bg-[#fbf7ef] border-b border-[#f0e8d6]">
        <span className="hidden sm:flex w-12 h-12 lg:w-14 lg:h-14 flex-none rounded-2xl items-center justify-center text-parish-blue" style={{ background: 'var(--p-blue-tint)' }}>
          <SacramentIcon sacrament={g.key} size={28} />
        </span>
        <div className="min-w-0">
          <h3 className="m-0 font-serif text-[24px] lg:text-[30px] font-bold text-parish-navy leading-tight">{g.title}</h3>
          {g.summary && <p className="m-0 mt-1.5 text-[15px] lg:text-[16px] leading-normal text-[#4d4636] lg:max-w-[820px]">{g.summary}</p>}
        </div>
      </header>
      <div className={side ? 'lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]' : ''}>
        <div className="flex flex-col gap-6 p-4 lg:p-6 lg:gap-8">
          {steps.length > 0 && (
            <section aria-labelledby={`steps-${g.key}`}>
              <h4 id={`steps-${g.key}`} className="m-0 mb-3 font-bold text-[13px] tracking-[.1em] uppercase text-[var(--p-gold-deep)]">Mga lakang</h4>
              <ol className="list-none m-0 p-0 flex flex-col">
                {steps.map((s, i) => (
                  // A line joins the numbers, so the steps read as a path.
                  <li key={i} className="relative flex gap-3 items-start pb-4 last:pb-0">
                    {i < steps.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-[var(--p-blue-border)]" aria-hidden />}
                    <span className="relative w-7 h-7 flex-none rounded-full bg-parish-blue text-white font-bold text-[13px] flex items-center justify-center" aria-hidden>{i + 1}</span>
                    <div className="min-w-0 pt-0.5">
                      <div className="font-semibold text-[15.5px] text-parish-navy leading-snug">{s.title}</div>
                      {s.detail && <div className="text-[14.5px] leading-snug text-parish-text2 mt-0.5">{s.detail}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {docs.length > 0 && (
            <section aria-labelledby={`docs-${g.key}`}>
              <h4 id={`docs-${g.key}`} className="m-0 mb-3 font-bold text-[13px] tracking-[.1em] uppercase text-[var(--p-gold-deep)]">Mga dokumento nga dad-on</h4>
              <ul className="list-none m-0 p-0 grid gap-2 sm:grid-cols-2">
                {docs.map((d, i) => (
                  <li key={i} className="flex gap-2.5 items-start text-[15px] leading-snug text-parish-ink">
                    <span className="w-5 h-5 mt-px flex-none rounded border-[1.5px] border-parish-borderSoft bg-parish-card" aria-hidden />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className={`flex flex-col gap-2.5 px-4 pb-4 ${side ? 'lg:p-6 lg:border-l lg:border-[#f0e8d6] lg:bg-[#fdfaf4]' : 'lg:px-6 lg:pb-6'}`}>
          {extras.map(([label, value, icon]) => (
            <div key={label} className="flex gap-2.5 items-start rounded-xl px-3.5 py-3 border border-[#eee3ce] bg-parish-bg">
              <Icon name={icon} size={18} className="text-[var(--p-gold-deep)] mt-px flex-none" />
              <div className="text-[14.5px] leading-normal text-[#3f3b2f]"><strong className="block text-parish-navy">{label}</strong>{value}</div>
            </div>
          ))}
          {/* Phones: one full-width button each. */}
          <div className={`flex flex-col gap-2.5 mt-1 sm:flex-row sm:flex-wrap ${side ? 'lg:flex-col' : ''}`}>
            {GUIDE_AVAIL[g.key] && <Link to={`/serbisyo/hangyo/${GUIDE_AVAIL[g.key]}`} className={BTN_MAIN}>Request to avail</Link>}
            <Link to="/kontak" className={GUIDE_AVAIL[g.key] ? BTN_SECOND : BTN_MAIN}>Pangutana sa opisina</Link>
            {GUIDE_CERT[g.key] && <Link to={`/serbisyo/hangyo/sertipiko?certType=${GUIDE_CERT[g.key]}`} className={BTN_SECOND}>Pangayo og sertipiko</Link>}
          </div>
        </aside>
      </div>
    </article>
  );
}

// Desktop columns by how many schedule sections there are, so they share the width evenly.
const SECTION_COLS = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-2 xl:grid-cols-3',
  4: 'lg:grid-cols-2 xl:grid-cols-4',
};

function MassSchedule() {
  const mass = listState(useMassSchedule());
  const ann = listState(useAnnouncements());
  const [location, setLocation] = useState('all');
  const locations = massLocations(mass.rows);
  // No language filter: there are few Masses, and each shows its language.
  const sections = massSections(mass.rows, { location, language: 'all' });
  // The newest "Schedule change" announcement is the special-schedule banner.
  const special = ann.rows.find((a) => a.category === 'Schedule change');

  return (
    <>
      {special && (
        <Link
          to={`/pahibalo/${special.id}`}
          className="flex gap-2.5 lg:gap-3 items-start lg:items-center rounded-[14px] px-3.5 py-3 lg:px-[18px] lg:py-3.5 mb-4 lg:mb-[22px] border"
          style={{ background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)' }}
        >
          <Icon name="star" className="text-[var(--p-gold-deep)] mt-px lg:mt-0 lg:w-[22px] lg:h-[22px]" />
          <div className="text-[14.5px] lg:text-[15.5px] leading-[1.45] text-[#3f3b2f]">
            <strong className="text-parish-navy">Espesyal nga iskedyul:</strong> {special.title}
          </div>
        </Link>
      )}

      {locations.length > 1 && (
        <div className="mb-[18px] lg:mb-[22px]">
          <label htmlFor="f-loc" className="block font-semibold text-[13px] lg:font-bold lg:text-[13.5px] mb-[5px] lg:mb-1.5">Lugar</label>
          <select
            id="f-loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full min-h-[48px] px-3.5 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-xl lg:w-[300px] lg:min-h-[46px] lg:text-[15.5px]"
          >
            <option value="all">Tanang simbahan ug kapilya</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      )}

      <DataState
        state={mass}
        skeleton={<><div className="lg:hidden"><Skeletons n={2} h={120} /></div><div className="hidden lg:grid grid-cols-4 gap-3.5 items-start">{[220, 160, 160, 200].map((h, i) => <Skeleton key={i} h={h} alt={i % 2 === 1} className="rounded-[18px]" />)}</div></>}
        errorText="Wala ma-load ang iskedyul. Susiha ang inyong koneksyon."
        empty={mass.empty}
        emptyText="Wala pay iskedyul nga gi-publish. Tawagi ang opisina para sa oras sa Misa."
      >
        {!sections.length ? <EmptyNote>Walay Misa nga mohaum sa imong pili.</EmptyNote> : (
          <div className={`flex flex-col gap-3.5 lg:grid lg:items-stretch ${SECTION_COLS[Math.min(sections.length, 4)]}`}>
            {sections.map((s) => (
              <section key={s.key} className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden">
                <div className="flex items-center gap-2 flex-wrap px-3.5 py-2.5 lg:px-4 lg:py-3 bg-[#fbf7ef] lg:border-b lg:border-[#f0e8d6]">
                  <h3 className="m-0 font-serif text-[21px] lg:text-[23px] font-bold text-parish-navy">{s.title}</h3>
                  {s.today && <MassTag tone="blue">Karong adlawa</MassTag>}
                </div>
                {s.key === 'sunday' && s.rows.map((m) => <MassRow key={m.id} m={m} heading={m.location} />)}
                {s.key === 'daily' && s.rows.map((m) => <MassRow key={m.id} m={m} heading={m.when} />)}
                {s.key === 'other' && s.rows.map((m) => <MassRow key={m.id} m={m} when={m.when} />)}
                {s.key === 'special' && s.blocks.map((b) => (
                  <div key={b.key} className="border-t border-[#f4eddd] first:border-t-0">
                    <div className="px-3.5 pt-3 lg:px-4">
                      <div className="font-serif text-[18px] lg:text-[19px] font-bold text-parish-navy leading-tight">{b.occasion}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="font-semibold text-[13.5px] text-parish-text2">{b.when}</span>
                        {b.obligation && <MassTag tone="gold">Adlaw nga Obligasyon</MassTag>}
                        {b.today && <MassTag tone="blue">Karon</MassTag>}
                      </div>
                    </div>
                    {b.rows.map((m) => <MassRow key={m.id} m={m} heading={m.location} />)}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}

/** Small label beside a schedule heading: "Karong adlawa", "Adlaw nga Obligasyon". */
function MassTag({ tone, children }) {
  const style = tone === 'gold'
    ? { background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)', color: 'var(--p-gold-deep)' }
    : { background: 'var(--p-blue-tint)', borderColor: 'var(--p-blue-border)' };
  return (
    <span className={`font-bold text-[11px] tracking-[.08em] uppercase border rounded-md px-[7px] py-0.5 ${tone === 'gold' ? '' : 'text-parish-blueDeep'}`} style={style}>
      {children}
    </span>
  );
}
