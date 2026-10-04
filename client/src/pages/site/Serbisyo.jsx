import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, Card, ErrorNote, Eyebrow, INNER, MessengerButton, PageTitle, Skeletons, WRAP } from '../../components/site/kit.jsx';
import { mapEmbedUrl, messengerLink, validCoords } from '../../lib/website.js';
import { phoneHref } from '../../lib/requests.js';
import { officeHourRows, officeStatus } from '../../lib/site.js';
import { PARISH_ADDRESS, PARISH_COORDS, PARISH_MAP_URL, useSiteTitle } from './SiteLayout.jsx';
import { useOffice } from './data.js';
import { api } from '../../api.js';
import { usePublicData } from '../../components/site/usePublicData.js';
import { StatusCheckCard } from './CheckStatus.jsx';

function ServiceLink({ to, icon, title, sub, red = false }) {
  return (
    <Link
      to={to}
      className={`w-full text-left flex gap-3.5 items-center bg-parish-card border border-parish-border rounded-2xl p-3.5 shadow-cardSm lg:flex-col lg:items-start lg:p-[22px] lg:rounded-[20px] ${red ? 'hover:border-parish-errorBorder' : 'hover:border-[var(--p-blue-border)]'}`}
    >
      <div
        className="w-[46px] h-[46px] lg:w-[52px] lg:h-[52px] flex-none rounded-[14px] lg:rounded-2xl flex items-center justify-center"
        style={red ? { background: '#fbeeea', color: '#a13d29' } : { background: 'var(--p-blue-tint)', color: 'var(--p-blue)' }}
      >
        <Icon name={icon} size={23} className="lg:w-[26px] lg:h-[26px]" />
      </div>
      <div className="flex-1">
        <div className="font-bold text-[16.5px] lg:font-serif lg:text-[25px] lg:text-parish-navy">{title}</div>
        <div className="text-[14px] lg:text-[15px] text-parish-text2 lg:mt-0.5">{sub}</div>
      </div>
      <Icon name="chev" size={18} className="text-parish-muted lg:hidden" />
    </Link>
  );
}

/**
 * Mga Serbisyo: the title and the status check on the light-blue band, like
 * the other main pages' first section; then the request forms, blood donor
 * call and contact on the plain page.
 */
export default function Serbisyo() {
  return (
    <main className="animate-fadeUp">
      <Band aria-label="Unsaon namo pagtabang?">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <Eyebrow>Mga Serbisyo</Eyebrow>
          <PageTitle className="mb-1.5">Unsaon namo pagtabang?</PageTitle>
          <p className="m-0 mb-4 lg:mb-[26px] text-[15px] lg:text-[17px] leading-normal text-[#4d4636]">Ang matag hangyo moadto direkta sa kawani sa parokya.</p>
          <StatusCheckCard />
        </div>
      </Band>
      <section aria-labelledby="ubang-serbisyo" className={`${WRAP} py-7 lg:py-12`}>
        <h2 id="ubang-serbisyo" className="m-0 mb-3 lg:mb-4 font-serif text-[24px] lg:text-[30px] font-bold text-parish-navy">Ubang mga serbisyo</h2>
        <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 xl:grid-cols-4 lg:gap-4">
          <ServiceLink to="/serbisyo/hangyo/sertipiko" icon="doc" title="Pangayo og sertipiko" sub="Bunyag, Kumpil, Kasal" />
          <ServiceLink to="/serbisyo/hangyo/pagdihog" icon="cal" title="Pangayo ug Dihog Iskedyul" sub="Pagbisita sa pari aron dihogan ang masakiton" />
          <ServiceLink to="/serbisyo/dugo" icon="drop" title="Blood donor call" sub="Nanginahanglan o mo-donate" red />
          <ServiceLink to="/kontak" icon="phone" title="Kontak ug oras sa opisina" sub="Tawag, text, mapa" />
        </div>
      </section>
    </main>
  );
}

