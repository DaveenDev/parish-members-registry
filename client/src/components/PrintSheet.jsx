import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { fmtDate, ageFromDob } from '../constants.js';

/** Trigger the browser print dialog for the currently rendered sheet. */
export function printHouseholdSheet() {
  window.print();
}

function sacramentLines(m) {
  const join = (parts) => parts.filter(Boolean).join(' · ');
  const out = [];
  if (m.has_baptism) out.push(['Baptism', join([fmtDate(m.baptism_date), m.baptism_church]) || 'Recorded']);
  if (m.has_communion) out.push(['First Communion', join([fmtDate(m.communion_date), m.communion_church]) || 'Recorded']);
  if (m.has_confirmation) out.push(['Confirmation', join([fmtDate(m.conf_date), m.conf_church, m.conf_name && `Name: ${m.conf_name}`, m.conf_sponsor && `Sponsor: ${m.conf_sponsor}`]) || 'Recorded']);
  if (m.has_matrimony) out.push(['Matrimony', join([fmtDate(m.mat_date), m.mat_church, m.mat_type]) || 'Recorded']);
  if (!out.length) out.push(['—', 'No sacraments recorded']);
  return out;
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

  const { household: h, members = [] } = data;
  const address = [h.street, h.barangay, h.city, h.province, h.zip].filter(Boolean).join(', ');

  // Rendered outside #root so the print stylesheet can hide the whole app
  // (body > #root) while keeping this sheet visible.
  return createPortal(
    <div id="print-sheet" aria-hidden>
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
          <div><strong>Status:</strong> {h.status}</div>
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

      <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, margin: '0 0 8px', color: '#1a2b4a' }}>
        Members ({members.length})
      </h3>

      {members.map((m, i) => (
        <figure key={m.id} style={{ margin: '0 0 14px', border: '1px solid #ddd', borderRadius: 6, padding: '10px 12px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2b4a' }}>
            {i + 1}. {[m.first_name, m.middle_name, m.last_name].filter(Boolean).join(' ')}
          </div>
          <div style={{ fontSize: 11, color: '#6b6552', margin: '3px 0 7px' }}>
            {[
              m.relationship, m.sex, m.civil_status,
              m.dob && `b. ${fmtDate(m.dob)} (${ageFromDob(m.dob)} yrs)`,
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
    </div>,
    document.body
  );
}
