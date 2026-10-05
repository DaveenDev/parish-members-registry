import React, { useEffect, useMemo, useRef, useState } from 'react';
import { OrgChart } from 'd3-org-chart';
// d3-org-chart animates with selection.transition(), which d3-transition adds.
import 'd3-transition';
import { escapeHtml, nameInitials, safePhotoUrl, toD3Rows } from '../../lib/orgChart.js';

const W = 236;
const H = 96;
const PERSON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/></svg>';

/** One position's card. Everything from the database is escaped. */
function cardHtml(d, showHolders) {
  const n = d.data;
  if (n.hidden) return '<div></div>';
  const name = (n.holders || []).join(', ');
  const photo = safePhotoUrl(n.photo);
  const avatar = photo
    ? `<img src="${escapeHtml(photo)}" alt="" style="width:50px;height:50px;border-radius:50%;object-fit:cover;flex:none;border:2px solid var(--p-gold)">`
    : `<div style="width:50px;height:50px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:var(--p-navy);color:#fff;font-weight:700;font-size:17px">${escapeHtml(nameInitials(name)) || PERSON}</div>`;
  const holder = !showHolders ? ''
    : name ? `<div style="font-size:13.5px;font-weight:600;color:#3f3b2f;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(name)}</div>`
      : '<div style="font-size:13px;font-style:italic;color:#6b6552">Bakante</div>';
  const note = n.note ? `<div style="font-size:12px;color:#6b6552;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(n.note)}</div>` : '';
  return `<div style="width:${d.width}px;height:${d.height}px;box-sizing:border-box;background:#fffdf8;border:1px solid #e7dcc4;border-radius:14px;box-shadow:0 6px 18px -10px rgba(26,43,74,.35);overflow:hidden;font-family:inherit">
    <div style="height:4px;background:var(--p-gold)"></div>
    <div style="display:flex;gap:10px;align-items:center;padding:10px 12px;height:calc(100% - 4px);box-sizing:border-box">
      ${showHolders ? avatar : ''}
      <div style="min-width:0;flex:1">
        <div style="font-weight:700;font-size:14.5px;color:var(--p-navy);line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(n.title)}</div>
        ${holder}${note}
      </div>
    </div>
  </div>`;
}

const BTN = 'inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border-[1.5px] border-parish-borderSoft bg-parish-card font-semibold text-[13.5px] text-parish-ink hover:border-[var(--p-blue-border)]';

/**
 * A published org chart (public_org_chart nodes), zoomable and collapsible,
 * with d3-org-chart. `showHolders` off draws the bare structure (the GKK
 * Structure outside a GKK's page). A plain list of the same positions is
 * there for screen readers.
 */
