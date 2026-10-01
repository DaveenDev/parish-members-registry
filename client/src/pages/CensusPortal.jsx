import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Field, TextInput, Select, Checkbox, Card, PrimaryButton, GhostButton, Spinner } from '../components/ui.jsx';
import CreditFooter from '../components/CreditFooter.jsx';
import { HEAD, RELATIONSHIPS, CIVIL_STATUSES, PARTICIPATION_ITEMS, PARTICIPATION_LEVELS } from '../constants.js';
import { bis, portalErrorInBisaya, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS } from '../lib/bisaya.js';
import { toNameCase, toSuffixCase } from '../lib/util.js';
import { MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS, suggestStatus, portalPayload, formatAccessCode } from '../lib/census.js';

const BG = { background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' };
const GRID = { gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))' };
const SACRAMENTS_SHORT = [['has_baptism', 'Bunyag'], ['has_communion', 'Komunyon'], ['has_confirmation', 'Kumpirma'], ['has_matrimony', 'Kasal']];
const NEW_RELATIONSHIPS = RELATIONSHIPS.filter((r) => r !== HEAD);

function blankNewMember(lastName = '') {
  return { first_name: '', middle_name: '', last_name: lastName, suffix: '', relationship: '', sex: '', dob: '', civil_status: '', contact: '', status: '', participation: {}, notes: '', statusPicked: false };
}

/** Form state from what portal_open() returned. */
function formFrom(data) {
  const asText = (v) => (v === null || v === undefined ? '' : String(v));
  const text = (obj, keys) => Object.fromEntries(keys.map((k) => [k, asText(obj[k])]));
  return {
    household: text(data.household, ['street', 'barangay', 'city', 'province', 'zip', 'contact', 'email']),
    members: data.members.map((m) => ({
      ...m,
      ...text(m, ['first_name', 'middle_name', 'last_name', 'suffix', 'relationship', 'sex', 'dob', 'civil_status', 'contact', 'notes']),
      status: m.status || '',
      participation: m.participation || {},
      statusPicked: !!m.status,
    })),
    newMembers: (data.newMembers || []).map((m) => ({
      ...blankNewMember(),
      ...text(m.fields || {}, ['first_name', 'middle_name', 'last_name', 'suffix', 'relationship', 'sex', 'dob', 'civil_status', 'contact']),
      status: m.status || '',
      participation: m.participation || {},
      notes: asText(m.notes),
      statusPicked: !!m.status,
    })),
    message: asText(data.message),
    consent: false,
  };
}

/**
 * Census family portal: during an open census a family opens its record with
 * the reference number and access code from its printed census form, checks
 * its details and answers the census. What it sends is reviewed by staff
 * before anything in the registry changes.
 */
