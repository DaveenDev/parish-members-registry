import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ThemePickerPopover } from '../../components/ThemePicker.jsx';
import { Icon, IconSprite } from '../../components/site/Icons.jsx';
import { FOOTER_CREAM, SiteToastContext } from '../../components/site/kit.jsx';
import { usePublicData } from '../../components/site/usePublicData.js';
import { api } from '../../api.js';
import CreditFooter from '../../components/CreditFooter.jsx';
import { officeHourRows } from '../../lib/site.js';
import { messengerLink } from '../../lib/website.js';
import { useOffice } from './data.js';

export const PARISH_NAME = 'Our Lady of Guadalupe';
export const PARISH_SUB = 'Quasi-Parish · Mua-an';
export const PARISH_ADDRESS = 'Purok 3, Mua-an, Kidapawan City, North Cotabato';
// The church's place in Google Maps, used until a link is saved in Parish Website → Office.
export const PARISH_MAP_URL = 'https://www.google.com/maps/place/Our+Lady+of+Guadalupe+Quasi+Parish/@7.0464909,125.1574249,17z/data=!3m1!4b1!4m6!3m5!1s0x32f8fdfd4fe1c4cb:0x85b99a0f7d3a3e02!8m2!3d7.0464909!4d125.1619933!16s%2Fg%2F11s57y2msl';
// The church's pin (from the link above), used until latitude/longitude are saved there.
export const PARISH_COORDS = { latitude: 7.0464909, longitude: 125.1619933 };

const TABS = [
  { to: '/', label: 'Home', icon: 'home', match: (p) => p === '/' },
  { to: '/pahibalo', label: 'Pahibalo', icon: 'mega', match: (p) => p.startsWith('/pahibalo') },
  { to: '/misa', label: 'Misa', icon: 'church', match: (p) => p.startsWith('/misa') },
  { to: '/komunidad', label: 'Komunidad', icon: 'people', match: (p) => p.startsWith('/komunidad') },
  { to: '/serbisyo', label: 'Serbisyo', icon: 'grid', match: (p) => p.startsWith('/serbisyo') || p.startsWith('/kontak') },
];

const ROOTS = TABS.map((t) => t.to);

// Desktop top navigation: the same sections with their full names, plus Kontak.
// `short` is shown on small laptops (under 1280px), where the full names don't fit.
const DESK_NAV = [
  { to: '/', label: 'Home', match: (p) => p === '/' },
  { to: '/pahibalo', label: 'Pahibalo ug Kalihokan', short: 'Pahibalo', match: (p) => p.startsWith('/pahibalo') },
  { to: '/misa', label: 'Misa ug Sakramento', short: 'Misa', match: (p) => p.startsWith('/misa') },
  { to: '/komunidad', label: 'Komunidad', match: (p) => p.startsWith('/komunidad') },
  { to: '/serbisyo', label: 'Mga Serbisyo', short: 'Serbisyo', match: (p) => p.startsWith('/serbisyo') },
  { to: '/kontak', label: 'Kontak', match: (p) => p.startsWith('/kontak') },
];

// Inner pages name themselves in the header with useSiteTitle('…').
const TitleContext = createContext(() => {});
export function useSiteTitle(title) {
  const set = useContext(TitleContext);
  useEffect(() => { set(title || ''); }, [set, title]);
}

/** The parish logo uploaded in Parish Config, or null. Shared by the header and Home. */
export function useParishLogo() {
  return usePublicData('logo', () => api.publicParishLogo().catch(() => null)).data || null;
}

export function ParishMark({ size = 28, logo }) {
  if (logo) return <img src={logo} alt="" className="object-contain" style={{ width: size, height: size }} />;
  return <Icon name="cross" size={size} className="text-parish-gold" />;
}

/**
 * The public website shell, phone-first: a sticky header (parish name on the
 * five main pages, a back button and page title inside them), the Kolor theme
 * picker, and a bottom tab bar. From `lg` up the header carries the full
 * navigation instead of the tab bar, inner pages get a "Balik" link under it,
 * and every page ends with the parish footer.
 */
