import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BigButton, INNER, Spin } from '../../components/site/kit.jsx';
import { api } from '../../api.js';
import { certTypeLabel } from '../../lib/requests.js';
import { fmtLong } from '../../lib/site.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { usePortalStatus } from './data.js';

const STAGES = [
  ['Received', 'Nadawat'],
  ['Being prepared', 'Giandam'],
  ['Ready for pick-up', 'Andam na kuhaon'],
];

const CERT_BIS = { baptism: 'Sertipiko sa Bunyag', confirmation: 'Sertipiko sa Kumpil', matrimony: 'Sertipiko sa Kasal' };

/** Look up a household registration (OLG-…) or a certificate request (CR-…) by reference number. */
export default function CheckStatus() {
  useSiteTitle('Susiha ang Rehistro');
  const [params] = useSearchParams();
  const [ref, setRef] = useState(params.get('ref') || '');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const portal = usePortalStatus().data;

  async function check(e) {
    e?.preventDefault();
    const value = ref.trim().toUpperCase();
    if (!value) { setResult({ kind: 'empty' }); return; }
    setChecking(true);
    setResult(null);
    try {
      if (value.startsWith('CR-')) {
        const r = await api.certificateRequestStatus(value);
        setResult(r ? { kind: 'request', ...r } : { kind: 'notfound', ref: value });
      } else {
        const r = await api.registrationStatus(value);
        if (!r) setResult({ kind: 'notfound', ref: value });
        else setResult({ kind: r.status === 'Verified' ? 'verified' : 'received', ...r });
      }
    } catch (err) {
      setResult(/Daghan na kaayo/i.test(err.message) ? { kind: 'limit' } : { kind: 'error' });
    } finally {
      setChecking(false);
    }
  }

  // Arriving from a form's "Susiha ang status" button: check straight away.
  useEffect(() => { if (params.get('ref')) check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className={`${INNER} lg:max-w-[1080px] lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start`}>
      <div>
      <h1 className="font-serif font-semibold text-[31px] lg:text-[42px] leading-[1.1] lg:leading-[1.06] m-0 mb-1.5 lg:mb-2 text-parish-navy">Susiha ang inyong rehistro o hangyo</h1>
      <p className="m-0 mb-4 text-[15.5px] leading-normal text-[#4d4636]">Isulat ang reference number. Ang ngalan sa pamilya ug status lang ang ipakita.</p>

      <div aria-hidden="true" className="bg-white border border-parish-borderSoft rounded-xl px-3.5 py-3 mb-4 -rotate-1" style={{ boxShadow: '0 8px 18px -14px rgba(23,38,63,.4)' }}>
        <div className="flex items-center gap-1.5 text-parish-gold mb-1.5"><Icon name="cross" size={16} /><span className="font-semibold text-[11px] text-parish-text2">Confirmation slip</span></div>
        <div className="h-1.5 w-[70%] bg-[#efe6d3] rounded mb-[5px]" />
        <div className="h-1.5 w-1/2 bg-[#efe6d3] rounded mb-2.5" />
        <div className="font-semibold text-[10px] tracking-[.14em] uppercase text-parish-text2">Inyong reference number</div>
        <div className="inline-block mt-0.5 px-1.5 py-0.5 border-2 border-dashed border-parish-gold rounded-md font-serif text-[20px] font-bold tracking-[.06em] text-parish-blue">OLG-2026-XXXXXX</div>
        <div className="text-[12.5px] text-[#4d4636] mt-1.5">Makita kini sa inyong confirmation slip. Ang hangyo sa sertipiko nagsugod sa CR-.</div>
      </div>

      <form onSubmit={check}>
        <label htmlFor="ref-in" className="block font-bold text-[14px] mb-1.5">Reference number</label>
        <input
          id="ref-in"
          value={ref}
          onChange={(e) => setRef(e.target.value.toUpperCase())}
          placeholder="OLG-2026-XXXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="w-full min-h-[54px] px-3.5 font-semibold text-[19px] tracking-[.04em] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-[14px] outline-none focus:border-parish-blue mb-2.5"
        />
        <button type="submit" disabled={checking} className="w-full min-h-[54px] rounded-[14px] bg-parish-blue text-white font-bold text-[16.5px] flex items-center justify-center gap-2.5 disabled:opacity-80">
          {checking ? <><Spin />Gisusi…</> : 'Susiha'}
        </button>
      </form>
      </div>

      <div aria-live="polite" className="mt-[18px] lg:mt-0 lg:pt-3 lg:min-h-[200px]">
        {result && <Result r={result} censusOpen={!!portal?.open} />}
      </div>
    </main>
  );
}

function Result({ r, censusOpen }) {
  switch (r.kind) {
    case 'empty':
      return <div className="text-parish-error font-semibold text-[14.5px]">Palihug isulat ang reference number.</div>;
    case 'received':
      return (
        <div className="bg-parish-card border border-parish-border rounded-2xl p-4">
          <span className="inline-flex items-center gap-1.5 font-bold text-[13px] text-parish-blueDeep border rounded-full px-2.5 py-1" style={{ background: 'var(--p-blue-tint)', borderColor: 'var(--p-blue-border)' }}>
            <Icon name="clock" size={14} />Nadawat
          </span>
          <div className="font-serif text-[23px] font-bold text-parish-navy mt-2.5 mb-1">{r.household_name}</div>
          <p className="m-0 text-[15.5px] leading-normal text-[#3f3b2f]">Nadawat namo ang inyong rehistro sa {fmtLong(r.registered_on)}. Gisusi pa sa kawani.</p>
          {censusOpen && <BigButton variant="secondary" to="/census" className="mt-3.5">I-update ang among rekord</BigButton>}
        </div>
      );
    case 'verified':
      return (
        <div className="bg-parish-okBg border border-parish-okBorder rounded-2xl p-4">
          <span className="inline-flex items-center gap-1.5 font-bold text-[13px] text-white bg-parish-ok rounded-full px-2.5 py-1"><Icon name="check" size={14} />Napamatud-an</span>
          <div className="font-serif text-[23px] font-bold text-[#1f4a31] mt-2.5 mb-1">{r.household_name}</div>
          <p className="m-0 text-[15.5px] leading-normal text-parish-ok">Napamatud-an na ang inyong rehistro.</p>
        </div>
      );
    case 'request':
      return <RequestStatus r={r} />;
    case 'notfound':
      return (
        <div className="bg-parish-card border border-dashed border-[#d9cdb4] rounded-2xl p-4">
          <div className="font-serif text-[22px] font-bold text-parish-navy mb-1 break-words">Wala namo makit-i ang {r.ref}</div>
          <p className="m-0 mb-3 text-[15px] leading-normal text-[#4d4636]">
            Susiha kung sakto ang mga letra ug numero. Kung bag-o pa lang kamo nagparehistro, sulayi pag-usab ugma. Kung wala gihapon, tawagi ang opisina.
          </p>
          <BigButton variant="secondary" to="/kontak" className="!w-auto inline-flex px-4 min-h-[46px]">Kontaka ang opisina</BigButton>
        </div>
      );
    case 'limit':
      return (
        <div className="flex gap-2.5 bg-parish-errorBg border border-parish-errorBorder rounded-[14px] p-3.5 text-parish-error">
          <Icon name="alert" />
          <div className="text-[15px] leading-normal"><strong>Daghan na kaayo nga pagsulay.</strong> Sulayi pag-usab sa ulahi.</div>
        </div>
      );
    default:
      return (
        <div className="flex gap-2.5 bg-parish-errorBg border border-parish-errorBorder rounded-[14px] p-3.5 text-parish-error">
          <Icon name="alert" />
          <div className="text-[15px] leading-normal">Wala ma-susi. Susiha ang inyong koneksyon ug sulayi pag-usab.</div>
        </div>
      );
  }
}

function RequestStatus({ r }) {
  const released = r.status === 'Released';
  const cannot = r.status === 'Cannot issue';
  const at = released ? STAGES.length : Math.max(0, STAGES.findIndex(([k]) => k === r.status));
  return (
    <div className="bg-parish-card border border-parish-border rounded-2xl p-4">
      <div className="font-bold text-[11.5px] tracking-[.16em] uppercase text-[var(--p-eyebrow)]">Hangyo · {r.ref_no}</div>
      <div className="font-serif text-[23px] font-bold text-parish-navy mt-0.5 mb-3.5">{CERT_BIS[r.cert_type] || certTypeLabel(r.cert_type)}</div>
      {cannot ? (
        <p className="m-0 mb-3 text-[15.5px] leading-normal text-[#3f3b2f]">Dili ma-issue ang sertipiko. Palihug kontaka ang opisina.</p>
      ) : (
        <ol className="list-none m-0 p-0">
          {STAGES.map(([key, label], i) => {
            const done = i < at;
            const now = i === at;
            return (
              <li key={key} className="flex gap-3 items-start pb-3.5">
                <div
                  className="w-8 h-8 flex-none rounded-full border-2 flex items-center justify-center font-bold text-[14px]"
                  style={{
                    background: done ? '#2f6b48' : now ? 'var(--p-blue)' : '#fffdf8',
                    borderColor: done ? '#2f6b48' : now ? 'var(--p-blue)' : '#e0d6c1',
                    color: done || now ? '#fff' : '#6b6552',
                  }}
                >
                  {done ? <Icon name="check" size={15} /> : i + 1}
                </div>
                <div className="pt-[5px]">
                  <div className="font-semibold text-[15.5px]">{label}</div>
                  <div className="text-[13px] text-parish-text2">{now ? `Karon · ${fmtLong(r.updated_on)}` : done ? 'Nahuman' : ''}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {released && <p className="m-0 mb-3 text-[15px] text-parish-ok font-semibold">Nakuha na ang sertipiko.</p>}
      {r.note && <p className="m-0 mb-3 text-[15px] leading-normal text-[#3f3b2f]"><strong>Nota gikan sa kawani:</strong> {r.note}</p>}
      {!released && !cannot && (
        <div className="flex gap-2 items-center text-[14px] text-[#4d4636] bg-parish-bg rounded-[10px] px-3 py-2.5"><Icon name="idcard" size={18} />Kinahanglan og ID inig kuha.</div>
      )}
      {cannot && <Link to="/kontak" className="font-bold text-parish-blue">Kontaka ang opisina</Link>}
    </div>
  );
}
