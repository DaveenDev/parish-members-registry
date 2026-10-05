import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, Card, ErrorNote, Eyebrow, INNER, MessengerButton, PageTitle, Skeletons, WRAP } from '../../components/site/kit.jsx';
import { isPhoneNumber, mapEmbedUrl, messengerLink, validCoords } from '../../lib/website.js';
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

/** One way to reach the office: icon tile, small label, value; a link when `href` is set. */
function ContactRow({ href, icon, label, children, external = false }) {
  const body = (
    <>
      <span className="w-10 h-10 flex-none rounded-xl flex items-center justify-center bg-[var(--p-blue-tint)] text-parish-blue">
        <Icon name={icon} size={19} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[12.5px] font-semibold text-parish-text2">{label}</span>
        <span className="block font-semibold text-[15.5px] text-parish-ink break-words">{children}</span>
      </span>
      {href && <Icon name="chev" size={16} className="text-parish-muted" />}
    </>
  );
  const cls = 'flex items-center gap-3 py-3 border-t border-[#f0e8d6] first:border-t-0';
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <a href={href} className={`${cls} rounded-lg -mx-2 px-2 hover:bg-[var(--p-blue-tint)]`} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {body}
    </a>
  );
}

const ACTION = 'min-h-[54px] rounded-xl font-bold text-[16px] flex items-center justify-center gap-2 px-5';

/**
 * Kontak: the office's status and the three things people come for (call,
 * Messenger, directions) on the light-blue band, like the other main pages;
 * then the hours, every way to reach the office, and the map.
 */
