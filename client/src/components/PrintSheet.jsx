import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { verifiedText } from './VerifiedLine.jsx';
import { formatAccessCode } from '../lib/census.js';
import { fmtDate, ageFromDob, PARTICIPATION_ITEMS, PARTICIPATION_LEVELS, HELP_WAYS } from '../constants.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, WEDDING_TYPE_LABELS } from '../lib/bisaya.js';

/** Trigger the browser print dialog for the currently rendered sheet. */
export function printHouseholdSheet() {
  window.print();
}

function sacramentLines(m) {
  const join = (parts) => parts.filter(Boolean).join(' · ');
  // "(verified)" once staff have checked the claim against a certificate or the register.
  const v = (key) => (m.verified?.[key] ? ' (verified)' : '');
  const out = [];
  if (m.has_baptism) out.push(['Baptism', (join([fmtDate(m.baptism_date), m.baptism_church]) || 'Recorded') + v('baptism')]);
  if (m.has_communion) out.push(['First Communion', (join([fmtDate(m.communion_date), m.communion_church]) || 'Recorded') + v('communion')]);
  if (m.has_confirmation) out.push(['Confirmation', (join([fmtDate(m.conf_date), m.conf_church, m.conf_name && `Name: ${m.conf_name}`, m.conf_sponsor && `Sponsor: ${m.conf_sponsor}`]) || 'Recorded') + v('confirmation')]);
  if (m.has_matrimony) out.push(['Matrimony', (join([fmtDate(m.mat_date), m.mat_church, bis(WEDDING_TYPE_LABELS, m.mat_type)]) || 'Recorded') + v('matrimony')]);
  else if (m.mat_type) out.push(['Married', bis(WEDDING_TYPE_LABELS, m.mat_type)]);
  if (!out.length) out.push(['—', 'No sacraments recorded']);
  return out;
}

/**
 * Off-screen confirmation slip for the public registration wizard, revealed by
 * the same #print-sheet print rules. The public portal has no session, so this
 * cannot call the settings API for the parish name/address — it uses the same
 * literal text the on-screen confirmation shows.
 */
export function ConfirmationPrintSheet({ refNo, accessCode, householdName }) {
  if (!refNo) return null;

  return createPortal(
    <div id="print-sheet" aria-hidden style={{ textAlign: 'center', paddingTop: 40 }}>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, letterSpacing: '.16em', textTransform: 'uppercase', color: '#a98a3f', marginBottom: 8 }}>
        Rehistro sa mga Miyembro sa Parokya
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontWeight: 600, color: '#1a2b4a', marginBottom: 2 }}>
        Our Lady of Guadalupe
      </div>
      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, color: '#34589c', marginBottom: 28 }}>
        Quasi-Parish · Mua-an
      </div>

      <div style={{ fontSize: 13, color: '#6b6552', marginBottom: 24 }}>
        {householdName ? `Narehistro na ang ${householdName}` : 'Narehistro na kini nga pamilya'} sa parokya. Susihon ug
        pamatud-an sa among kawani ang mga detalye sa dili madugay.
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: '20px 24px', display: 'inline-block', minWidth: 280 }}>
        <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#a98a3f', marginBottom: 6 }}>
          Reference Number
        </div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 34, fontWeight: 600, letterSpacing: '.06em', color: '#34589c' }}>
          {refNo}
        </div>
        {accessCode && (
          <>
            <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#a98a3f', marginTop: 16, marginBottom: 6 }}>
              Code
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 600, letterSpacing: '.12em', color: '#34589c' }}>
              {accessCode}
            </div>
            <div style={{ fontSize: 11, color: '#8a836f', marginTop: 8 }}>
              Gamita ang reference number ug kini nga code aron ma-update ang rekord sa inyong pamilya sa census.
            </div>
          </>
        )}
        <div style={{ fontSize: 11, color: '#8a836f', marginTop: 8 }}>Palihug tipigi {accessCode ? 'kini sila' : 'kini'} isip inyong rekord.</div>
      </div>

      <div style={{ marginTop: 32, fontSize: 10, color: '#8a836f' }}>Gi-print {new Date().toLocaleDateString()}</div>
    </div>,
    document.body
  );
}