export default function CensusPortal() {
  const [params] = useSearchParams();
  const [screen, setScreen] = useState('signin'); // signin | form | done
  const [status, setStatus] = useState(null);
  const [refNo, setRefNo] = useState(params.get('ref') || '');
  const [code, setCode] = useState('');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    api.portalStatus().then(setStatus).catch(() => setStatus({ open: false }));
    api.publicParishLogo().then(setLogo).catch(() => {});
  }, []);

  const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  async function open(e) {
    e && e.preventDefault();
    setError('');
    if (!refNo.trim() || !code.trim()) { setError('Ibutang ang reference number ug ang code.'); return; }
    setBusy(true);
    try {
      const res = await api.portalOpen(refNo.trim(), code.trim());
      if (!res?.ok) { setError(portalErrorInBisaya(res?.error)); return; }
      setData(res);
      setForm(formFrom(res));
      setScreen('form');
      top();
    } catch (err) {
      setError(portalErrorInBisaya(err.message));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError('');
    const missing = form.newMembers.find((m) => (m.first_name || m.last_name || m.relationship) && (!m.first_name.trim() || !m.last_name.trim() || !m.relationship));
    if (missing) { setError('Ibutang ang pangalan, apelyido ug relasyon sa matag bag-ong miyembro.'); return; }
    if (!form.consent) { setError('Palihug i-tsek ang pagtugot sa data privacy sa ubos.'); return; }
    setBusy(true);
    try {
      const res = await api.portalSubmit(refNo.trim(), code.trim(), portalPayload(form));
      if (!res?.ok) { setError(portalErrorInBisaya(res?.error)); return; }
      setScreen('done');
      top();
    } catch (err) {
      setError(portalErrorInBisaya(err.message));
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setData(null); setForm(null); setCode(''); setError(''); setScreen('signin'); top();
  }

  const header = (
    <div className="text-center mb-6">
      <div className="flex justify-center mb-2 text-parish-gold">
        {logo ? <img src={logo} alt="Parish logo" className="w-[64px] h-[64px] object-contain" /> : <span className="text-[40px]" aria-hidden>✝</span>}
      </div>
      <div className="font-semibold text-[12.5px] tracking-[.2em] uppercase text-[var(--p-gold-deep)]">{status?.label || 'Census sa Parokya'}</div>
      <h1 className="font-serif font-semibold text-[clamp(30px,6vw,42px)] leading-tight m-0 text-parish-navy">Our Lady of Guadalupe</h1>
    </div>
  );

  if (screen === 'done') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 py-12" style={BG}>
        <div className="max-w-[520px] animate-fadeUp">
          <div className="w-[76px] h-[76px] rounded-full bg-[#eaf4ee] flex items-center justify-center mx-auto mb-5 text-[#3a8a5e]">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <h1 className="font-serif font-semibold text-[clamp(30px,6vw,42px)] leading-tight m-0 mb-3 text-parish-navy">Salamat sa inyong pag-update!</h1>
          <p className="text-[16px] leading-relaxed text-parish-text2 mb-6">
            Nadawat na sa parokya ang census sa <strong>{data?.household.household_name}</strong>. Susihon kini sa among kawani
            una kini ibutang sa rehistro. Kung adunay sayop, mahimo pa ninyo kining usbon samtang wala pa nasusi.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <GhostButton onClick={() => open()} className="px-6 py-3 text-[15px]">Usba pag-usab</GhostButton>
            <PrimaryButton onClick={signOut} className="px-6 py-3 text-[15px]">Human na</PrimaryButton>
          </div>
          <CreditFooter inline />
        </div>
      </div>
    );
  }

  if (screen === 'signin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={BG}>
        <div className="w-full max-w-[440px] animate-fadeUp">
          {header}
          {status && !status.open ? (
            <Card className="p-6 text-center">
              <p className="text-[16px] text-parish-text2 m-0">{portalErrorInBisaya('closed')}</p>
            </Card>
          ) : (
            <Card className="p-6">
              <h2 className="font-serif text-[24px] font-semibold text-parish-navy m-0 mb-1">I-update ang inyong rekord</h2>
              <p className="text-[14.5px] text-parish-text2 mt-0 mb-5">
                Ibutang ang <strong>reference number</strong> ug ang <strong>code</strong> nga anaa sa inyong census form gikan sa parokya.
              </p>
              <form onSubmit={open} className="flex flex-col gap-4">
                <Field label="Reference number"><TextInput value={refNo} onChange={(e) => setRefNo(e.target.value.toUpperCase())} placeholder="OLG-2026-XXXXXX" autoComplete="off" /></Field>
                <Field label="Code"><TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} onBlur={() => setCode((c) => formatAccessCode(c))} placeholder="XXXX-XXXX" autoComplete="off" /></Field>
                {error && <div role="alert" className="text-parish-error text-[14px] font-medium">{error}</div>}
                <PrimaryButton type="submit" disabled={busy} className="py-3.5 text-[16px]">{busy ? <Spinner /> : 'Ablihi ang among rekord'}</PrimaryButton>
              </form>
            </Card>
          )}
          <div className="text-center mt-6">
            <Link to="/" className="font-semibold text-[14px] text-parish-blue">← Balik sa panid sa rehistro</Link>
          </div>
          <CreditFooter inline />
        </div>
      </div>
    );
  }

  const setHousehold = (k, v) => setForm((f) => ({ ...f, household: { ...f.household, [k]: v } }));
  const updateList = (list, i, patch) => setForm((f) => {
    const rows = f[list].slice();
    const next = { ...rows[i], ...patch };
    if ('participation' in patch && !next.statusPicked) next.status = suggestStatus(next.participation) || '';
    rows[i] = next;
    return { ...f, [list]: rows };
  });
  const head = form.members.find((m) => m.relationship === HEAD);

  return (
    <div className="min-h-screen px-4 py-10" style={BG}>
      <div className="max-w-[760px] mx-auto">
        {header}
        <Card className="p-5 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-serif text-[24px] font-semibold text-parish-navy">{data.household.household_name}</div>
              <div className="text-[13.5px] text-parish-muted">{[data.household.ref_no, data.household.gkk].filter(Boolean).join(' · ')}</div>
            </div>
            <GhostButton onClick={signOut} className="px-4 py-2 text-[13.5px]">Gawas</GhostButton>
          </div>
          {data.pending && (
            <div className="mt-4 px-4 py-3 rounded-xl bg-[#fdf1de] text-[#7a5a1f] text-[14px]">
              Nakapadala na mo og update niadtong {new Date(data.pending.submittedAt).toLocaleDateString()}. Wala pa kini nasusi sa kawani —
              ang ipadala ninyo karon mopuli niini.
            </div>
          )}
          <p className="text-[14.5px] text-parish-text2 mt-4 mb-0">
            Susiha ang mga detalye ug usba kung sayop. Para sa matag miyembro, tubaga kung unsa ka aktibo sa parokya o GKK:
            <strong> Aktibo</strong>, <strong>Panagsa</strong>, o <strong>Wala</strong>.
          </p>
        </Card>

        <Section title="Address ug kontak sa pamilya">
          <div className="grid gap-4" style={GRID}>
            <Field label="Kalye / Purok"><TextInput value={form.household.street} onChange={(e) => setHousehold('street', e.target.value)} /></Field>
            <Field label="Barangay"><TextInput value={form.household.barangay} onChange={(e) => setHousehold('barangay', e.target.value)} /></Field>
            <Field label="Siyudad / Lungsod"><TextInput value={form.household.city} onChange={(e) => setHousehold('city', e.target.value)} /></Field>
            <Field label="Probinsya"><TextInput value={form.household.province} onChange={(e) => setHousehold('province', e.target.value)} /></Field>
            <Field label="ZIP code"><TextInput value={form.household.zip} onChange={(e) => setHousehold('zip', e.target.value)} inputMode="numeric" /></Field>
            <Field label="Numero sa kontak"><TextInput value={form.household.contact} onChange={(e) => setHousehold('contact', e.target.value)} inputMode="tel" /></Field>
            <Field label="Email"><TextInput value={form.household.email} onChange={(e) => setHousehold('email', e.target.value)} inputMode="email" /></Field>
          </div>
        </Section>

        <Section title={`Mga miyembro (${form.members.length})`}>
          <div className="flex flex-col gap-4">
            {form.members.map((m, i) => (
              <MemberCard key={m.id} member={m} onChange={(patch) => updateList('members', i, patch)} />
            ))}
          </div>
        </Section>

        <Section title="Bag-ong miyembro">
          <p className="text-[14px] text-parish-text2 mt-0">Bag-ong natawo, bag-ong minyo, o bag-ong nipuyo sa inyong panimalay.</p>
          <div className="flex flex-col gap-4">
            {form.newMembers.map((m, i) => (
              <MemberCard
                key={i}
                member={m}
                isNew
                onChange={(patch) => updateList('newMembers', i, patch)}
                onRemove={() => setForm((f) => ({ ...f, newMembers: f.newMembers.filter((_, j) => j !== i) }))}
              />
            ))}
          </div>
          {form.newMembers.length < 10 && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, newMembers: [...f.newMembers, blankNewMember(head?.last_name || '')] }))}
              className="mt-3 w-full appearance-none cursor-pointer py-3.5 font-bold text-[15px] text-parish-blue bg-white border-[1.5px] border-dashed border-[#b9c6de] rounded-xl hover:bg-[#f4f7fc]"
            >
              + Idugang ang bag-ong miyembro
            </button>
          )}
        </Section>

        <Section title="Mensahe sa parokya (kung naa)">
          <textarea
            value={form.message}
            maxLength={1000}
            rows={3}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            className="w-full px-3.5 py-3 text-[16px] text-parish-ink bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-xl outline-none focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15"
            aria-label="Mensahe sa parokya"
          />
        </Section>

        <Card className="p-5 mb-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox checked={form.consent} onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))} className="mt-1 flex-none" />
            <span className="text-[14.5px] leading-relaxed text-parish-text2">
              Nagtugot ako nga gamiton sa parokya kini nga impormasyon para sa rehistro sa mga miyembro, subay sa Data Privacy Act of 2012.
              Makita lamang kini sa awtorisadong kawani sa parokya.
            </span>
          </label>
        </Card>

        {error && <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-parish-errorBg text-parish-error text-[14.5px] font-medium">{error}</div>}
        <div className="flex justify-end gap-3 mb-8">
          <GhostButton onClick={signOut} className="px-5 py-3.5 text-[15px]">Kanselahon</GhostButton>
          <PrimaryButton onClick={submit} disabled={busy} className="px-8 py-3.5 text-[16px]">{busy ? 'Ginapadala…' : 'Ipadala sa parokya'}</PrimaryButton>
        </div>
        <CreditFooter inline />
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <Card className="p-5 mb-5">
      <h2 className="font-serif text-[21px] font-semibold text-parish-navy mt-0 mb-4">{title}</h2>
      {children}
    </Card>
  );
}

