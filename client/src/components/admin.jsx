import React from 'react';

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="sticky top-0 z-10 bg-parish-bg/90 backdrop-blur-md border-b border-parish-border px-[26px] py-[18px] flex items-center justify-between gap-4 flex-wrap" style={{ padding: '18px 26px' }}>
      <div>
        <h1 className="font-serif text-[clamp(24px,3vw,30px)] font-semibold m-0 text-parish-navy">{title}</h1>
        {subtitle && <div className="text-[13.5px] text-parish-muted mt-0.5">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">{children}</div>
    </div>
  );
}

export function PageBody({ children }) {
  return <div className="p-[26px] flex-1" style={{ padding: '26px' }}>{children}</div>;
}

export function FilterSelect(props) {
  return (
    <select
      {...props}
      className="px-3 py-2.5 text-[13.5px] text-parish-ink bg-[#fffdf8] border-[1.5px] border-parish-borderSoft rounded-lg outline-none cursor-pointer"
    />
  );
}

export function SearchInput(props) {
  return (
    <div className="relative">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9a927f" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
      </svg>
      <input
        {...props}
        className="w-[min(320px,42vw)] pl-9 pr-3.5 py-2.5 text-[14.5px] text-parish-ink bg-[#fffdf8] border-[1.5px] border-parish-borderSoft rounded-xl outline-none focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15"
      />
    </div>
  );
}

export function DataTable({ columns, children, minWidth = 700, footer }) {
  return (
    <div className="bg-[#fffdf8] border border-parish-border rounded-2xl overflow-hidden shadow-cardSm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth }}>
          <thead>
            <tr className="bg-[#f4efe3]">
              {columns.map((c) => (
                <th
                  key={c.key || c.label}
                  onClick={c.onSort}
                  className={`text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2 whitespace-nowrap ${c.onSort ? 'cursor-pointer' : ''} ${c.align === 'center' ? 'text-center' : c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.label} {c.arrow || ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function EmptyState({ title, subtitle }) {
  return (
    <div className="py-14 px-5 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d3c8ad" strokeWidth="1.6" className="mx-auto mb-3"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
      <div className="font-serif text-[22px] text-parish-navy mb-1">{title}</div>
      {subtitle && <div className="text-[14px] text-parish-muted">{subtitle}</div>}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }) {
  if (total <= pageSize) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const buttons = [];
  for (let i = 1; i <= pageCount; i++) buttons.push(i);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-t border-[#f1e8d5] flex-wrap">
      <div className="flex items-center gap-3">
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="px-2.5 py-1.5 text-[13px] text-parish-ink bg-[#fffdf8] border-[1.5px] border-parish-borderSoft rounded-lg outline-none cursor-pointer">
          <option value={10}>10 / page</option><option value={20}>20 / page</option><option value={50}>50 / page</option>
        </select>
        <div className="text-[13px] text-parish-muted">Showing {from}–{to} of {total}</div>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1} className="appearance-none cursor-pointer px-3 py-1.5 rounded-lg border-[1.5px] border-parish-borderSoft font-semibold text-[13px] bg-white disabled:opacity-50">Prev</button>
        {buttons.map((n) => (
          <button
            key={n} onClick={() => onPage(n)}
            className="appearance-none cursor-pointer min-w-[34px] px-2.5 py-1.5 rounded-lg font-semibold text-[13px] border-[1.5px]"
            style={{ borderColor: n === page ? 'var(--p-blue)' : '#e0d6c1', background: n === page ? 'var(--p-blue)' : '#fff', color: n === page ? '#fff' : '#17263f' }}
          >
            {n}
          </button>
        ))}
        <button onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page === pageCount} className="appearance-none cursor-pointer px-3 py-1.5 rounded-lg border-[1.5px] border-parish-borderSoft font-semibold text-[13px] bg-white disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}
