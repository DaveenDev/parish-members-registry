import React from 'react';
import { createPortal } from 'react-dom';

/**
 * A table report on paper: the parish heading, the report's title and
 * scope, the table (numbers right-aligned, the last row as the total when
 * `total`), and an optional note under it. `report` is { title, columns,
 * rows } (e.g. lib/census.js vsLastYearTable()), or null to print nothing.
 */
export default function ReportPrintSheet({ report, parish, scope = '', note = '', total = true }) {
  if (!report || !report.rows?.length) return null;
  const numeric = report.columns.map((_, i) => i > 0 && report.rows.every((r) => r[i] === '' || r[i] == null || /^-?\d+(\.\d+)?%?$/.test(String(r[i]))));
  const cell = { padding: '5px 8px', borderBottom: '1px solid #ddd', fontSize: 11 };
  const head = { ...cell, fontWeight: 700, fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1.5px solid #000', verticalAlign: 'bottom' };
  return createPortal(
    <div id="print-sheet" aria-hidden style={{ fontSize: 11, color: '#000', background: '#fff' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 12 }}>
        {parish?.logo && <img src={parish.logo} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 21, fontWeight: 600 }}>{parish?.name || 'Our Lady of Guadalupe'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{report.title}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 10.5 }}>
          {scope && <div><strong>{scope}</strong></div>}
          <div>Printed {new Date().toLocaleString()}</div>
        </div>
      </header>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{report.columns.map((c, i) => <th key={c} style={{ ...head, textAlign: numeric[i] ? 'right' : 'left' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {report.rows.map((r, ri) => {
            const isTotal = total && ri === report.rows.length - 1;
            return (
              <tr key={ri} style={{ breakInside: 'avoid', background: isTotal ? '#f1f1f1' : undefined, fontWeight: isTotal ? 700 : 400 }}>
                {r.map((v, i) => <td key={i} style={{ ...cell, textAlign: numeric[i] ? 'right' : 'left', borderTop: isTotal ? '1.5px solid #000' : undefined }}>{v === '' || v == null ? '—' : v}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
      {note && <p style={{ margin: '8px 0 0', fontSize: 10 }}>{note}</p>}
    </div>,
    document.body
  );
}