function MemberCard({ member: m, isNew = false, onChange, onRemove }) {
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  const tidy = (k, format = toNameCase) => (e) => onChange({ [k]: format(e.target.value) });
  const suggestion = suggestStatus(m.participation);
  const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'Bag-ong miyembro';
  const relationships = isNew ? NEW_RELATIONSHIPS : RELATIONSHIPS;

  return (
    <div className="border border-[#eee3ce] rounded-xl bg-[#fdfbf6] p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[16px] text-parish-navy">{name}</div>
          {!isNew && (
            <div className="text-[12.5px] text-parish-muted">
              Sakramento: {SACRAMENTS_SHORT.filter(([k]) => m[k]).map(([, l]) => l).join(', ') || 'wala pa narekord'}
            </div>
          )}
        </div>
        {onRemove && <button type="button" onClick={onRemove} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[13px] text-parish-error bg-parish-errorBg rounded-lg">Tangtangon</button>}
      </div>

      <div className="grid gap-3" style={GRID}>
        <Field label="Pangalan" required={isNew}><TextInput value={m.first_name} onChange={set('first_name')} onBlur={tidy('first_name')} /></Field>
        <Field label="Tunga nga apelyido"><TextInput value={m.middle_name} onChange={set('middle_name')} onBlur={tidy('middle_name')} /></Field>
        <Field label="Apelyido" required={isNew}><TextInput value={m.last_name} onChange={set('last_name')} onBlur={tidy('last_name')} /></Field>
        <Field label="Suffix"><TextInput value={m.suffix} placeholder="Jr., Sr., III" onChange={set('suffix')} onBlur={tidy('suffix', toSuffixCase)} /></Field>
        <Field label="Relasyon" required={isNew}>
          <Select value={m.relationship} onChange={set('relationship')}>
            <option value="">Pili…</option>{relationships.map((r) => <option key={r} value={r}>{bis(RELATIONSHIP_LABELS, r)}</option>)}
          </Select>
        </Field>
        <Field label="Sekso">
          <Select value={m.sex} onChange={set('sex')}>
            <option value="">Pili…</option>{Object.entries(SEX_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Adlaw nga natawo"><TextInput type="date" value={m.dob} onChange={set('dob')} /></Field>
        <Field label="Civil status">
          <Select value={m.civil_status} onChange={set('civil_status')}>
            <option value="">Pili…</option>{CIVIL_STATUSES.map((c) => <option key={c} value={c}>{bis(CIVIL_STATUS_LABELS, c)}</option>)}
          </Select>
        </Field>
        <Field label="Numero sa kontak"><TextInput value={m.contact} onChange={set('contact')} inputMode="tel" /></Field>
      </div>

      <div className="mt-4 flex flex-col divide-y divide-[#f0e8d6] border border-[#eee3ce] rounded-xl bg-white">
        {PARTICIPATION_ITEMS.map(([key, label]) => (
          <div key={key} role="radiogroup" aria-label={`${name}: ${label}`} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
            <span className="font-medium text-[14px] text-parish-ink">{label}</span>
            <div className="flex gap-1.5">
              {PARTICIPATION_LEVELS.map((level) => {
                const on = m.participation?.[key] === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => onChange({ participation: { ...m.participation, [key]: on ? undefined : level } })}
                    className={`appearance-none cursor-pointer px-3 py-2 rounded-full border-[1.5px] text-[13px] font-semibold ${
                      on ? 'bg-parish-blue border-parish-blue text-white' : 'bg-white border-parish-borderSoft text-parish-text2'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 mt-4" style={GRID}>
        <Field label="Kahimtang karon">
          <Select value={m.status} onChange={(e) => onChange({ status: e.target.value, statusPicked: true })}>
            <option value="">Pili…</option>
            {MEMBERSHIP_STATUSES.map((s) => <option key={s} value={s}>{MEMBERSHIP_STATUS_LABELS[s]}</option>)}
          </Select>
          {suggestion && !m.statusPicked && <div className="text-[12.5px] text-parish-muted mt-1">Gisugyot gikan sa inyong mga tubag.</div>}
        </Field>
        <Field label="Pahibalo (kung naa)"><TextInput value={m.notes} placeholder="pananglitan: nagtrabaho sa abroad" onChange={set('notes')} /></Field>
      </div>
    </div>
  );
}