/** A survey answer as a disabled checkbox; the ones picked are ticked and bold. */
function Answer({ checked, children }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 5, fontWeight: checked ? 700 : 400, color: checked ? '#17263f' : '#6b6552' }}>
      <input type="checkbox" disabled checked={checked} readOnly style={{ margin: '1px 0 0', flex: 'none' }} />
      <span>{children}</span>
    </label>
  );
}

/** The household's participation survey: how active it is, and the ways it can help. */
function ParticipationSheet({ participation, helpWays }) {
  const answers = participation || {};
  const helping = helpWays || [];
  return (
    <div style={{ fontSize: 11, marginBottom: 20 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <tbody>
          {PARTICIPATION_ITEMS.map(([key, label]) => (
            <tr key={key}>
              <td style={{ padding: '2px 0', width: 190, color: '#3f3b2f' }}>{label}</td>
              <td style={{ padding: '2px 0' }}>
                <span style={{ display: 'inline-flex', gap: 16 }}>
                  {PARTICIPATION_LEVELS.map((level) => <Answer key={level} checked={answers[key] === level}>{level}</Answer>)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ color: '#8a836f', fontWeight: 600, marginBottom: 3 }}>Ways the household can help</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 16px' }}>
        {HELP_WAYS.map(([key, label]) => <Answer key={key} checked={helping.includes(key)}>{label}</Answer>)}
      </div>
    </div>
  );
}

/**
 * Off-screen household record, revealed only by the @media print rules in
 * index.css (which target #print-sheet). Rendering nothing when there is no
 * data keeps it out of the accessibility tree.
 */
export default function PrintSheet({ data }) {
  const [parish, setParish] = useState(null);

  useEffect(() => {
    if (data && !parish) api.getSettings().then((r) => setParish(r.settings)).catch(() => {});
  }, [data, parish]);

  if (!data) return null;
  // One household, or several (bulk print), each on its own page.
  const list = Array.isArray(data) ? data : [data];

  // Rendered outside #root so the print stylesheet can hide the whole app
  // (body > #root) while keeping this sheet visible.
  return createPortal(
    <div id="print-sheet" aria-hidden>
      {list.map((d) => (
        <section key={d.household.id} className="census-page">
          <HouseholdRecord data={d} parish={parish} />
        </section>
      ))}
    </div>,
    document.body
  );
}

function HouseholdRecord({ data, parish }) {
  const { household: h, members = [], code } = data;
  const address = [h.street, h.barangay, h.city, h.province, h.zip].filter(Boolean).join(', ');
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '2px solid #1a2b4a', paddingBottom: 12, marginBottom: 20 }}>
        {parish?.logo && <img src={parish.logo} alt="" style={{ width: 64, height: 64, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, fontWeight: 600, color: '#1a2b4a' }}>
            {parish?.name || 'Our Lady of Guadalupe'}
          </div>
          <div style={{ fontSize: 12, color: '#6b6552' }}>{parish?.address || 'Quasi-Parish · Mua-an'}</div>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: '#8a836f', marginTop: 4 }}>
            Household Record
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 11, color: '#6b6552' }}>
          <div><strong>Ref:</strong> {h.ref_no || '—'}</div>
          {code && <div><strong>Census code:</strong> {formatAccessCode(code)}</div>}
          <div><strong>Status:</strong> {h.status}</div>
          {verifiedText(h) && <div>{verifiedText(h)}</div>}
          <div>Printed {new Date().toLocaleDateString()}</div>
        </div>
      </header>

      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: '0 0 8px', color: '#1a2b4a' }}>{h.household_name}</h2>
      <table style={{ width: '100%', fontSize: 12, marginBottom: 20, borderCollapse: 'collapse' }}>
        <tbody>
          {[
            ['Address', address || '—'],
            ['Parish GKK', h.gkk || '—'],
            ['Family grouping', h.family_grouping || '—'],
            ['Contact', h.contact || '—'],
            ['Email', h.email || '—'],
            ['Registered', h.created_at ? new Date(h.created_at).toLocaleDateString() : '—'],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: '3px 0', width: 130, color: '#8a836f', fontWeight: 600, verticalAlign: 'top' }}>{label}</td>
              <td style={{ padding: '3px 0', color: '#17263f' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {code && (
        <div style={{ border: '1.5px solid #34589c', borderRadius: 6, padding: '6px 10px', margin: '0 0 20px', fontSize: 10.5, color: '#1a2b4a' }}>
          <strong>Census online:</strong> adto sa <strong>{window.location.origin}/census</strong> ug ibutang ang
          Ref <strong>{h.ref_no}</strong> ug Code <strong style={{ fontSize: 12, letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{formatAccessCode(code)}</strong>.
          Ayaw ipakita kini nga code sa uban.
        </div>
      )}

      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, margin: '0 0 8px', color: '#1a2b4a' }}>
        Participation in the Parish / GKK
      </h3>
      <ParticipationSheet participation={h.participation} helpWays={h.help_ways} />

      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, margin: '0 0 8px', color: '#1a2b4a' }}>
        Members ({members.length})
      </h3>

      {members.map((m, i) => (
        <figure key={m.id} style={{ margin: '0 0 14px', border: '1px solid #ddd', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2b4a' }}>
            {i + 1}. {[m.first_name, m.middle_name, m.last_name, m.suffix].filter(Boolean).join(' ')}
          </div>
          <div style={{ fontSize: 11, color: '#6b6552', margin: '3px 0 7px' }}>
            {[
              bis(RELATIONSHIP_LABELS, m.relationship), bis(SEX_LABELS, m.sex), bis(CIVIL_STATUS_LABELS, m.civil_status),
              m.dob && `b. ${fmtDate(m.dob)} (${ageFromDob(m.dob)} yrs)`,
              m.tribe && `Tribe: ${m.tribe}`,
              m.gkk_role && `GKK: ${m.gkk_role}`,
              m.parish_role && `Parish: ${m.parish_role}`,
              m.blood_type && `Blood: ${m.blood_type}`,
              m.contact,
            ].filter(Boolean).join('  ·  ')}
          </div>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
            <tbody>
              {sacramentLines(m).map(([label, detail]) => (
                <tr key={label}>
                  <td style={{ width: 110, color: '#34589c', fontWeight: 600, verticalAlign: 'top', padding: '1px 0' }}>{label}</td>
                  <td style={{ color: '#3f3b2f', padding: '1px 0' }}>{detail}</td>
                </tr>
              ))}
              {!!(m.ministries?.length || m.organizations?.length) && (
                <tr>
                  <td style={{ width: 110, color: '#7a6a3e', fontWeight: 600, verticalAlign: 'top', padding: '1px 0' }}>Serving in</td>
                  <td style={{ color: '#3f3b2f', padding: '1px 0' }}>{[...(m.ministries || []), ...(m.organizations || [])].join(', ')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </figure>
      ))}

      <footer style={{ marginTop: 24, paddingTop: 10, borderTop: '1px solid #ddd', fontSize: 10, color: '#8a836f' }}>
        Confidential — for authorized parish staff only. Handle in accordance with the Data Privacy Act of 2012.
      </footer>
    </>
  );
}

/**
 * Off-screen copy of a generated report (Reports → Generate Report) for
 * printing: every row, not just the page shown on screen. Uses the same
 * #print-sheet print rules as the household record.
 */
export function ReportPrintSheet({ report, parish }) {
  if (!report || report.empty) return null;
  const cell = { padding: '5px 8px', borderBottom: '1px solid #e6dcc7', fontSize: 11, textAlign: 'left' };
  return createPortal(
    <div id="print-sheet" aria-hidden>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '2px solid #1a2b4a', paddingBottom: 12, marginBottom: 16 }}>
        {parish?.logo && <img src={parish.logo} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: '#1a2b4a' }}>
            {parish?.name || 'Our Lady of Guadalupe'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2b4a', marginTop: 2 }}>{report.title}</div>
          <div style={{ fontSize: 11, color: '#6b6552' }}>{report.meta} · Printed {new Date().toLocaleDateString()}</div>
        </div>
      </header>
      {/* A long report must be allowed to run across pages. */}
      <table style={{ width: '100%', borderCollapse: 'collapse', breakInside: 'auto' }}>
        <thead>
          <tr>{report.columns.map((c) => <th key={c} style={{ ...cell, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, color: '#6b6552', borderBottom: '1.5px solid #1a2b4a' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {report.rows.map((row, i) => (
            <tr key={i} style={{ breakInside: 'avoid' }}>
              {row.cells.map((c, j) => <td key={j} style={cell}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>,
    document.body
  );
}