export function Kontak() {
  useSiteTitle('Kontak');
  const q = useOffice();
  const o = q.data || {};
  const rows = officeHourRows(o.office_hours);
  const status = officeStatus(o.office_hours);
  const open = status ? status.open : null;
  const mobile = o.mobile || o.contact;
  const messenger = messengerLink(o.secretary_messenger);
  // A link saved in admin wins; otherwise the church's Google Maps page.
  const mapUrl = o.map_url || PARISH_MAP_URL;
  // The pin saved in admin wins; otherwise the church's own coordinates.
  const pin = validCoords(o.latitude, o.longitude) ? o : PARISH_COORDS;
  // The route to the church in Google Maps; Waze for drivers who prefer it.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`;
  const wazeUrl = `https://waze.com/ul?ll=${pin.latitude},${pin.longitude}&navigate=yes`;

  if (q.loading) return <main className={`${INNER} lg:max-w-[1240px]`}><Skeletons n={3} h={120} /></main>;

  // Phones: one column, sick call first. Desktop: hours and sick call | contact, then the map on its own row.
  return (
    <main className={`${INNER} lg:max-w-[1240px]`}>
      <PageTitle className="mb-3.5 lg:mb-[22px]">Opisina sa parokya</PageTitle>
      {q.error && <div className="mb-4"><ErrorNote onRetry={q.reload}>Wala ma-load ang mga detalye sa opisina.</ErrorNote></div>}

      <div className="lg:grid lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:gap-x-5 lg:gap-y-4 lg:items-start">
      {o.sick_call_contact && (
        <div className="rounded-2xl p-4 mb-4 text-white bg-parish-navy lg:col-start-1 lg:row-start-2 lg:mb-0 lg:rounded-[18px] lg:p-[18px]">
          <div className="font-bold text-[11.5px] tracking-[.16em] uppercase mb-1" style={{ color: 'var(--p-gold-light)' }}>Sick call · Pagdihog sa masakiton</div>
          <div className="text-[14.5px] leading-[1.45] text-white/90 mb-3">Para sa emergency.</div>
          <a href={`tel:${phoneHref(o.sick_call_contact)}`} className="w-full min-h-[52px] rounded-xl bg-white text-parish-navy font-bold text-[17px] flex items-center justify-center gap-2">
            <Icon name="phone" size={19} />{o.sick_call_contact}
          </a>
        </div>
      )}

      <Card className="p-3.5 mb-4 shadow-none lg:col-start-1 lg:row-start-1 lg:mb-0 lg:p-[18px] lg:rounded-[18px]">
        <h2 className="m-0 mb-2.5 font-serif text-[22px] lg:text-[24px] font-bold text-parish-navy">Oras sa opisina</h2>
        {status && (
          <div
            role="status"
            className={`flex items-center gap-2.5 mb-3 rounded-xl px-3.5 py-3 font-bold text-[16px] lg:text-[17px] border ${open ? 'text-parish-ok bg-parish-okBg border-parish-okBorder' : 'text-[#4d4636] bg-[#f1ead9] border-parish-borderSoft'}`}
          >
            <span className={`w-3 h-3 flex-none rounded-full ${open ? 'bg-parish-ok' : 'bg-[#8a836f]'}`} aria-hidden />{status.text}
          </div>
        )}
        {!rows.length ? (
          <div className="text-[15px] text-parish-text2">Tawagi ang opisina para sa oras.</div>
        ) : rows.map((r) => (
          <div
            key={r.label}
            className={`flex justify-between gap-2.5 py-[9px] text-[15px] ${r.today ? 'px-2 -mx-2 rounded-lg border-l-4' : 'border-t border-[#f4eddd]'}`}
            style={r.today ? { background: 'var(--p-blue-tint)', borderLeftColor: 'var(--p-blue)' } : undefined}
          >
            <span className={r.today ? 'font-bold' : ''}>{r.label}{r.today ? ' · karon' : ''}</span>
            <span className={`text-right ${r.hours ? '' : 'text-parish-text2'}`}>
              {r.hours ? r.hours.map((h) => <span key={h} className="block">{h}</span>) : 'Sirado'}
            </span>
          </div>
        ))}
      </Card>

      {(
      <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:bg-parish-card lg:border lg:border-parish-border lg:rounded-[18px] lg:p-[18px]">
      <h2 className="hidden lg:block m-0 mb-3 font-serif text-[24px] font-bold text-parish-navy">Kontaka kami</h2>
      {mobile && (
        <>
          <div className="text-[12px] font-bold tracking-[.14em] uppercase text-[var(--p-eyebrow)]">Opisina sa parokya · tawag o text</div>
          <div className="font-serif text-[28px] lg:text-[30px] font-bold text-parish-blue leading-tight mb-3">{mobile}</div>
        </>
      )}
      {/* The three things people come here for, equal: call, message, find the church. */}
      <div className="grid gap-2 mb-2.5 lg:mb-3.5 sm:grid-cols-3">
        {mobile && <a href={`tel:${phoneHref(mobile)}`} className="min-h-[56px] rounded-xl bg-parish-blue text-white font-bold text-[16px] flex items-center justify-center gap-2"><Icon name="phone" size={19} />Tawag</a>}
        {messenger && <MessengerButton href={messenger} className="!min-h-[56px]" />}
        <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="min-h-[56px] rounded-xl border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[16px] flex items-center justify-center gap-2"><Icon name="pin" size={19} />Mga direksyon</a>
      </div>

      {(mobile || o.facebook_url || o.email) && (
        <div className="bg-parish-card border border-parish-border rounded-2xl overflow-hidden mb-4 lg:mb-0 lg:rounded-none lg:border-x-0 lg:border-b-0 lg:border-[#f0e8d6] lg:pt-1.5">
          {mobile && (
            <a href={`sms:${phoneHref(mobile)}`} className="w-full min-h-[52px] flex items-center gap-3 px-3.5 font-semibold text-[15px] border-b border-[#f0e8d6]">
              <Icon name="sms" className="text-parish-blue" /><span className="flex-1">Mag-text</span><Icon name="chev" size={16} className="text-parish-muted" />
            </a>
          )}
          {o.facebook_url && (
            <a href={o.facebook_url} target="_blank" rel="noopener noreferrer" className="w-full min-h-[52px] flex items-center gap-3 px-3.5 font-semibold text-[15px] border-b border-[#f0e8d6] last:border-b-0">
              <Icon name="fb" className="text-parish-blue" /><span className="flex-1">Facebook page</span><Icon name="chev" size={16} className="text-parish-muted" />
            </a>
          )}
          {o.email && (
            <a href={`mailto:${o.email}`} className="w-full min-h-[52px] flex items-center gap-3 px-3.5 font-semibold text-[15px]">
              <Icon name="mail" className="text-parish-blue" /><span className="flex-1 break-all">{o.email}</span>
            </a>
          )}
        </div>
      )}

      </div>
      )}

      </div>

      <section className="mt-4 lg:mt-5 border border-parish-border rounded-2xl overflow-hidden bg-parish-card lg:rounded-[18px] lg:grid lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <iframe
          title="Mapa sa simbahan"
          src={mapEmbedUrl(pin.latitude, pin.longitude)}
          className="block w-full h-[260px] lg:h-[380px] border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        <div className="px-3.5 py-3 lg:px-[22px] lg:py-5">
          <h2 className="m-0 mb-1.5 font-serif text-[22px] lg:text-[24px] font-bold text-parish-navy">Asa mi makit-an</h2>
          <div className="font-bold text-[15.5px] lg:text-[16.5px]">{o.address || PARISH_ADDRESS}</div>
          {o.directions && <div className="text-[14px] lg:text-[15px] leading-[1.45] text-[#4d4636] mt-[3px] whitespace-pre-line">{o.directions}</div>}
          <div className="flex gap-x-4 gap-y-1 flex-wrap mt-2.5 font-bold text-[14.5px] lg:text-[15px] text-parish-blue">
            <a href={mapUrl} target="_blank" rel="noopener noreferrer">Ablihi sa Google Maps →</a>
            <a href={wazeUrl} target="_blank" rel="noopener noreferrer">Waze →</a>
          </div>
        </div>
      </section>
    </main>
  );
}

