import React from 'react';
import { createPortal } from 'react-dom';
import { fmtDate, PARTICIPATION_ITEMS } from '../constants.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS } from '../lib/bisaya.js';
import { MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS } from '../lib/census.js';

// Short column headings for the participation grid on paper.
const ITEM_SHORT = {
  mass: 'Misa',
  bible_service: 'Bible Service',
  devotions: 'Debosyon / Rosaryo',
  meetings: 'Miting / Seminar',
  pintakasi: 'Pintakasi',
  financial: 'Pinansyal',
};

const SACRAMENT_SHORT = [['has_baptism', 'Bunyag'], ['has_communion', 'Komunyon'], ['has_confirmation', 'Kumpirma'], ['has_matrimony', 'Kasal']];

const cell = { border: '1px solid #bbb', padding: '4px 5px', verticalAlign: 'top' };
const head = { ...cell, background: '#f4efe3', fontWeight: 700, fontSize: 9.5, textAlign: 'left' };
const blankLine = { borderBottom: '1px solid #999', display: 'inline-block', minWidth: 160, height: 14 };

function fullName(m) {
  return [m.first_name, m.middle_name, m.last_name, m.suffix].filter(Boolean).join(' ');
}

/**
 * Pre-filled census forms — one page per household — for families to check
 * and correct on paper. `forms` is [{ household, members }]; `cycle` is the
 * open census; `parish` the parish settings (passed in, already loaded, so
 * the logo is there when the print dialog opens). Rendered off-screen and
 * revealed by the #print-sheet print rules in index.css, like the household
 * record.
 */
export default function CensusPrintSheet({ forms, cycle, parish }) {
  if (!forms || !forms.length) return null;

  return createPortal(
    <div id="print-sheet" aria-hidden style={{ fontSize: 11 }}>
      {forms.map(({ household: h, members }) => (
        <section key={h.id} className="census-page">
          <header style={{ display: 'flex', alignItems: 'center', gap: 14, borderBottom: '2px solid #1a2b4a', paddingBottom: 8, marginBottom: 10 }}>
            {parish?.logo && <img src={parish.logo} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} />}
            <div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 600, color: '#1a2b4a' }}>
                {parish?.name || 'Our Lady of Guadalupe'}
              </div>
              <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a836f' }}>
                Porma sa Census · {cycle?.label || 'Parish Census'}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: 10.5, color: '#3f3b2f' }}>
              <div><strong>Ref:</strong> {h.ref_no || '—'}</div>
              <div><strong>GKK:</strong> {h.gkk || '—'}</div>
              <div>Gi-print {new Date().toLocaleDateString()}</div>
            </div>
          </header>

          <p style={{ margin: '0 0 8px', fontSize: 10.5, color: '#3f3b2f' }}>
            Palihug susiha ang mga detalye sa ubos. Kung adunay sayop o kausaban, isulat ang husto sa kolum nga
            <strong> “Usba”</strong>. Lingini ang tubag sa matag miyembro: <strong>A</strong> = Aktibo, <strong>P</strong> = Panagsa,
            <strong> W</strong> = Wala.
          </p>

          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, margin: '0 0 4px', color: '#1a2b4a' }}>Pamilya: {h.household_name}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
            <thead><tr><th style={{ ...head, width: '22%' }}>Detalye</th><th style={head}>Sa rekord karon</th><th style={{ ...head, width: '38%' }}>Usba (kung sayop)</th></tr></thead>
            <tbody>
              {[
                ['Address', [h.street, h.barangay, h.city, h.province, h.zip].filter(Boolean).join(', ')],
                ['Contact', h.contact],
                ['Email', h.email],
              ].map(([label, value]) => (
                <tr key={label}><td style={cell}>{label}</td><td style={cell}>{value || '—'}</td><td style={cell} /></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: 12, margin: '0 0 4px', color: '#1a2b4a' }}>1. Mga Miyembro</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={{ ...head, width: 18 }}>#</th>
                <th style={head}>Ngalan</th>
                <th style={head}>Relasyon</th>
                <th style={head}>Natawo</th>
                <th style={head}>Civil status</th>
                <th style={head}>Sakramento</th>
                <th style={{ ...head, width: '26%' }}>Usba (kung sayop)</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id}>
                  <td style={cell}>{i + 1}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{fullName(m)}</td>
                  <td style={cell}>{bis(RELATIONSHIP_LABELS, m.relationship) || '—'}</td>
                  <td style={cell}>{fmtDate(m.dob) || '—'}</td>
                  <td style={cell}>{bis(CIVIL_STATUS_LABELS, m.civil_status) || '—'}</td>
                  <td style={cell}>{SACRAMENT_SHORT.filter(([k]) => m[k]).map(([, l]) => l).join(', ') || '—'}</td>
                  <td style={cell} />
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: 12, margin: '0 0 4px', color: '#1a2b4a' }}>2. Pag-apil sa Parokya / GKK ug Kahimtang</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={head}>Ngalan</th>
                {PARTICIPATION_ITEMS.map(([key]) => <th key={key} style={{ ...head, textAlign: 'center' }}>{ITEM_SHORT[key]}</th>)}
                <th style={{ ...head, width: '30%' }}>Kahimtang (lingini)</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td style={{ ...cell, fontWeight: 600 }}>{[m.first_name, m.last_name].join(' ')}</td>
                  {PARTICIPATION_ITEMS.map(([key]) => (
                    <td key={key} style={{ ...cell, textAlign: 'center', color: '#6b6552', whiteSpace: 'nowrap' }}>A · P · W</td>
                  ))}
                  <td style={{ ...cell, fontSize: 9.5, color: '#3f3b2f' }}>
                    {MEMBERSHIP_STATUSES.map((s) => MEMBERSHIP_STATUS_LABELS[s]).join(' / ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ fontSize: 12, margin: '0 0 4px', color: '#1a2b4a' }}>3. Bag-ong miyembro (bag-ong natawo, bag-ong minyo, ug uban pa)</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={head}>Ngalan (Apelyido, Pangalan, Tunga)</th>
                <th style={head}>Relasyon</th>
                <th style={head}>{bis(SEX_LABELS, 'Male')} / {bis(SEX_LABELS, 'Female')}</th>
                <th style={head}>Natawo</th>
                <th style={head}>Civil status</th>
                <th style={head}>Nabunyagan?</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i}>{[0, 1, 2, 3, 4, 5].map((c) => <td key={c} style={{ ...cell, height: 20 }} />)}</tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', gap: 30, fontSize: 10.5, marginTop: 8 }}>
            <div>Pirma sa Ulo sa Pamilya: <span style={blankLine} /></div>
            <div>Petsa: <span style={{ ...blankLine, minWidth: 90 }} /></div>
          </div>
          <div style={{ fontSize: 10.5, marginTop: 10 }}>Gidawat ni (GKK / kawani): <span style={blankLine} /></div>

          <footer style={{ marginTop: 12, paddingTop: 6, borderTop: '1px solid #ddd', fontSize: 9, color: '#8a836f' }}>
            Confidential — for the family and authorized parish staff only. Handle in accordance with the Data Privacy Act of 2012.
          </footer>
        </section>
      ))}
    </div>,
    document.body
  );
}
