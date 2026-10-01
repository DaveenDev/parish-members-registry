import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ThemePickerPopover } from '../../components/ThemePicker.jsx';
import { Icon, IconSprite } from '../../components/site/Icons.jsx';
import { SiteToastContext } from '../../components/site/kit.jsx';
import { usePublicData } from '../../components/site/usePublicData.js';
import { api } from '../../api.js';

export const PARISH_NAME = 'Our Lady of Guadalupe';
export const PARISH_SUB = 'Quasi-Parish · Mua-an';
export const PARISH_ADDRESS = 'Purok 3, Mua-an, Kidapawan City, North Cotabato';

const TABS = [
  { to: '/', label: 'Home', icon: 'home', match: (p) => p === '/' },
  { to: '/misa', label: 'Misa', icon: 'church', match: (p) => p.startsWith('/misa') },
  { to: '/pahibalo', label: 'Pahibalo', icon: 'mega', match: (p) => p.startsWith('/pahibalo') },
  { to: '/komunidad', label: 'Komunidad', icon: 'people', match: (p) => p.startsWith('/komunidad') },
  { to: '/serbisyo', label: 'Serbisyo', icon: 'grid', match: (p) => p.startsWith('/serbisyo') || p.startsWith('/kontak') },
];

const ROOTS = TABS.map((t) => t.to);

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
 * picker, and a bottom tab bar.
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
        <div className="min-h-screen bg-parish-bg font-sans text-parish-ink max-w-[560px] mx-auto relative pb-[64px]">
          <header className="sticky top-0 z-20 h-[58px] flex items-center gap-2 pl-1.5 pr-2.5 border-b border-parish-border backdrop-blur-md" style={{ background: 'rgba(247,242,232,.95)' }}>
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
            <ThemePickerPopover align="right" label="Kolor" />
          </header>

          <Outlet />

          {toast && (
            <div role="status" className="fixed left-4 right-4 bottom-[78px] z-40 max-w-[528px] mx-auto bg-parish-navy text-white rounded-xl px-3.5 py-3 font-semibold text-[14px] leading-snug shadow-card animate-fadeUp">
              {toast}
            </div>
          )}
        </div>

        <nav aria-label="Main" className="fixed bottom-0 inset-x-0 z-30 bg-parish-card border-t border-parish-border">
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

/** Footer for the main pages: address and the staff sign-in link. */
export function SiteFooter({ address }) {
  return (
    <footer className="mt-8 px-[18px] pt-[22px] pb-2 border-t border-[#e7dcc4] text-center">
      <div className="text-[14px] text-[#4d4636] leading-normal">{address || PARISH_ADDRESS}</div>
      <Link to="/admin/login" className="inline-flex items-center min-h-[44px] mt-1.5 font-bold text-[14.5px] text-parish-blue">Kawani sa parokya? Mag-sign in</Link>
    </footer>
  );
}