export function Blood() {
  useSiteTitle('Blood Donor Call');
  const calls = useBloodCalls();
  return (
    <main className={`${INNER} lg:max-w-[1000px]`}>
      {calls.map((c, i) => (
        <div key={i} className="flex gap-2.5 lg:gap-3 items-start lg:items-center bg-parish-errorBg border border-parish-errorBorder rounded-[14px] px-3.5 py-3 lg:px-[18px] lg:py-3.5 mb-[18px] lg:mb-6 text-parish-error">
          <Icon name="drop" className="mt-px lg:mt-0 lg:w-[22px] lg:h-[22px]" />
          <div className="text-[14.5px] lg:text-[15.5px] leading-[1.45]"><strong>Urgent nga panawagan:</strong> {c.blood_type} · {c.hospital}{c.units > 1 ? ` · ${c.units} ka bag` : ''}</div>
        </div>
      ))}
      <h1 className="font-serif font-semibold text-[32px] lg:text-[46px] leading-[1.08] m-0 mb-2 text-parish-navy">Panawagan sa dugo</h1>
      <p className="m-0 mb-[18px] lg:mb-[26px] text-[16px] lg:text-[17.5px] leading-[1.55] text-[#3f3b2f] lg:max-w-[720px]">
        Ang among kawani ang mokontak sa mga donor nga mohaum, sa pribado. Walay lista sa donor, ngalan o ihap sa blood type nga ipakita sa publiko.
      </p>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-[18px]">
        <Link to="/serbisyo/hangyo/dugo" className="w-full text-left bg-parish-card border-[1.5px] border-parish-errorBorder rounded-[18px] px-4 py-[18px] lg:rounded-[22px] lg:px-[26px] lg:py-7 shadow-card">
          <div className="font-serif text-[24px] lg:text-[32px] font-bold text-parish-error mb-1 lg:mb-1.5">Nanginahanglan og dugo</div>
          <div className="text-[15px] lg:text-[16px] leading-[1.45] lg:leading-normal text-[#4d4636]">Para sa pasyente nga nanginahanglan karon.</div>
        </Link>
        <Link to="/serbisyo/hangyo/donor" className="w-full text-left bg-parish-card border-[1.5px] border-[var(--p-blue-border)] rounded-[18px] px-4 py-[18px] lg:rounded-[22px] lg:px-[26px] lg:py-7 shadow-card">
          <div className="font-serif text-[24px] lg:text-[32px] font-bold text-parish-blueDeep mb-1 lg:mb-1.5">Gusto ko mo-donate</div>
          <div className="text-[15px] lg:text-[16px] leading-[1.45] lg:leading-normal text-[#4d4636]">Ipalista ang imong kaugalingon. Kontakon ka lang kung adunay mohaum.</div>
        </Link>
      </div>
    </main>
  );
}

function useBloodCalls() {
  return usePublicData('bloodCalls', () => api.publicBloodCalls().catch(() => [])).data || [];
}
