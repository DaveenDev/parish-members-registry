import React, { createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons.jsx';

// Small building blocks for the public website. Brand colour always comes
// from the theme variables (--p-*) so every theme in Kolor works; neutrals
// and status colours are the fixed parchment palette from tailwind.config.js.

/** Category / type chip colours, by tone. */
export const TONES = {
  blue: { color: 'var(--p-blue-deep)', background: 'var(--p-blue-tint)', borderColor: 'var(--p-blue-border)' },
  gold: { color: 'var(--p-eyebrow)', background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)' },
  green: { color: '#2f6b48', background: '#eaf4ee', borderColor: '#bfe0cc' },
  red: { color: '#a13d29', background: '#fbeeea', borderColor: '#f0cec3' },
  gray: { color: '#4d4636', background: '#f1ead9', borderColor: '#e0d6c1' },
};

export function Chip({ tone = 'blue', children }) {
  return (
    <span className="inline-block font-bold text-[11px] tracking-[.08em] uppercase border rounded-md px-[7px] py-0.5" style={TONES[tone] || TONES.blue}>
      {children}
    </span>
  );
}

/**
 * Page containers. Phones get the narrow column the layout already centres;
 * from `lg` up each page centres itself at the width its design asks for.
 */
export const PAGE = 'px-3.5 pt-4 pb-7 animate-fadeUp lg:max-w-[1240px] lg:mx-auto lg:px-6 lg:pt-9 lg:pb-0';
/** Inner pages (opened from a list): the layout shows "Balik" above them on desktop. */
export const INNER = 'px-4 pt-[18px] pb-7 animate-fadeUp lg:mx-auto lg:px-6 lg:pb-0';
/** Page content width without padding top/bottom, for content inside a full-width band. */
// The two warm backgrounds of the site: the footer's cream, and a sand from the
// theme's gold. On Komunidad they trade places: the articles band is the cream
// and the footer the sand.
export const FOOTER_CREAM = { background: '#f1ead9', borderColor: '#e7dcc4' };
export const SAND = { background: 'color-mix(in srgb, var(--p-gold) 24%, #fbf7ee)', borderColor: 'color-mix(in srgb, var(--p-gold) 40%, white)' };

export const WRAP = 'px-3.5 lg:max-w-[1240px] lg:mx-auto lg:px-6';
/** Top/bottom padding for a page's first section when it sits on a Band. */
export const BAND_PAD = 'pt-4 pb-7 lg:pt-9 lg:pb-12';

/**
 * A full-width light-blue band that sets a page's first section apart from
 * what follows (Misa ug Sakramento, Pahibalo ug Kalihokan, Komunidad). Put a
 * WRAP inside it so the content keeps the page width.
 */
export function Band({ as: Tag = 'section', className = '', style, children, ...rest }) {
  return (
    <Tag className={`border-b ${className}`} style={{ background: 'var(--p-blue-tint)', borderColor: 'var(--p-blue-border)', ...style }} {...rest}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className = '' }) {
  return <div className={`font-bold text-[11.5px] lg:text-[12px] tracking-[.18em] uppercase text-[var(--p-eyebrow)] ${className}`}>{children}</div>;
}

export function PageTitle({ children, className = 'mb-3.5' }) {
  return <h1 className={`font-serif font-semibold text-[32px] lg:text-[46px] leading-[1.08] mt-0.5 text-parish-navy ${className}`}>{children}</h1>;
}

/** Eyebrow + title, with the section switch under them on phones and beside them on desktop. */
export function PageHeader({ eyebrow, title, children }) {
  return (
    <div className="lg:flex lg:items-end lg:justify-between lg:gap-6 lg:mb-[22px]">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <PageTitle className="mb-3.5 lg:mb-0">{title}</PageTitle>
      </div>
      {children}
    </div>
  );
}

/** Section heading with a link on the right. `actionLg` replaces the link text on desktop. */
/** "Message Me": opens a Messenger chat with the office secretary (m.me link). */
export function MessengerButton({ href, className = '' }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`min-h-[52px] rounded-xl text-white font-bold text-[16px] flex items-center justify-center gap-2 hover:brightness-105 ${className}`}
      style={{ background: 'linear-gradient(135deg, #00B2FF 0%, #006AFF 100%)' }}
    >
      <Icon name="messenger" size={20} />Message Me
    </a>
  );
}