export default function OrgChartView({ nodes, showHolders = true, height = 520, fileName = 'organisasyon' }) {
  const wrap = useRef(null);
  const box = useRef(null);
  const chart = useRef(null);
  const rows = useMemo(() => toD3Rows(nodes), [nodes]);
  // Full screen: the browser's own where it can, else (iPhone) the chart
  // covers the window. Both close with Esc or the button.
  const [full, setFull] = useState(false);

  function openFull() {
    setFull(true);
    const el = wrap.current;
    const request = el?.requestFullscreen || el?.webkitRequestFullscreen;
    if (request) Promise.resolve(request.call(el)).catch(() => {});
  }

  function closeFull() {
    setFull(false);
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if ((document.fullscreenElement || document.webkitFullscreenElement) && exit) Promise.resolve(exit.call(document)).catch(() => {});
  }

  useEffect(() => {
    if (!full) return undefined;
    const onChange = () => { if (!(document.fullscreenElement || document.webkitFullscreenElement)) setFull(false); };
    const onKey = (e) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [full]);

  // The chart box changes size going in and out of full screen: redraw to
  // fit (not on first load, which draws the chart itself).
  const wasFull = useRef(full);
  useEffect(() => {
    if (wasFull.current === full) return undefined;
    wasFull.current = full;
    const id = setTimeout(() => {
      const c = chart.current;
      const h = box.current?.clientHeight;
      if (c && h) c.svgHeight(h).render().fit({ animate: false });
    }, 50);
    return () => clearTimeout(id);
  }, [full]);

  useEffect(() => {
    if (!box.current || !rows.length) return undefined;
    const narrow = box.current.clientWidth < 640;
    const c = new OrgChart()
      .container(box.current)
      .data(rows.map((r) => ({ ...r })))
      .svgHeight(box.current.clientHeight || height)
      .nodeWidth((d) => (d.data.hidden ? 1 : W))
      .nodeHeight((d) => (d.data.hidden ? 1 : H))
      .childrenMargin(() => 56)
      .siblingsMargin(() => 18)
      .compactMarginBetween(() => 22)
      .compactMarginPair(() => 60)
      .compact(narrow)
      .initialExpandLevel(99)
      .nodeDefaultBackground('none')
      .nodeContent((d) => cardHtml(d, showHolders))
      .nodeUpdate(function update(d) {
        // The hidden root (several top positions) has no card and no button.
        if (d.data.hidden) this.querySelector('.node-button-g')?.setAttribute('display', 'none');
      })
      .linkUpdate(function update(d) {
        const fromHidden = d.parent?.data?.hidden;
        this.setAttribute('stroke', fromHidden ? 'transparent' : '#c9b98f');
        this.setAttribute('stroke-width', '1.5');
      })
      .render();
    chart.current = c;
    requestAnimationFrame(() => c.fit({ animate: false }));

    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const h = box.current?.clientHeight;
        if (h) c.svgHeight(h).render().fit({ animate: false });
      }, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      chart.current = null;
      if (box.current) box.current.innerHTML = '';
    };
  }, [rows, showHolders, height]);

  return (
    <div ref={wrap} className={full ? 'fixed inset-0 z-[100] flex flex-col bg-parish-bg p-3 sm:p-4' : ''}>
      <div className="flex flex-wrap gap-2 mb-2.5">
        <button type="button" className={BTN} onClick={full ? closeFull : openFull}>
          {full ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          )}
          {full ? 'Isira ang Full Screen' : 'I-Full Screen'}
        </button>
        <button type="button" className={BTN} onClick={() => chart.current?.fit()}>Ihaum sa screen</button>
        <button type="button" className={BTN} onClick={() => chart.current?.expandAll().fit()}>Ablihi tanan</button>
        <button type="button" className={BTN} onClick={() => chart.current?.collapseAll().fit()}>Tikopa</button>
        <button type="button" className={BTN} onClick={() => chart.current?.exportImg({ full: true, save: true, backgroundColor: '#fffdf8', imageName: fileName })}>I-download (PNG)</button>
      </div>
      <div
        ref={box} aria-hidden="true"
        className={`w-full rounded-2xl border border-parish-border bg-[#fbf7ef] overflow-hidden ${full ? 'flex-1 min-h-0' : ''}`}
        style={full ? undefined : { height: `min(${height}px, 70vh)` }}
      />
      <p className="m-0 mt-2 text-[12.5px] text-parish-text2">I-drag aron molihok, i-pinch o i-scroll aron mo-zoom. I-tap ang button sa ubos sa usa ka katungdanan aron ablihan o tikopon.</p>
      <div className="sr-only"><PositionList rows={rows} parentId={null} showHolders={showHolders} /></div>
    </div>
  );
}

/** The chart as nested lists, for screen readers. */
function PositionList({ rows, parentId, showHolders }) {
  const here = rows.filter((r) => r.parentId === parentId);
  if (!here.length) return null;
  return (
    <ul>
      {here.map((r) => (r.hidden ? <li key={r.id}><PositionList rows={rows} parentId={r.id} showHolders={showHolders} /></li> : (
        <li key={r.id}>
          {r.title}{showHolders ? `: ${(r.holders || []).join(', ') || 'Bakante'}` : ''}{r.note ? ` (${r.note})` : ''}
          <PositionList rows={rows} parentId={r.id} showHolders={showHolders} />
        </li>
      )))}
    </ul>
  );
}
