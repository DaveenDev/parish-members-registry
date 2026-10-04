import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BigButton, INNER, Spin } from '../../components/site/kit.jsx';
import { api } from '../../api.js';
import { validEmail, validMobile } from '../../lib/site.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { usePublicData } from '../../components/site/usePublicData.js';
import { FORMS } from './forms.js';
import { useOffice } from './data.js';
import { phoneHref } from '../../lib/requests.js';

const visible = (f, v) => !f.show || f.show(v);
const blank = (v) => v === undefined || v === null || v === '' || v === false;

/** Defaults, then any choice the link picked (e.g. ?certType=matrimony) when it's one of the options. */
function initialValues(F, params) {
  const values = {};
  F.steps.forEach((st) => st.fields.forEach((f) => {
    if (f.def !== undefined) values[f.k] = f.def;
    const asked = params.get(f.k);
    if (asked && Array.isArray(f.opts) && f.opts.some(([v]) => v === asked)) values[f.k] = asked;
  }));
  return values;
}

/** Errors for the visible fields of one step. */
function validate(fields, values) {
  const errs = {};
  for (const f of fields) {
    const v = values[f.k];
    if (f.req && blank(v)) errs[f.k] = f.type === 'check' ? 'Kinahanglan ang inyong pagtugot aron makapadayon.' : f.type === 'choice' ? 'Palihug pagpili usa.' : 'Kinahanglan kini.';
    else if (f.mobile && !blank(v) && !validMobile(v)) errs[f.k] = 'Susiha ang numero. Sama sa 0917 123 4567.';
    else if (f.type === 'email' && !blank(v) && !validEmail(v)) errs[f.k] = 'Susiha ang email.';
    else if (f.type === 'number' && !blank(v) && !/^(19|20)\d\d$/.test(String(v))) errs[f.k] = 'Isulat ang tuig, sama sa 1998.';
  }
  return errs;
}

/** For the Anointing of the Sick: in an emergency, call the sick call number instead of filling in the form. */
function SickCallNote() {
  const num = useOffice().data?.sick_call_contact;
  return (
    <div role="note" className="flex gap-2.5 items-start rounded-xl px-3.5 py-3 mb-[18px] border bg-parish-errorBg border-parish-errorBorder text-[14.5px] leading-snug text-[#3f3b2f]">
      <Icon name="phone" size={18} className="text-parish-error mt-px flex-none" />
      <div>
        <strong className="text-parish-error">Emergency?</strong> Ayaw na pag-fill up.{' '}
        {num
          ? <>Tawagi dayon ang sick call: <a href={`tel:${phoneHref(num)}`} className="font-bold text-parish-error underline">{num}</a></>
          : <>Tawagi dayon ang <Link to="/kontak" className="font-bold text-parish-error underline">opisina sa parokya</Link>.</>}
      </div>
    </div>
  );
}

/** A request form: one step at a time, a review before sending, then the reference number. */
export default function RequestForm() {
  const { form: formId } = useParams();
  const F = FORMS[formId];
  if (!F) return <Navigate to="/serbisyo" replace />;
  return <FormFlow key={formId} F={F} />;
}