/** A section title with an optional link on the right. `dark` is for sections on the navy band. */
export function SectionHead({ title, to, action, actionLg, dark = false }) {
  return (
    <div className="flex items-baseline justify-between mb-2.5 lg:mb-3.5">
      <h2 className={`font-serif font-semibold text-[25px] lg:text-[30px] m-0 ${dark ? 'text-white' : 'text-parish-navy'}`}>{title}</h2>
      {to && (
        <Link to={to} className={`min-h-[44px] inline-flex items-center font-bold text-[14.5px] lg:text-[15px] ${dark ? 'text-[var(--p-gold-light)] hover:underline' : 'text-parish-blue'}`}>
          {actionLg ? <><span className="lg:hidden">{action}</span><span className="hidden lg:inline">{actionLg}</span></> : action}
        </Link>
      )}
    </div>
  );
}

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`bg-parish-card border border-parish-border rounded-2xl shadow-cardSm ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Two-way switch at the top of a section (role=tablist). */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="grid gap-1 p-1 bg-[#efe7d6] rounded-[14px] mb-4 lg:mb-0 lg:flex lg:flex-none" style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map(([v, l]) => {
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v)}
            className={`min-h-[44px] rounded-[11px] font-bold text-[14.5px] lg:px-[22px] lg:text-[15px] ${on ? 'bg-parish-blue text-white' : 'text-parish-ink hover:text-parish-blueDeep'}`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** Row of toggle pills (filters). `scroll` lets a long row scroll sideways. */
export function Pills({ options, value, onChange, scroll = false, dark = false, className = '' }) {
  return (
    <div className={`flex gap-1.5 lg:gap-2 ${scroll ? 'overflow-x-auto -mx-3.5 px-3.5 pb-0.5 lg:overflow-visible lg:flex-wrap lg:mx-0 lg:px-0' : ''} ${className}`}>
      {options.map(([v, l]) => {
        const on = v === value;
        const onCls = dark ? 'bg-parish-navy border-parish-navy text-white' : 'bg-parish-blue border-parish-blue text-white';
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(v)}
            className={`min-h-[44px] rounded-xl border-[1.5px] font-semibold text-[14.5px] ${scroll ? 'flex-none px-3.5 min-h-[40px] rounded-full lg:px-4' : 'flex-1 lg:flex-none lg:px-[18px] lg:text-[15px]'} ${on ? onCls : 'bg-parish-card border-parish-borderSoft text-parish-ink hover:border-[var(--p-blue-border)]'}`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Skeleton({ h = 100, className = '', alt = false }) {
  return <div aria-hidden="true" className={`rounded-2xl ${alt ? 'bg-[#f3ecdd]' : 'bg-[#efe6d3]'} animate-pulse ${className}`} style={{ height: h }} />;
}

export function Skeletons({ n = 2, h = 100 }) {
  return (
    <div className="flex flex-col gap-2.5" aria-busy="true" aria-label="Nag-load…">
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} h={h} alt={i % 2 === 1} />)}
    </div>
  );
}

export function ErrorNote({ children, onRetry }) {
  return (
    <div role="alert" className="bg-parish-errorBg border border-parish-errorBorder rounded-[14px] p-3.5 text-parish-error text-[15px]">
      {children}{' '}
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-bold underline">Sulayi pag-usab</button>
      )}
    </div>
  );
}

export function EmptyNote({ children }) {
  return <div className="text-center px-3.5 py-7 text-parish-text2 text-[15px]">{children}</div>;
}

/** Loading → skeletons, error → ErrorNote, empty → EmptyNote, else children. */
export function DataState({ state, skeleton, errorText, emptyText, empty, children }) {
  if (state.loading) return skeleton || <Skeletons />;
  if (state.error) return <ErrorNote onRetry={state.reload}>{errorText}</ErrorNote>;
  if (empty) return <EmptyNote>{emptyText}</EmptyNote>;
  return children;
}

const BIG = 'w-full min-h-[54px] rounded-[14px] flex items-center justify-center gap-2.5 font-bold text-[16.5px] transition disabled:opacity-60';
const PRIMARY = `${BIG} bg-parish-blue text-white hover:bg-parish-blueDeep`;
const SECONDARY = `${BIG} min-h-[50px] text-[15.5px] text-parish-blueDeep bg-parish-card border-[1.5px] border-[var(--p-blue-border)]`;

/** Full-width main action. Pass `to` for a link, `href` for an outside link, else it's a button. */
export function BigButton({ to, href, variant = 'primary', className = '', children, ...rest }) {
  const cls = `${variant === 'primary' ? PRIMARY : SECONDARY} ${className}`;
  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>;
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>;
  return <button type="button" className={cls} {...rest}>{children}</button>;
}

/** Icon + small label + value line inside a detail card. */
export function InfoRow({ icon, label, children, last = false }) {
  return (
    <div className={`flex gap-3 py-3 ${last ? '' : 'border-b border-[#f0e8d6]'}`}>
      <Icon name={icon} className="text-parish-blue" />
      <div className="min-w-0">
        {label && <div className="text-[13px] text-parish-text2">{label}</div>}
        <div className="font-semibold text-[15.5px]">{children}</div>
      </div>
    </div>
  );
}

/** Round initials avatar for an opted-in person. */
export function Avatar({ initials, size = 36 }) {
  return (
    <div
      className="rounded-full flex-none flex items-center justify-center font-bold text-parish-blueDeep"
      style={{ width: size, height: size, background: 'var(--p-blue-tint-strong)', fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </div>
  );
}

export function Spin() {
  return <span className="w-[17px] h-[17px] border-2 border-white/40 border-t-white rounded-full animate-spinSlow" aria-hidden="true" />;
}

// ---- toasts --------------------------------------------------------------

export const SiteToastContext = createContext(() => {});
export const useSiteToast = () => useContext(SiteToastContext);

/** Share a page (this one, or `path` on this site): the phone's share sheet when there is one, else copy the link. */
export function useShare() {
  const say = useSiteToast();
  return async (title, path) => {
    const url = path ? new URL(path, window.location.origin).href : window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      say('Na-copy ang link. I-paste sa Messenger.');
    } catch (e) {
      if (e?.name !== 'AbortError') say('Wala ma-copy ang link.');
    }
  };
}
