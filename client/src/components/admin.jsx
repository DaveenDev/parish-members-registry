import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pageWindow } from '../lib/paging.js';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="lg:sticky lg:top-0 z-10 bg-parish-bg/90 backdrop-blur-md border-b border-parish-border px-4 py-4 sm:px-[26px] sm:py-[18px] flex items-start sm:items-center justify-between gap-3 sm:gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="font-serif text-[clamp(22px,3vw,30px)] font-semibold m-0 text-parish-navy">{title}</h1>
        {subtitle && <div className="text-[13.5px] text-parish-muted mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">{children}</div>
    </div>
  );
}

/** Parchment card that admin lists, forms and charts sit on. */
export function Panel({ children, className = '', ...rest }) {
  return <div {...rest} className={`bg-parish-card border border-parish-border rounded-2xl shadow-cardSm ${className}`}>{children}</div>;
}

export function PageBody({ children }) {
  return <div className="p-4 sm:p-[26px] flex-1">{children}</div>;
}

/**
 * Filter dropdown. On phones it grows to share its row with the filters next
 * to it, so a row of filters lines up instead of leaving ragged gaps.
 */
export function FilterSelect({ className = '', ...props }) {
  return (
    <select
      {...props}
      className={`max-sm:flex-1 max-sm:min-w-[140px] pl-3 pr-9 py-2.5 text-[13.5px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-lg outline-none cursor-pointer ${className}`}
    />
  );
}

export function SearchInput(props) {
  return (
    <div className="relative w-full sm:w-auto">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--c-icon))" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2" aria-hidden>
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
      </svg>
      <input
        {...props}
        className="w-full sm:w-[min(320px,42vw)] pl-9 pr-3.5 py-2.5 text-[14.5px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-xl outline-none focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15"
      />
    </div>
  );
}

// A table's first column pinned while it scrolls sideways, so a wide table of
// numbers keeps its row names in view on a phone. Total rows (bg-parish-sunk)
// keep their shading.
const STICKY_FIRST = 'max-md:[&_tr>*:first-child]:sticky max-md:[&_tr>*:first-child]:left-0 max-md:[&_tr>*:first-child]:z-[1] '
  + 'max-md:[&_tr>*:first-child]:bg-parish-card max-md:[&_tr.bg-parish-sunk>*:first-child]:bg-parish-sunk '
  + 'max-md:[&_tr>*:first-child]:shadow-[1px_0_0_rgb(var(--c-line))]';

/**
 * Table on a Panel. `mobile`, when given, replaces the table below the md
 * breakpoint (cards read better than a sideways-scrolling table on a phone).
 * `stickyFirst` pins the first column instead, for tables of figures.
 */