function FormFlow({ F }) {
  useSiteTitle(F.short);
  const navigate = useNavigate();
  const gkks = usePublicData('gkkNames', () => api.listPublicGkks().catch(() => [])).data || [];
  const [step, setStep] = useState(0);
  const [params] = useSearchParams();
  const [values, setValues] = useState(() => initialValues(F, params));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [status, setStatus] = useState('edit'); // edit | sending | failed | done
  const [ref, setRef] = useState('');

  const total = F.steps.length + 1;
  const isReview = step >= F.steps.length;
  const fields = isReview ? [] : F.steps[step].fields.filter((f) => visible(f, values));

  useEffect(() => { window.scrollTo(0, 0); }, [step, status]);

  function set(k, v) {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: null }));
    setBanner('');
  }

  function next() {
    const errs = validate(fields, values);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setBanner('Palihug ayoha ang mga gimarkahan sa ubos.');
      window.scrollTo(0, 0);
      return;
    }
    setErrors({});
    setBanner('');
    setStep((s) => s + 1);
  }

  function back() {
    if (step === 0) { navigate(-1); return; }
    setErrors({});
    setBanner('');
    setStatus('edit');
    setStep((s) => s - 1);
  }

  async function submit() {
    setStatus('sending');
    setBanner('');
    // Only send what's visible, e.g. no spouse name on a baptismal request.
    const payload = {};
    F.steps.forEach((st) => st.fields.filter((f) => visible(f, values)).forEach((f) => { if (!blank(values[f.k])) payload[f.k] = values[f.k]; }));
    try {
      const res = await F.submit(payload);
      setRef(res?.ref_no || '');
      setStatus('done');
    } catch (e) {
      // Our database functions answer in Bisaya; anything else is the connection.
      const msg = e?.message || '';
      if (msg && !/fetch|network|failed to/i.test(msg)) { setBanner(msg); setStatus('edit'); }
      else setStatus('failed');
    }
  }

  if (status === 'done') return <Done F={F} refNo={ref} />;

  const pct = `${Math.round(((step + 1) / total) * 100)}%`;
  return (
    <main className="px-4 pt-4 pb-7 lg:max-w-[680px] lg:mx-auto lg:px-6 lg:pt-[18px] lg:pb-0">
      <div className="font-bold text-[12px] tracking-[.1em] uppercase text-[#4d4636] mb-1.5">Lakang {step + 1} sa {total}</div>
      <div className="h-[5px] bg-[#eaddc2] rounded-full overflow-hidden mb-4">
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: pct, background: 'linear-gradient(90deg,var(--p-blue),var(--p-gold))' }} />
      </div>
      <h1 className="font-serif font-semibold text-[30px] lg:text-[40px] leading-[1.1] lg:leading-[1.08] m-0 mb-1 text-parish-navy">{F.title}</h1>
      <p className="m-0 text-[15px] leading-normal text-[#4d4636]">{F.intro}</p>
      <div className="flex gap-2 items-start text-[13.5px] leading-[1.45] text-[#4d4636] mt-3 mb-[18px]">
        <Icon name="lock" size={16} className="mt-px text-parish-blue" /><span>{F.who}</span>
      </div>
      {F.sickCall && step === 0 && <SickCallNote />}
      <h2 className="font-serif font-bold text-[23px] m-0 mb-3 text-parish-navy">{isReview ? 'Susiha una ipadala' : F.steps[step].title}</h2>
      {banner && (
        <div role="alert" className="flex gap-[9px] bg-parish-errorBg border border-parish-errorBorder rounded-xl px-[13px] py-[11px] mb-3.5 text-parish-error font-semibold text-[14.5px]">
          <Icon name="alert" size={18} />{banner}
        </div>
      )}

      {!isReview ? (
        <>
          <div className="flex flex-col gap-[18px]">
            {fields.map((f) => <FieldView key={f.k} f={f} value={values[f.k]} error={errors[f.k]} onChange={(v) => set(f.k, v)} gkks={gkks} />)}
          </div>
          {F.notes && step === F.steps.length - 1 && (
            <div className="mt-5 bg-[#f1ead9] rounded-xl px-3.5 py-3 flex flex-col gap-1.5">
              {F.notes.map((n) => <div key={n} className="flex gap-2 text-[14px] leading-[1.4] text-[#3f3b2f]"><Icon name="idcard" size={16} className="mt-0.5 text-parish-blue" />{n}</div>)}
            </div>
          )}
          <div className="flex gap-2.5 mt-[22px]">
            <button type="button" onClick={back} className="min-h-[54px] px-[18px] rounded-[14px] border-[1.5px] border-[#dcd0b7] text-[#4d4636] font-semibold text-[16px]">Balik</button>
            <button type="button" onClick={next} className="flex-1 min-h-[54px] rounded-[14px] bg-parish-blue text-white font-bold text-[16.5px]">Padayon</button>
          </div>
        </>
      ) : (
        <>
          {status === 'failed' && (
            <div role="alert" className="bg-parish-errorBg border border-parish-errorBorder rounded-[14px] p-3.5 mb-3.5 text-parish-error">
              <div className="flex gap-2 items-center font-bold text-[15.5px] mb-1"><Icon name="alert" size={18} />Wala ma-send</div>
              <div className="text-[14.5px] leading-normal">Morag nawala ang koneksyon. Wala mawala ang inyong gisulat. Sulayi pag-usab kung naa nay signal.</div>
            </div>
          )}
          <div className="bg-parish-card border border-parish-border rounded-2xl px-3.5 py-1">
            {reviewRows(F, values, gkks).map((r) => (
              <div key={r.k} className="flex gap-2.5 items-start py-[11px] border-b border-[#f4eddd] last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-parish-text2">{r.label}</div>
                  <div className="font-semibold text-[15.5px] leading-[1.4] break-words whitespace-pre-line">{r.value}</div>
                </div>
                <button type="button" onClick={() => setStep(r.step)} className="min-h-[44px] px-1 font-bold text-[14px] text-parish-blue">Usba</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 items-center text-[13.5px] text-[#4d4636] mt-3"><Icon name="check" size={16} className="text-parish-ok" />Mouyon sa Data Privacy</div>
          <div className="flex gap-2.5 mt-[18px]">
            <button type="button" onClick={back} className="min-h-[54px] px-[18px] rounded-[14px] border-[1.5px] border-[#dcd0b7] text-[#4d4636] font-semibold text-[16px]">Balik</button>
            <button type="button" onClick={submit} disabled={status === 'sending'} className="flex-1 min-h-[54px] rounded-[14px] bg-parish-blue text-white font-bold text-[16.5px] flex items-center justify-center gap-2.5 disabled:opacity-80">
              {status === 'sending' ? <><Spin />Gipadala…</> : 'Ipadala'}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function optionsFor(f, gkks) {
  return f.opts === 'gkks' ? gkks.map((g) => [g, g]) : f.opts;
}

function reviewRows(F, values, gkks) {
  const rows = [];
  F.steps.forEach((st, step) => st.fields.filter((f) => visible(f, values) && f.k !== 'consent').forEach((f) => {
    const v = values[f.k];
    if (blank(v)) return;
    const label = (optionsFor(f, gkks) || []).find(([val]) => val === v)?.[1];
    rows.push({ k: f.k, label: f.label, value: v === true ? 'Oo' : label || v, step });
  }));
  return rows;
}

const INPUT = 'w-full min-h-[52px] px-3.5 text-[17px] text-parish-ink bg-parish-card border-[1.5px] rounded-xl outline-none focus:border-parish-blue';

function FieldView({ f, value, error, onChange, gkks }) {
  const id = `fld-${f.k}`;
  // A missing or wrong answer: red outline, light red fill and glow, still red while focused.
  const border = error ? '!border-parish-error !bg-parish-errorBg/40 ring-4 ring-parish-error/20' : 'border-parish-borderSoft';
  const star = f.req && <span className="text-[var(--p-gold-deep)]" aria-hidden="true"> *</span>;
  const label = <label htmlFor={id} className="block font-bold text-[14.5px] mb-1.5">{f.label}{star}</label>;
  const describedBy = [f.hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
  let control;

  if (f.type === 'area') {
    control = <>{label}<textarea id={id} rows={5} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={f.ph} aria-invalid={!!error} aria-describedby={describedBy} className={`${INPUT} py-3 leading-normal resize-y ${border}`} /></>;
  } else if (f.type === 'select') {
    const options = optionsFor(f, gkks);
    control = (
      <>
        {label}
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} aria-describedby={describedBy} className={`${INPUT} ${border}`}>
          {!f.noBlank && f.def === undefined && <option value="">Pili…</option>}
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </>
    );
  } else if (f.type === 'choice') {
    control = (
      <fieldset className="border-none m-0 p-0" aria-describedby={describedBy}>
        <legend className="font-bold text-[14.5px] mb-2 p-0">{f.label}{star}</legend>
        <div role="radiogroup" className={`grid gap-2 ${f.grid ? 'grid-cols-4' : 'grid-cols-1'}`}>
          {f.opts.map(([v, l]) => {
            const on = value === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange(v)}
                className={`min-h-[52px] flex items-center gap-2.5 px-3 rounded-xl border-[1.5px] text-left font-semibold text-[15.5px] ${f.grid ? 'justify-center' : ''}`}
                style={{ borderColor: on ? 'var(--p-blue)' : error ? '#a13d29' : '#e0d6c1', background: on ? 'var(--p-blue-tint)' : error ? '#fbeeea' : '#fffdf8' }}
              >
                <span className="w-5 h-5 flex-none rounded-full border-2 flex items-center justify-center" style={{ borderColor: on ? 'var(--p-blue)' : '#cfc4ab' }}>
                  {on && <span className="w-2.5 h-2.5 rounded-full bg-parish-blue" />}
                </span>
                {l}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  } else if (f.type === 'check') {
    control = (
      <label className={`flex gap-3 items-start cursor-pointer p-3.5 border-[1.5px] rounded-xl bg-parish-card ${border}`}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} aria-invalid={!!error} aria-describedby={describedBy} className="w-[22px] h-[22px] flex-none mt-px accent-[var(--p-blue)]" />
        <span className="font-medium text-[15px] leading-normal text-[#3f3b2f]">{f.label}{star}</span>
      </label>
    );
  } else {
    const type = f.type === 'number' ? 'text' : f.type;
    const inputMode = f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : f.im || 'text';
    control = <>{label}<input id={id} type={type} inputMode={inputMode} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={f.ph} aria-invalid={!!error} aria-describedby={describedBy} className={`${INPUT} ${border}`} /></>;
  }

  return (
    <div>
      {control}
      {f.hint && <div id={`${id}-hint`} className="text-[13.5px] text-parish-text2 mt-[5px]">{f.hint}</div>}
      {error && <div id={`${id}-err`} className="flex gap-[5px] items-center text-parish-error font-semibold text-[13.5px] mt-1.5"><Icon name="alert" size={14} />{error}</div>}
    </div>
  );
}

function Done({ F, refNo }) {
  return (
    <main className={`${INNER} lg:max-w-[680px] text-center`}>
      <div className="w-[76px] h-[76px] rounded-full bg-parish-okBg text-parish-ok flex items-center justify-center mx-auto mb-4"><Icon name="check" size={38} /></div>
      <h1 className="font-serif font-semibold text-[32px] leading-[1.1] m-0 mb-2 text-parish-navy">Salamat! Nadawat na namo.</h1>
      {refNo && !F.noRef && (
        <div className="bg-parish-card border border-parish-border rounded-2xl shadow-card p-[18px] my-4">
          <div className="font-bold text-[11.5px] tracking-[.16em] uppercase text-[var(--p-eyebrow)] mb-1.5">Reference number</div>
          <div className="font-serif text-[clamp(22px,8vw,32px)] font-bold tracking-[.06em] text-parish-blue whitespace-nowrap">{refNo}</div>
          <div className="text-[13.5px] text-[#4d4636] mt-1">I-screenshot o isulat kini.</div>
        </div>
      )}
      <div className="text-left bg-parish-card border border-parish-border rounded-2xl p-3.5 mt-4">
        <h2 className="m-0 mb-2.5 font-serif text-[21px] font-bold text-parish-navy">Unsa ang sunod?</h2>
        {F.next.map((t, i) => (
          <div key={t} className="flex gap-2.5 items-start py-[5px] text-[15px] leading-[1.45] text-[#3f3b2f]">
            <span className="w-6 h-6 flex-none rounded-full font-bold text-[12.5px] text-parish-blueDeep flex items-center justify-center" style={{ background: 'var(--p-blue-tint)' }}>{i + 1}</span>{t}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2.5 mt-4">
        {F.track && refNo && <BigButton to={`/serbisyo/susiha?ref=${encodeURIComponent(refNo)}`}>Susiha ang status</BigButton>}
        <BigButton variant="secondary" to="/">Balik sa Home</BigButton>
      </div>
    </main>
  );
}
