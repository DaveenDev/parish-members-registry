import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { Card, ErrorNote, Eyebrow, INNER, PAGE, PageTitle, Skeletons } from '../../components/site/kit.jsx';
import { phoneHref } from '../../lib/requests.js';
import { officeHourRows, officeOpenNow } from '../../lib/site.js';
import { PARISH_ADDRESS, useSiteTitle } from './SiteLayout.jsx';
import { useOffice } from './data.js';
import { api } from '../../api.js';
import { usePublicData } from '../../components/site/usePublicData.js';

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

/** Mga Serbisyo: status check, request forms, blood donor call, contact. */
export default function Serbisyo() {
  return (
    <main className={PAGE}>
      <Eyebrow>Mga Serbisyo</Eyebrow>
      <PageTitle className="mb-1.5">Unsaon namo pagtabang?</PageTitle>
      <p className="m-0 mb-4 lg:mb-[26px] text-[15px] lg:text-[17px] leading-normal text-[#4d4636]">Ang matag hangyo moadto direkta sa kawani sa parokya.</p>
      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-3 lg:gap-4">
        <ServiceLink to="/serbisyo/susiha" icon="search" title="Susiha ang akong rehistro" sub="Gamit ang reference number" />
        <ServiceLink to="/serbisyo/hangyo/sertipiko" icon="doc" title="Pangayo og sertipiko" sub="Bunyag, Kumpil, Kasal" />
        <ServiceLink to="/serbisyo/hangyo/pag-ampo" icon="heart" title="Pangayo og pag-ampo" sub="Pribado, para sa kura paroko" />
        <ServiceLink to="/serbisyo/dugo" icon="drop" title="Blood donor call" sub="Nanginahanglan o mo-donate" red />
        <ServiceLink to="/kontak" icon="phone" title="Kontak ug oras sa opisina" sub="Tawag, text, mapa" />
      </div>
    </main>
  );
}

export function Kontak() {
  useSiteTitle('Kontak');
  const q = useOffice();
  const o = q.data || {};
  const rows = officeHourRows(o.office_hours);
  const open = officeOpenNow(o.office_hours);
  const mobile = o.mobile || o.contact;
  const mapUrl = o.map_url
    || (o.latitude != null && o.longitude != null ? `https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}` : '')
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address || PARISH_ADDRESS)}`;

  if (q.loading) return <main className={`${INNER} lg:max-w-[1240px]`}><Skeletons n={3} h={120} /></main>;

  // Phones: one column, sick call first. Desktop: hours and sick call | contact | map.
  return (
    <main className={`${INNER} lg:max-w-[1240px]`}>
      <PageTitle className="mb-3.5 lg:mb-[22px]">Opisina sa parokya</PageTitle>
      {q.error && <div className="mb-4"><ErrorNote onRetry={q.reload}>Wala ma-load ang mga detalye sa opisina.</ErrorNote></div>}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] lg:grid-rows-[auto_1fr] lg:gap-x-5 lg:gap-y-4 lg:items-start">
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
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="m-0 font-serif text-[22px] lg:text-[24px] font-bold text-parish-navy">Oras sa opisina</h2>
          {open != null && (
            <span className={`inline-flex items-center gap-1.5 font-bold text-[13px] rounded-full px-2.5 py-1 border ${open ? 'text-parish-ok bg-parish-okBg border-parish-okBorder' : 'text-[#4d4636] bg-[#f1ead9] border-parish-borderSoft'}`}>
              <span className={`w-2 h-2 rounded-full ${open ? 'bg-parish-ok' : 'bg-[#8a836f]'}`} />{open ? 'Abli karon' : 'Sirado karon'}
            </span>
          )}
        </div>
        {!rows.length ? (
          <div className="text-[15px] text-parish-text2">Tawagi ang opisina para sa oras.</div>
        ) : rows.map((r) => (
          <div
            key={r.label}
            className={`flex justify-between gap-2.5 py-[9px] text-[15px] ${r.today ? 'px-2 -mx-2 rounded-lg' : 'border-t border-[#f4eddd]'}`}
            style={r.today ? { background: 'var(--p-blue-tint)' } : undefined}
          >
            <span className={r.today ? 'font-bold' : ''}>{r.label}</span>
            <span className={`text-right ${r.hours ? '' : 'text-parish-text2'}`}>
              {r.hours ? r.hours.map((h) => <span key={h} className="block">{h}</span>) : 'Sirado'}
            </span>
          </div>
        ))}
      </Card>

      {(mobile || o.facebook_url || o.email) && (
      <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:bg-parish-card lg:border lg:border-parish-border lg:rounded-[18px] lg:p-[18px]">
      <h2 className="hidden lg:block m-0 mb-3 font-serif text-[24px] font-bold text-parish-navy">Kontaka kami</h2>
      {mobile && (
        <>
          <div className="hidden lg:block font-serif text-[30px] font-bold text-parish-blue">{mobile}</div>
          <div className="hidden lg:block text-[13px] text-parish-text2 mb-3">Tawag o text</div>
          <div className="grid grid-cols-2 gap-2 mb-2 lg:mb-3.5">
            <a href={`tel:${phoneHref(mobile)}`} className="min-h-[52px] rounded-xl bg-parish-blue text-white font-bold text-[16px] flex items-center justify-center gap-2"><Icon name="phone" size={19} />Tawag</a>
            <a href={`sms:${phoneHref(mobile)}`} className="min-h-[52px] rounded-xl border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[16px] flex items-center justify-center gap-2"><Icon name="sms" size={19} />Text</a>
          </div>
          <div className="text-[14px] text-[#4d4636] text-center mb-3 lg:hidden">{mobile}</div>
        </>
      )}

      {(o.facebook_url || o.email) && (
        <div className="bg-parish-card border border-parish-border rounded-2xl overflow-hidden mb-4 lg:mb-0 lg:rounded-none lg:border-x-0 lg:border-b-0 lg:border-[#f0e8d6] lg:pt-1.5">
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

      <a href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label="Ablihi sa Google Maps" className="block border border-parish-border rounded-2xl overflow-hidden bg-parish-card lg:col-start-3 lg:row-start-1 lg:row-span-2 lg:rounded-[18px] hover:border-[var(--p-blue-border)]">
        <div className="h-[110px] lg:h-[260px] flex items-center justify-center text-parish-blue" style={{ background: 'var(--p-blue-tint)' }}>
          <Icon name="pin" size={44} className="lg:w-16 lg:h-16" />
        </div>
        <div className="px-3.5 py-3 lg:px-[18px] lg:py-4">
          <div className="font-bold text-[15.5px] lg:text-[16.5px]">{o.address || PARISH_ADDRESS}</div>
          {o.directions && <div className="text-[14px] lg:text-[15px] leading-[1.45] text-[#4d4636] mt-[3px] whitespace-pre-line">{o.directions}</div>}
          <div className="font-bold text-[14.5px] lg:text-[15px] text-parish-blue mt-2">Ablihi sa Google Maps →</div>
        </div>
      </a>
      </div>
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
