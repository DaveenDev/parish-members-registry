import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { Card, ErrorNote, SectionHead, Skeletons, Skeleton } from '../../components/site/kit.jsx';
import { AnnouncementCard, EventRow, MassRow } from '../../components/site/cards.jsx';
import CreditFooter from '../../components/CreditFooter.jsx';
import { fmtDayMonth, upcomingToday } from '../../lib/site.js';
import { todayIso } from '../../lib/website.js';
import { ParishMark, PARISH_NAME, PARISH_SUB, SiteFooter, useParishLogo } from './SiteLayout.jsx';
import { listState, useAnnouncements, useEvents, useMassSchedule, useOffice, usePortalStatus } from './data.js';

const DISMISSED_KEY = 'pmr_dismissed_urgent';

function readDismissed() {
  try { return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]'); } catch { return []; }
}

export default function Home() {
  const mass = listState(useMassSchedule());
  const ann = listState(useAnnouncements());
  const events = listState(useEvents());
  const portal = usePortalStatus().data;
  const office = useOffice().data;
  const logo = useParishLogo();
  const [dismissed, setDismissed] = useState(readDismissed);

  const urgent = ann.rows.find((a) => a.urgent && !dismissed.includes(a.id));
  const latest = ann.rows.filter((a) => !a.urgent).slice(0, 2);
  const now = new Date();
  const todays = upcomingToday(mass.rows, now);
  const anyToday = mass.rows.some((r) => r.day_of_week === now.getDay());

  function dismiss() {
    const next = [...dismissed, urgent.id];
    setDismissed(next);
    try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next)); } catch {}
  }

  return (
    <main className="pb-7 animate-fadeUp">
      {urgent && (
        <div role="alert" className="mx-3.5 mt-3 flex gap-1.5 items-start bg-parish-errorBg border border-parish-errorBorder rounded-[14px] py-2.5 pl-3 pr-1 text-parish-error">
          <Icon name="alert" className="mt-[3px]" />
          <Link to={`/pahibalo/${urgent.id}`} className="flex-1 py-0.5 font-semibold text-[15px] leading-[1.35]">
            <span className="block font-bold text-[11px] tracking-[.14em] uppercase mb-0.5">Urgent</span>
            {urgent.title}
          </Link>
          <button type="button" aria-label="Isira ang pahibalo" onClick={dismiss} className="w-11 h-11 flex-none flex items-center justify-center -mt-1.5">
            <Icon name="x" size={18} />
          </button>
        </div>
      )}

      <section className="text-center px-[22px] pt-[30px] pb-7" style={{ background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' }}>
        <div className="flex justify-center"><ParishMark size={64} logo={logo} /></div>
        <div className="font-bold text-[11.5px] tracking-[.2em] uppercase text-[var(--p-eyebrow)] mt-1.5 mb-2.5">Rehistro sa mga Miyembro sa Parokya</div>
        <h1 className="font-serif font-semibold text-[38px] leading-[1.02] m-0 mb-1 text-parish-navy">{PARISH_NAME}</h1>
        <div className="font-serif text-[20px] text-parish-blue tracking-[.04em] mb-4">{PARISH_SUB}</div>
        <p className="text-[16px] leading-relaxed text-[#4d4636] m-0 mb-[22px]">
          Maayong pag-abot! Irehistro ang inyong pamilya sa parokya aron kita magpabiling magkasinabot, magkauban sa pagsaulog sa mga sakramento, ug mag-alagaray sa usag usa diha sa pagtuo.
        </p>
        <Link
          to="/register"
          className="w-full min-h-[56px] flex items-center justify-center font-bold text-[17px] text-white bg-parish-blue rounded-[14px]"
          style={{ boxShadow: '0 14px 30px -12px color-mix(in srgb, var(--p-blue) 65%, transparent)' }}
        >
          Irehistro ang Inyong Pamilya
        </Link>
        {portal?.open && (
          <Link to="/census" className="w-full min-h-[50px] mt-2.5 flex items-center justify-center font-semibold text-[15.5px] text-parish-blueDeep bg-parish-card border-[1.5px] border-[var(--p-blue-border)] rounded-[14px]">
            Narehistro na? I-update ang inyong rekord
          </Link>
        )}
        <div className="mt-4 flex justify-center gap-[7px] text-[13.5px] leading-snug text-parish-text2">
          <Icon name="lock" size={15} className="mt-0.5" />
          <span>Pribado ang inyong impormasyon. Ang kawani lang sa parokya ang makakita.</span>
        </div>
      </section>

      <section className="px-3.5 pt-[22px]">
        <Card className="p-4 shadow-card">
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <h2 className="font-serif font-semibold text-[23px] m-0 text-parish-navy">Misa karong adlawa</h2>
            <span className="font-semibold text-[13px] text-parish-text2">{fmtDayMonth(todayIso())}</span>
          </div>
          {mass.loading ? <Skeletons n={2} h={52} /> : mass.error ? (
            <ErrorNote onRetry={mass.reload}>Wala ma-load ang iskedyul.</ErrorNote>
          ) : !todays.length ? (
            <p className="mt-1 text-parish-text2 text-[15px]">
              {anyToday ? 'Nahuman na ang mga Misa karong adlawa.' : 'Walay Misa nga naka-iskedyul karong adlawa.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {todays.map((m) => <MassRow key={m.id} m={m} compact />)}
            </div>
          )}
          <Link to="/misa" className="min-h-[44px] mt-1.5 px-0.5 inline-flex items-center gap-1 font-bold text-[15px] text-parish-blue">
            Tibuok iskedyul sa semana<Icon name="chev" size={16} />
          </Link>
        </Card>
      </section>

      <section className="px-3.5 pt-7">
        <SectionHead title="Bag-ong pahibalo" to="/pahibalo" action="Tanan" />
        {ann.loading ? <Skeletons n={2} h={104} /> : ann.error ? (
          <p className="m-0 text-parish-error text-[15px]">Wala ma-load ang mga pahibalo.</p>
        ) : !latest.length ? (
          <p className="m-0 text-parish-text2 text-[15px]">Wala pay pahibalo karong semanaha.</p>
        ) : (
          <div className="flex flex-col gap-2.5">{latest.map((a) => <AnnouncementCard key={a.id} a={a} />)}</div>
        )}
      </section>

      <section className="px-3.5 pt-7">
        <SectionHead title="Umaabot nga kalihokan" to="/misa?view=kalendaryo" action="Kalendaryo" />
        {events.loading ? <Skeleton h={150} /> : events.error ? (
          <p className="m-0 text-parish-error text-[15px]">Wala ma-load ang kalendaryo.</p>
        ) : events.empty ? (
          <p className="m-0 text-parish-text2 text-[15px]">Walay kalihokan nga naka-iskedyul.</p>
        ) : (
          <div className="bg-parish-card border border-parish-border rounded-2xl overflow-hidden">
            {events.rows.slice(0, 3).map((e) => <EventRow key={e.id} e={e} />)}
          </div>
        )}
      </section>

      <section className="px-3.5 pt-7">
        <h2 className="font-serif font-semibold text-[25px] m-0 mb-2.5 text-parish-navy">Unsa ang imong kinahanglan?</h2>
        <div className="grid grid-cols-2 gap-2.5">
          <QuickLink to="/serbisyo/susiha" icon="search">Susiha ang akong rehistro</QuickLink>
          <QuickLink to="/serbisyo/hangyo/sertipiko" icon="doc">Pangayo og sertipiko</QuickLink>
          <QuickLink to="/komunidad" icon="people">Pangitaa ang akong GKK</QuickLink>
          <QuickLink to="/kontak" icon="phone">Kontak ug oras sa opisina</QuickLink>
        </div>
      </section>

      <SiteFooter address={office?.address} />
      <CreditFooter inline />
    </main>
  );
}

function QuickLink({ to, icon, children }) {
  return (
    <Link to={to} className="min-h-[88px] bg-parish-card border border-parish-border rounded-2xl p-3 flex flex-col gap-2 text-parish-blue">
      <Icon name={icon} size={24} />
      <span className="font-semibold text-[14.5px] leading-[1.25] text-parish-ink">{children}</span>
    </Link>
  );
}