export function DataTable({ columns, children, minWidth = 700, footer, mobile, stickyFirst = false }) {
  return (
    <Panel className="overflow-hidden">
      {mobile && <div className="md:hidden">{mobile}</div>}
      <div className={`overflow-x-auto ${mobile ? 'hidden md:block' : ''}`}>
        <table className={`w-full border-collapse ${stickyFirst ? STICKY_FIRST : ''}`} style={{ minWidth }}>
          <thead>
            <tr className="bg-parish-sunk">
              {columns.map((c) => (
                <th
                  key={c.key || c.label}
                  scope="col"
                  aria-sort={c.onSort ? (c.arrow === '↑' ? 'ascending' : c.arrow === '↓' ? 'descending' : 'none') : undefined}
                  className={`text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2 whitespace-nowrap ${c.align === 'center' ? 'text-center' : c.align === 'right' ? 'text-right' : ''} ${c.className || ''}`}
                >
                  {c.header || (c.onSort
                    ? <button type="button" onClick={c.onSort} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-bold text-[12px] tracking-wide uppercase text-parish-text2">{c.label} <span aria-hidden>{c.arrow || ''}</span></button>
                    : c.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </Panel>
  );
}

/**
 * Props that make a clickable <tr> reachable and operable by keyboard.
 * A row is not natively focusable, so it needs a role, a tab stop, and
 * Enter/Space handling to match what mouse users get.
 */
export function rowActivationProps(onActivate, label) {
  return {
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
    tabIndex: 0,
    role: 'button',
    'aria-label': label,
  };
}

/** Inline failure state for a list/panel whose data could not be loaded. */
export function ErrorState({ message, onRetry }) {
  return (
    <div className="py-12 px-5 text-center">
      <div className="w-11 h-11 rounded-full bg-parish-errorBg text-parish-error flex items-center justify-center mx-auto mb-3 text-xl font-bold" aria-hidden>!</div>
      <div className="font-serif text-[20px] text-parish-navy mb-1">Couldn't load this</div>
      <div className="text-[14px] text-parish-muted mb-4">{message || 'Something went wrong.'}</div>
      {onRetry && (
        <button onClick={onRetry} className="appearance-none cursor-pointer px-4 py-2 rounded-lg border-[1.5px] border-parish-borderSoft bg-parish-surface font-semibold text-[13px] text-parish-blue">
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Spinner while something is loading, so tables don't flash "no results".
 * `label` is read out to screen readers; `compact` fits a drawer or panel row.
 */
export function LoadingState({ label = 'Loading…', compact = false }) {
  return (
    <div className={`${compact ? 'py-4' : 'py-12'} px-5 flex justify-center`} role="status" aria-live="polite">
      <span className={`${compact ? 'w-5 h-5 border-2' : 'w-8 h-8 border-[3px]'} shrink-0 rounded-full border-parish-blue/20 border-t-parish-blue animate-spinSlow`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * "2 new registrations came in · Show" above a live list that held still
 * while someone was busy with it (useLiveRefresh). Nothing when `count` is 0.
 */
export function NewItemsNote({ count, noun, onShow }) {
  if (!count) return null;
  return (
    <div role="status" className="mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-parish-borderSoft bg-[var(--p-gold-tint)] text-[13.5px] text-parish-ink">
      <span className="flex-1"><strong>{count} new</strong> {noun}{count === 1 ? '' : 's'} came in.</span>
      <button type="button" onClick={onShow} className="appearance-none cursor-pointer bg-transparent border-0 p-0 font-semibold text-[13.5px] text-parish-blue">Show</button>
    </div>
  );
}

export function EmptyState({ title, subtitle }) {
  return (
    <div className="py-14 px-5 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--c-faint))" strokeWidth="1.6" className="mx-auto mb-3"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
      <div className="font-serif text-[22px] text-parish-navy mb-1">{title}</div>
      {subtitle && <div className="text-[14px] text-parish-muted">{subtitle}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, onPageSize, alwaysShow = false }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Deleting the last row of the last page (or a smaller list after a
  // change) would leave an empty page past the end: go back to the last one.
  useEffect(() => {
    if (total > 0 && page > pageCount) onPage(pageCount);
  }, [total, page, pageCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // Hide only when everything fits on the smallest page size; otherwise keep
  // the size picker reachable even if the current size shows it all.
  // `alwaysShow` keeps the bar (count + size picker) for any non-empty list.
  if (total === 0 || (!alwaysShow && total <= Math.min(pageSize, 10))) return null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  // 1 … 4 5 [6] 7 8 … 60 rather than a button for every page.
  const buttons = pageWindow(page, pageCount);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-t border-parish-line flex-wrap">
      <div className="flex items-center gap-3">
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page" className="pl-2.5 pr-8 py-1.5 text-[13px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-lg outline-none cursor-pointer">
          <option value={10}>10 / page</option><option value={20}>20 / page</option><option value={50}>50 / page</option>
        </select>
        <div className="text-[13px] text-parish-muted">Showing {from}–{to} of {total}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="appearance-none cursor-pointer px-3 py-1.5 rounded-lg border-[1.5px] border-parish-borderSoft font-semibold text-[13px] bg-parish-surface disabled:opacity-50">Prev</button>
        {buttons.map((n, i) => n === 'gap' ? (
          <span key={`gap-${i}`} className="px-1 text-parish-muted" aria-hidden>…</span>
        ) : (
          <button
            key={n} onClick={() => onPage(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? 'page' : undefined}
            className="appearance-none cursor-pointer min-w-[34px] px-2.5 py-1.5 rounded-lg font-semibold text-[13px] border-[1.5px]"
            style={{ borderColor: n === page ? 'var(--p-blue)' : 'rgb(var(--c-border-soft))', background: n === page ? 'var(--p-blue)' : 'rgb(var(--c-surface))', color: n === page ? 'rgb(var(--c-surface))' : 'rgb(var(--c-ink))' }}
          >
            {n}
          </button>
        ))}
        <button onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page === pageCount} className="appearance-none cursor-pointer px-3 py-1.5 rounded-lg border-[1.5px] border-parish-borderSoft font-semibold text-[13px] bg-parish-surface disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}

/**
 * Underlined tab bar. `tabs` is a list of [key, label]. On phones the tabs
 * stay on one line and the bar scrolls sideways, instead of stacking into a
 * column that pushes the page down.
 */
export function Tabs({ tabs, value, onChange }) {
  const ref = useRef(null);
  // Keep the chosen tab in view when the bar scrolls (a deep link to the last tab).
  useEffect(() => {
    const bar = ref.current;
    const tab = bar?.querySelector('[aria-selected="true"]');
    if (!tab || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollLeft = tab.offsetLeft - (bar.clientWidth - tab.offsetWidth) / 2;
  }, [value]);
  return (
    <div ref={ref} role="tablist" className="relative flex gap-1 mb-[22px] border-b border-parish-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
      {tabs.map(([k, label]) => (
        <button
          key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className="appearance-none border-none bg-none cursor-pointer px-3 sm:px-4 py-2.5 -mb-px font-semibold text-[14.5px] sm:text-[15px] whitespace-nowrap shrink-0"
          style={{ color: value === k ? 'var(--p-blue)' : 'rgb(var(--c-muted))', borderBottom: `2.5px solid ${value === k ? 'var(--p-blue)' : 'transparent'}` }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * Centered dialog with a title, a close button and Escape-to-close. Only
 * the topmost dialog closes, and not while a confirm is open above it.
 */
export function Modal({ title, onClose, children, maxWidth = 480, z = 'z-50' }) {
  const titleId = useId();
  const ref = useRef(null);
  useEffect(() => {
    const onTop = () => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      return dialogs[dialogs.length - 1] === ref.current && !document.querySelector('[role="alertdialog"]');
    };
    const onKey = (e) => e.key === 'Escape' && onTop() && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`fixed inset-0 ${z} bg-parish-scrim/45 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-5`} onClick={onClose}>
      <div
        ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="bg-parish-surface rounded-2xl w-full shadow-2xl p-5 sm:p-6 max-h-dialog overflow-auto"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 id={titleId} className="font-serif text-[23px] font-semibold m-0 text-parish-navy">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Banner for pages the signed-in account can look at but not change. */
export function ViewOnlyNote({ children = 'Your account can view this page but not change it.' }) {
  return (
    <div role="note" className="mb-4 px-4 py-3 rounded-xl border border-parish-warnBorder bg-parish-warnBg text-parish-warnStrong text-[13.5px] font-medium">
      {children}
    </div>
  );
}

/**
 * "⋯" button with a small menu of row actions. `items` is a list of
 * { label, onClick, tone: 'danger' }; falsy entries are skipped. The menu
 * is fixed-positioned in a portal so a scrolling table can't clip it.
 * Arrow keys move, Escape or a click outside closes.
 */
export function ActionMenu({ label = 'More actions', items }) {
  const shown = items.filter(Boolean);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const open = !!pos;

  function toggle() {
    if (open) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom > 44 * shown.length + 16;
    setPos({ right: Math.max(8, window.innerWidth - r.right), ...(below ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }) });
  }

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target))) return;
      setPos(null);
      if (e.type === 'keydown') btnRef.current?.focus();
    };
    const closeNow = () => setPos(null);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', closeNow);
    window.addEventListener('scroll', closeNow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', closeNow);
      window.removeEventListener('scroll', closeNow, true);
    };
  }, [open]);

  function onMenuKey(e) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const els = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const i = els.indexOf(document.activeElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
    els[next]?.focus();
  }

  if (!shown.length) return null;
  return (
    <>
      <button
        ref={btnRef} type="button" onClick={toggle}
        aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        className="appearance-none border-none cursor-pointer w-9 h-9 rounded-lg bg-parish-sunk text-parish-text2 font-bold text-[16px] leading-none flex items-center justify-center"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && createPortal(
        <div ref={menuRef} id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKey}
          className="fixed z-[60] min-w-[170px] bg-parish-surface border border-parish-border rounded-xl shadow-card p-1.5 flex flex-col"
          style={pos}
        >
          {shown.map((it) => (
            <button
              key={it.label} type="button" role="menuitem"
              onClick={() => { setPos(null); it.onClick(); }}
              className={`appearance-none border-none bg-transparent cursor-pointer text-left px-3 py-2.5 rounded-lg font-semibold text-[13.5px] hover:bg-parish-hover focus:bg-parish-hover outline-none ${it.tone === 'danger' ? 'text-parish-error' : 'text-parish-navy'}`}
            >
              {it.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