export function Kontak() {
  useSiteTitle('Kontak');
  const q = useOffice();
  const o = q.data || {};
  const rows = officeHourRows(o.office_hours);
  const status = officeStatus(o.office_hours);
  const open = status ? status.open : null;
  // Only a value with a number in it gets Tawag / Mag-text; a name typed in a
  // phone field in admin is shown as plain text instead.
  const mobile = [o.mobile, o.contact].find(isPhoneNumber) || '';
  const contactNote = o.contact && !isPhoneNumber(o.contact) ? o.contact : '';
  const sickCall = isPhoneNumber(o.sick_call_contact) ? o.sick_call_contact : '';
  const messenger = messengerLink(o.secretary_messenger);
  // A link saved in admin wins; otherwise the church's Google Maps page.
  const mapUrl = o.map_url || PARISH_MAP_URL;
  // The pin saved in admin wins; otherwise the church's own coordinates.
  const pin = validCoords(o.latitude, o.longitude) ? o : PARISH_COORDS;
  // The route to the church in Google Maps; Waze for drivers who prefer it.
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`;
  const wazeUrl = `https://waze.com/ul?ll=${pin.latitude},${pin.longitude}&navigate=yes`;

  if (q.loading) return <main className={`${INNER} lg:max-w-[1240px]`}><Skeletons n={3} h={120} /></main>;

  const hasContacts = mobile || messenger || o.email || o.facebook_url || contactNote;
  // Phones: the band (status, call / Messenger / directions, sick call), then
  // hours, contacts and the map. Desktop: the sick call beside the band's
  // title; hours | contacts; the map on its own row.
  return (
    <main className="animate-fadeUp">
      <Band aria-label="Opisina sa parokya">
        <div className={`${WRAP} ${BAND_PAD} lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-10 lg:items-center`}>
          <div>
            <Eyebrow>Kontak</Eyebrow>
            <PageTitle className="mb-1.5">Opisina sa parokya</PageTitle>
            <p className="m-0 mb-4 text-[15px] lg:text-[17px] leading-normal text-[#4d4636]">Tawag, text o mensahe, o bisitaha kami sa opisina.</p>
            {status && (
              <div
                role="status"
                className={`inline-flex items-center gap-2.5 mb-4 lg:mb-5 rounded-full pl-3 pr-4 py-2 font-bold text-[15px] lg:text-[16px] border ${open ? 'text-parish-ok bg-parish-okBg border-parish-okBorder' : 'text-[#4d4636] bg-parish-card border-parish-borderSoft'}`}
              >
                <span className="relative flex w-3 h-3 flex-none" aria-hidden>
                  {open && <span className="absolute inset-0 rounded-full bg-parish-ok opacity-40 animate-ping" />}
                  <span className={`relative w-3 h-3 rounded-full ${open ? 'bg-parish-ok' : 'bg-[#8a836f]'}`} />
                </span>
                {status.text}
              </div>
            )}
            {/* The three things people come here for, equal: call, message, find the church. */}
            <div className="flex flex-col sm:flex-row gap-2.5 lg:max-w-[680px]">
              {mobile && (
                <a href={`tel:${phoneHref(mobile)}`} className={`${ACTION} flex-1 bg-parish-blue text-white hover:bg-parish-blueDeep`}>
                  <Icon name="phone" size={19} />Tawag
                </a>
              )}
              {messenger && <MessengerButton href={messenger} className="!min-h-[54px] flex-1 px-5" />}
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={`${ACTION} flex-1 border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep hover:border-parish-blue`}>
                <Icon name="pin" size={19} />Mga direksyon
              </a>
            </div>
          </div>

          {sickCall && (
            <div className="mt-5 lg:mt-0 rounded-2xl lg:rounded-[20px] p-4 lg:p-5 text-white bg-parish-navy shadow-cardSm">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="w-9 h-9 flex-none rounded-xl bg-white/10 flex items-center justify-center" style={{ color: 'var(--p-gold-light)' }}><Icon name="cross" size={18} /></span>
                <div className="font-bold text-[11.5px] tracking-[.16em] uppercase" style={{ color: 'var(--p-gold-light)' }}>Sick call · Pagdihog sa masakiton</div>
              </div>
              <div className="text-[14.5px] leading-[1.45] text-white/90 mb-3">Para sa emergency: pari para sa masakiton o himalatyon, bisan unsang orasa.</div>
              <a href={`tel:${phoneHref(sickCall)}`} className="w-full min-h-[52px] rounded-xl bg-white text-parish-navy font-bold text-[17px] flex items-center justify-center gap-2 hover:bg-white/90">
                <Icon name="phone" size={19} />{sickCall}
              </a>
            </div>
          )}
        </div>
      </Band>

      <div className={`${WRAP} pt-5 lg:pt-10`}>
        {q.error && <div className="mb-4"><ErrorNote onRetry={q.reload}>Wala ma-load ang mga detalye sa opisina.</ErrorNote></div>}

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5 lg:items-start">
          <Card className="p-4 lg:p-6 lg:rounded-[20px]">
            <SectionHeading icon="clock">Oras sa opisina</SectionHeading>
            {!rows.length ? (
              <div className="text-[15px] text-parish-text2">Tawagi ang opisina para sa oras.</div>
            ) : (
              <div>
                {rows.map((r) => (
                  <div
                    key={r.label}
                    className={`flex justify-between gap-3 py-2.5 text-[15px] ${r.today ? 'px-3 -mx-3 rounded-xl' : 'border-t border-[#f4eddd] first:border-t-0'}`}
                    style={r.today ? { background: 'var(--p-blue-tint)' } : undefined}
                  >
                    <span className={`min-w-0 ${r.today ? 'font-bold text-parish-navy' : 'text-parish-ink'}`}>
                      {r.label}
                      {r.today && <span className="block w-fit mt-1 rounded-full bg-parish-blue text-white text-[11px] font-bold tracking-[.06em] uppercase px-2 py-0.5">Karon</span>}
                    </span>
                    <span className={`flex-none text-right tabular-nums ${r.hours ? (r.today ? 'font-semibold text-parish-navy' : '') : 'text-parish-text2'}`}>
                      {r.hours ? r.hours.map((h) => <span key={h} className="block whitespace-nowrap">{h}</span>) : 'Sirado'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 lg:p-6 lg:rounded-[20px]">
            <SectionHeading icon="phone">Kontaka kami</SectionHeading>
            {!hasContacts ? (
              <div className="text-[15px] text-parish-text2">Bisitaha ang opisina sa parokya sa oras sa opisina.</div>
            ) : (
              <div>
                {mobile && <ContactRow href={`tel:${phoneHref(mobile)}`} icon="phone" label="Tawag">{mobile}</ContactRow>}
                {mobile && <ContactRow href={`sms:${phoneHref(mobile)}`} icon="sms" label="Mag-text">{mobile}</ContactRow>}
                {messenger && <ContactRow href={messenger} external icon="messenger" label="Messenger · sekretarya sa opisina">Message Me</ContactRow>}
                {o.email && <ContactRow href={`mailto:${o.email}`} icon="mail" label="Email">{o.email}</ContactRow>}
                {o.facebook_url && <ContactRow href={o.facebook_url} external icon="fb" label="Facebook">Facebook page sa parokya</ContactRow>}
                {contactNote && <ContactRow icon="people" label="Kontak sa opisina">{contactNote}</ContactRow>}
              </div>
            )}
          </Card>
        </div>

        <section aria-labelledby="asa-mi" className="mt-4 lg:mt-5 border border-parish-border rounded-2xl lg:rounded-[20px] overflow-hidden bg-parish-card shadow-cardSm lg:grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <iframe
            title="Mapa sa simbahan"
            src={mapEmbedUrl(pin.latitude, pin.longitude)}
            className="block w-full h-[260px] lg:h-full lg:min-h-[400px] border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="p-4 lg:p-6 flex flex-col">
            <SectionHeading icon="pin" id="asa-mi">Asa mi makit-an</SectionHeading>
            <div className="font-bold text-[16px] lg:text-[17px] text-parish-ink leading-snug">{o.address || PARISH_ADDRESS}</div>
            {o.directions && <div className="text-[14.5px] lg:text-[15px] leading-[1.5] text-[#4d4636] mt-1.5 whitespace-pre-line">{o.directions}</div>}
            <div className="flex flex-col gap-2 mt-4 lg:mt-auto lg:pt-5">
              <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className={`${ACTION} !min-h-[50px] !text-[15.5px] bg-parish-blue text-white hover:bg-parish-blueDeep`}>
                <Icon name="pin" size={18} />Mga direksyon
              </a>
              <div className="grid grid-cols-2 gap-2">
                <a href={mapUrl} target="_blank" rel="noopener noreferrer" className={`${ACTION} !min-h-[46px] !text-[14.5px] border-[1.5px] border-[var(--p-blue-border)] text-parish-blueDeep hover:border-parish-blue`}>Google Maps</a>
                <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className={`${ACTION} !min-h-[46px] !text-[14.5px] border-[1.5px] border-[var(--p-blue-border)] text-parish-blueDeep hover:border-parish-blue`}>Waze</a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/** A card's heading with its icon. */
function SectionHeading({ icon, id, children }) {
  return (
    <h2 id={id} className="m-0 mb-3 flex items-center gap-2.5 font-serif text-[22px] lg:text-[26px] font-bold text-parish-navy">
      <Icon name={icon} size={20} className="text-[var(--p-gold-deep)]" />{children}
    </h2>
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
