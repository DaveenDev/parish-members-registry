import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useDebounced } from '../hooks.js';
import { can } from '../lib/access.js';
import { NAV_GROUPS, navAllowed } from './adminNav.js';
import MemberDetailModal from './MemberDetailModal.jsx';

const REQUEST_TABS = { certificates: ['Certificate', ''], prayers: ['Prayer request', 'prayers'], blood: ['Blood request', 'blood'] };

/** Ctrl+K / ⌘K anywhere in the admin panel, or the sidebar's Search button. */
export function useCommandPaletteShortcut(open) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
}

/**
 * Quick search across pages, households, members and requests. Arrow keys
 * move, Enter opens, Escape closes. Members open in their record window
 * right here; everything else goes to its page.
 */
export default function CommandPalette({ onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim(), 250);
  const [found, setFound] = useState({ households: [], members: [], requests: [], loading: false, for: '' });
  const [active, setActive] = useState(0);
  const [openMemberId, setOpenMemberId] = useState(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (debounced.length < 2) { setFound({ households: [], members: [], requests: [], loading: false, for: debounced }); return; }
    let cancelled = false;
    setFound((f) => ({ ...f, loading: true }));
    Promise.all([
      api.listHouseholds({ search: debounced, pageSize: 5 }).then((r) => r.rows).catch(() => []),
      api.listMembers({ search: debounced, pageSize: 6, membership: 'All' }).then((r) => r.rows).catch(() => []),
      can(user, 'requests') ? api.searchRequests(debounced).catch(() => []) : Promise.resolve([]),
    ]).then(([households, members, requests]) => {
      if (!cancelled) setFound({ households, members, requests, loading: false, for: debounced });
    });
    return () => { cancelled = true; };
  }, [debounced, user]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV_GROUPS.flatMap((g) => g.items.filter((i) => navAllowed(i, user)).map((i) => ({ ...i, group: g.label })))
      .filter((i) => !q || i.label.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
      .slice(0, q ? 5 : 8)
      .map((i) => ({ key: `p${i.to}`, section: 'Pages', title: i.label, sub: i.group, go: () => navigate(i.to) }));
    const households = found.households.map((h) => ({
      key: `h${h.id}`, section: 'Households', title: h.household_name,
      sub: [h.head_name && `Head: ${h.head_name}`, h.gkk, h.ref_no].filter(Boolean).join(' · '),
      go: () => navigate(`/admin/households?q=${encodeURIComponent(h.household_name)}`),
    }));
    const members = found.members.map((m) => ({
      key: `m${m.id}`, section: 'Members', title: [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' '),
      sub: [m.household_name, m.household_gkk, m.membership_status].filter(Boolean).join(' · '),
      go: () => setOpenMemberId(m.id), keepOpen: true,
    }));
    const requests = found.requests.map((r) => {
      const [label, tab] = REQUEST_TABS[r.kind];
      const view = r.kind === 'prayers' ? 'All' : 'all';
      const params = new URLSearchParams({ ...(tab ? { tab } : {}), view, ...(r.kind === 'blood' ? {} : { q: r.ref_no }) });
      return { key: `r${r.kind}${r.id}`, section: 'Requests', title: `${r.ref_no} · ${r.title}`, sub: `${label} · ${r.status}`, go: () => navigate(`/admin/requests?${params}`) };
    });
    return [...pages, ...households, ...members, ...requests];
  }, [query, found, user, navigate]);

  useEffect(() => { setActive(0); }, [results.length, query]);

  function choose(r) {
    r.go();
    if (!r.keepOpen) onClose();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape' && !openMemberId) { e.preventDefault(); onClose(); }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const searching = found.loading || (debounced !== found.for);
  let lastSection = null;

  return (
    <>
      {!openMemberId && (
      <div className="fixed inset-0 z-[80] bg-parish-navy/45 backdrop-blur-sm flex items-start justify-center p-4 pt-[12vh]" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="Quick search" className="bg-white rounded-2xl w-full max-w-[600px] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2.5 px-4 border-b border-[#f0e8d6]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9a927f" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search households, members, requests or pages…"
              aria-label="Quick search"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
              className="flex-1 py-4 text-[16px] text-parish-ink bg-transparent border-none outline-none"
            />
            <kbd className="text-[11px] font-semibold text-parish-muted border border-parish-borderSoft rounded px-1.5 py-0.5">Esc</kbd>
          </div>
          <ul id={listId} role="listbox" aria-label="Results" className="list-none m-0 p-2 max-h-[min(60vh,460px)] overflow-auto">
            {results.map((r, i) => {
              const heading = r.section !== lastSection;
              lastSection = r.section;
              return (
                <React.Fragment key={r.key}>
                  {heading && <li role="presentation" className="px-3 pt-2.5 pb-1 font-bold text-[10.5px] tracking-[.14em] uppercase text-[var(--p-gold-deep)]">{r.section}</li>}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(r)}
                    className={`px-3 py-2.5 rounded-xl cursor-pointer ${i === active ? 'bg-[var(--p-blue-tint)]' : ''}`}
                  >
                    <div className="font-semibold text-[14.5px] text-parish-navy truncate">{r.title}</div>
                    {r.sub && <div className="text-[12.5px] text-parish-muted truncate">{r.sub}</div>}
                  </li>
                </React.Fragment>
              );
            })}
            {debounced.length >= 2 && searching && <li className="px-3 py-3 text-[13px] text-parish-muted" role="status">Searching…</li>}
            {debounced.length >= 2 && !searching && !results.length && <li className="px-3 py-3 text-[13px] text-parish-muted">Nothing matches “{debounced}”.</li>}
          </ul>
          <div className="px-4 py-2.5 border-t border-[#f0e8d6] bg-[#fffdf8] text-[12px] text-parish-muted flex gap-4 flex-wrap">
            <span><kbd className="font-semibold">↑ ↓</kbd> move</span><span><kbd className="font-semibold">Enter</kbd> open</span><span><kbd className="font-semibold">Ctrl K</kbd> search from anywhere</span>
          </div>
        </div>
      </div>
      )}
      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => { setOpenMemberId(null); onClose(); }} />}
    </>
  );
}