export default function SiteLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const logo = useParishLogo();
  const isRoot = ROOTS.includes(pathname);

  const say = useCallback((msg) => {
    clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function back() {
    // Opened from a shared link: there's no page of ours to go back to.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(TABS.find((t) => t.to !== '/' && t.match(pathname))?.to || '/');
  }

  return (
    <SiteToastContext.Provider value={say}>
      <TitleContext.Provider value={setTitle}>
        <IconSprite />
        <div className="min-h-screen bg-parish-bg font-sans text-parish-ink max-w-[560px] mx-auto relative pb-[64px] lg:max-w-none lg:pb-0 lg:flex lg:flex-col">
          <DesktopHeader pathname={pathname} logo={logo} />
          <header className="lg:hidden sticky top-0 z-20 h-[58px] flex items-center gap-2 pl-1.5 pr-2.5 border-b border-parish-border backdrop-blur-md" style={{ background: 'rgba(247,242,232,.95)' }}>
            {isRoot ? (
              <Link to="/" className="flex items-center gap-2 flex-1 min-w-0 pl-2">
                <ParishMark logo={logo} />
                <div className="leading-[1.05] min-w-0">
                  <div className="font-serif text-[18px] font-bold text-parish-navy truncate">{PARISH_NAME}</div>
                  <div className="font-semibold text-[11px] text-parish-text2 tracking-[.04em]">{PARISH_SUB}</div>
                </div>
              </Link>
            ) : (
              <>
                <button type="button" aria-label="Balik" onClick={back} className="w-11 h-11 flex items-center justify-center text-parish-navy rounded-xl">
                  <Icon name="back" size={22} />
                </button>
                <div className="flex-1 min-w-0 font-serif text-[21px] font-semibold text-parish-navy truncate">{title}</div>
              </>
            )}
            <ThemePickerPopover align="right" label="Theme" />
          </header>

          {!isRoot && (
            <div className="hidden lg:block w-full max-w-[1240px] mx-auto px-6 pt-[18px]">
              <button type="button" onClick={back} className="min-h-[40px] inline-flex items-center gap-1.5 font-bold text-[15px] text-parish-blue hover:text-parish-blueDeep">
                <Icon name="back" size={18} />Balik
              </button>
            </div>
          )}

          <div className="lg:flex-1"><Outlet /></div>

          <DesktopFooter />

          {toast && (
            <div role="status" className="fixed left-4 right-4 bottom-[78px] lg:bottom-7 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-max lg:max-w-[90vw] z-40 max-w-[528px] mx-auto bg-parish-navy text-white rounded-xl px-3.5 py-3 font-semibold text-[14px] leading-snug shadow-card animate-fadeUp">
              {toast}
            </div>
          )}
        </div>

        <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-parish-card border-t border-parish-border">
          <div className="max-w-[560px] mx-auto h-16 grid grid-cols-5">
            {TABS.map((t) => {
              const on = t.match(pathname);
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  aria-current={on ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center gap-[3px] text-[11.5px] ${on ? 'text-parish-blue font-bold' : 'text-parish-text2 font-semibold'}`}
                >
                  <span className="absolute top-0 left-[26%] right-[26%] h-[3px] rounded-b-[3px]" style={{ background: on ? 'var(--p-blue)' : 'transparent' }} />
                  <Icon name={t.icon} size={23} />
                  <span>{t.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      </TitleContext.Provider>
    </SiteToastContext.Provider>
  );
}

function DesktopHeader({ pathname, logo }) {
  return (
    <header className="hidden lg:block sticky top-0 z-20 border-b border-parish-border backdrop-blur-md" style={{ background: 'rgba(247,242,232,.96)' }}>
      <div className="max-w-[1240px] mx-auto px-6 h-[76px] flex items-center gap-4 xl:gap-7">
        <Link to="/" className="flex items-center gap-2.5 flex-none">
          <ParishMark size={36} logo={logo} />
          <span className="leading-[1.05]">
            <span className="block font-serif text-[22px] font-bold text-parish-navy">{PARISH_NAME}</span>
            <span className="block font-semibold text-[12.5px] text-parish-text2 tracking-[.04em]">{PARISH_SUB}</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-stretch gap-0.5 ml-auto h-full">
          {DESK_NAV.map((t) => {
            const on = t.match(pathname);
            return (
              <NavLink
                key={t.to}
                to={t.to}
                aria-current={on ? 'page' : undefined}
                className={`relative flex items-center px-[10px] xl:px-[13px] text-[15.5px] whitespace-nowrap hover:text-parish-blueDeep ${on ? 'font-bold text-parish-blueDeep' : 'font-semibold text-[#3f3b2f]'}`}
              >
                {t.short ? <><span className="xl:hidden">{t.short}</span><span className="hidden xl:inline">{t.label}</span></> : t.label}
                <span className="absolute left-[10px] right-[10px] xl:left-[13px] xl:right-[13px] -bottom-px h-[3px] rounded-t-[3px]" style={{ background: on ? 'var(--p-blue)' : 'transparent' }} />
              </NavLink>
            );
          })}
        </nav>
        <ThemePickerPopover align="right" label="Theme" />
      </div>
    </header>
  );
}

/** Desktop footer on every page: parish, office, privacy note and staff sign-in. */
function DesktopFooter() {
  const o = useOffice().data || {};
  // The Kontak page already shows the hours, phone and Message Me, so the footer leaves them out there.
  const { pathname } = useLocation();
  const onKontak = pathname.startsWith('/kontak');
  // Komunidad's articles sit on the page's cream, so its footer follows them with no gap.
  const onKomunidad = pathname.startsWith('/komunidad');
  const open = officeHourRows(o.office_hours).filter((r) => r.hours).slice(0, 2);
  const phone = o.mobile || o.contact;
  const messenger = messengerLink(o.secretary_messenger);
  const logo = useParishLogo();
  return (
    <footer className={`hidden lg:block border-t ${onKomunidad ? '' : 'mt-14'}`} style={FOOTER_CREAM}>
      <div className={`max-w-[1240px] mx-auto px-6 py-8 grid gap-8 items-start ${onKontak ? 'grid-cols-[1.4fr_1fr]' : 'grid-cols-[1.4fr_1fr_1fr]'}`}>
        <div className="flex gap-3">
          <span className="flex-none"><ParishMark size={34} logo={logo} /></span>
          <div>
            <div className="font-serif text-[21px] font-bold text-parish-navy">{PARISH_NAME} {PARISH_SUB.split(' · ')[0]}</div>
            {!onKontak && <div className="text-[14.5px] leading-normal text-[#4d4636] mt-0.5">{o.address || PARISH_ADDRESS}</div>}
          </div>
        </div>
        {!onKontak && <div className="text-[14.5px] leading-[1.7] text-[#4d4636]">
          <div className="font-bold text-[11.5px] tracking-[.16em] uppercase text-[var(--p-eyebrow)] mb-1">Opisina</div>
          {/* Each time range on its own line, lined up after the days. */}
          {open.length > 0 && (
            <div className="grid grid-cols-[auto_1fr] gap-x-1.5">
              {open.map((r) => (
                <React.Fragment key={r.label}>
                  <div className="whitespace-nowrap">{r.label} ·</div>
                  <div>{r.hours.map((h, i) => <div key={h} className="whitespace-nowrap">{h}{i < r.hours.length - 1 ? ',' : ''}</div>)}</div>
                </React.Fragment>
              ))}
            </div>
          )}
          {phone && <div>{phone}</div>}
          {messenger && (
            <a href={messenger} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 font-bold text-[14.5px] text-[#0866FF] hover:underline">
              <Icon name="messenger" size={17} />Message Me
            </a>
          )}
          {!open.length && !phone && !messenger && <Link to="/kontak" className="font-semibold text-parish-blue">Tan-awa ang kontak</Link>}
        </div>}
        <div className="flex flex-col gap-1.5 items-start">
          <div className="flex gap-1.5 text-[13.5px] leading-[1.45] text-[#4d4636]">
            <Icon name="lock" size={15} className="flex-none mt-0.5" />Pribado ang datos sa mga pamilya, sumala sa Data Privacy Act of 2012.
          </div>
          <Link to="/admin/login" className="min-h-[40px] inline-flex items-center font-bold text-[15px] text-parish-blue hover:text-parish-blueDeep">Kawani sa parokya? Mag-sign in</Link>
          <CreditFooter inline />
        </div>
      </div>
    </footer>
  );
}

/** Phone footer for the main pages: address and the staff sign-in link. */
export function SiteFooter({ address }) {
  return (
    <footer className="lg:hidden mt-8 px-[18px] pt-[22px] pb-2 border-t border-[#e7dcc4] text-center">
      <div className="text-[14px] text-[#4d4636] leading-normal">{address || PARISH_ADDRESS}</div>
      <Link to="/admin/login" className="inline-flex items-center min-h-[44px] mt-1.5 font-bold text-[14.5px] text-parish-blue">Kawani sa parokya? Mag-sign in</Link>
    </footer>
  );
}
