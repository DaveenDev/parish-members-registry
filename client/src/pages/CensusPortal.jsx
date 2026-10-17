import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Field, TextInput, Select, Checkbox, Card, PrimaryButton, GhostButton, Spinner, FlagEmptyRequired, ComboInput, OptionSelect } from '../components/ui.jsx';
import CreditFooter from '../components/CreditFooter.jsx';
import { useParishTitle } from './site/data.js';
import MemberCensusCards from '../components/MemberCensusCards.jsx';
import { MemberNameFields, MemberFieldsGrid, MemberSacraments, OrganizationChecks } from '../components/MemberFields.jsx';
import { HEADS, RELATIONSHIPS, CIVIL_STATUSES, PARTICIPATION_ITEMS, PARTICIPATION_LEVELS, PARTNERED_STATUSES, GKK_ROLES, fmtDate } from '../constants.js';
import { familiesOf, familyHeadName, familyNoOf, samePerson, autoFill, askedForAge, toPayloadMember } from '../lib/household.js';
import { bis, portalErrorInBisaya, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS } from '../lib/bisaya.js';
import { toNameCase, toSuffixCase } from '../lib/util.js';
import {
  MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS, suggestStatus, asksParticipation, isYoungChild, YOUNG_CHILD_MAX_AGE, portalPayload, portalNewMember,
  formatAccessCode, codeFromHash, cleanParticipation, registrationAnswers, censusCardPatch,
} from '../lib/census.js';

const BG = { background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' };
const GRID = { gridTemplateColumns: 'repeat(auto-fit,minmax(min(180px,100%),1fr))' };
const SACRAMENTS_SHORT = [['has_baptism', 'Bunyag'], ['has_communion', 'Komunyon'], ['has_confirmation', 'Kumpirma'], ['has_matrimony', 'Kasal']];
const NEW_SACRAMENTS_SHORT = [['hasBaptism', 'Bunyag'], ['hasCommunion', 'Komunyon'], ['hasConfirmation', 'Kumpirma'], ['hasMatrimony', 'Kasal']];
// Nobody becomes, or stops being, a family head online (0054): staff do that.
const NEW_RELATIONSHIPS = RELATIONSHIPS.filter((r) => !HEADS.includes(r));
// A new member is entered as at registration, one step at a time (0090).
const NEW_MEMBER_STEPS = ['Mga detalye', 'Mga sakramento', 'Pag-apil', 'Census'];
const LAST_STEP = NEW_MEMBER_STEPS.length;

let newMemberSeq = 0;
/**
 * A new member's card: portalNewMember() plus where the family is in it
 * (`step`, 1–4; `done` once finished; `tried` after a "Padayon" that found
 * something missing) and a `key` that stays with it when another is removed.
 */
function newMemberCard(member, done = false) {
  newMemberSeq += 1;
  return { ...member, key: `new-${newMemberSeq}`, step: done ? LAST_STEP : 1, done, tried: false };
}

const newMemberName = (m) => [m.firstName, m.lastName, m.suffix].filter(Boolean).join(' ');

/**
 * What still stops a new member's step, as { field: message }: registration's
 * rules. `others` are the members already on the form, so nobody is added
 * twice.
 */
function newMemberErrors(m, step, others) {
  const e = {};
  if (step === 1) {
    [['lastName', 'Kinahanglan ang apelyido'], ['firstName', 'Kinahanglan ang ngalan'], ['relationship', 'Pilia ang relasyon sa ulo sa pamilya'],
      ['sex', 'Pilia ang kasarian'], ['dob', 'Kinahanglan ang adlaw sa pagkatawo'], ['civilStatus', 'Pilia ang kahimtang sibil']]
      .forEach(([k, msg]) => { if (!String(m[k] || '').trim()) e[k] = msg; });
    if (m.email && !/.+@.+\..+/.test(m.email)) e.email = 'Isulat ang saktong email';
    if (!e.firstName && others.some((o) => samePerson(m, o))) e.firstName = 'Nalista na kini nga tawo';
  }
  if (step === LAST_STEP && !registrationAnswers(m).censusStatus) e.censusStatus = 'Pilia ang kahimtang karon';
  return e;
}

/** Whom new member `i` must not repeat: the members on record, then the new ones before it. */
const othersFor = (form, i) => [...form.members, ...form.newMembers.slice(0, i)];

/** The first step of a new member with something missing, 0 when it's complete. */
function incompleteStep(m, others) {
  for (let step = 1; step <= LAST_STEP; step++) if (Object.keys(newMemberErrors(m, step, others)).length) return step;
  return 0;
}

/** "Pamilya ni Pedro Dela Cruz": what a family in the house is called. */
function familyLabel(group) {
  return `Pamilya ni ${familyHeadName(group?.head) || (group?.familyNo === 1 ? 'Ulo sa Panimalay' : `#${group?.familyNo}`)}`;
}

/** A young child with no status yet (or Aktibo) is Aktibo, with no participation answers. */
function childDefaults(m) {
  if (!isYoungChild(m.dob) || (m.status && m.status !== 'Active')) return m;
  return { ...m, status: 'Active', statusPicked: true, participation: {} };
}

/** Form state from what portal_open() returned. */
function formFrom(data) {
  const asText = (v) => (v === null || v === undefined ? '' : String(v));
  const text = (obj, keys) => Object.fromEntries(keys.map((k) => [k, asText(obj[k])]));
  return {
    household: text(data.household, ['street', 'barangay', 'city', 'province', 'zip', 'contact', 'email']),
    members: data.members.map((m) => childDefaults({
      ...m,
      ...text(m, ['first_name', 'middle_name', 'last_name', 'suffix', 'relationship', 'sex', 'dob', 'civil_status', 'contact', 'notes']),
      status: m.status || '',
      participation: m.participation || {},
      statusPicked: !!m.status,
    })),
    newMembers: (data.newMembers || []).map((m) => newMemberCard(portalNewMember(m), true)),
    message: asText(data.message),
    consent: false,
  };
}

/**
 * Census family portal: during an open census a family opens its record with
 * the reference number and access code from its printed census form, checks
 * its details and answers the census. Answers with no change to the details
 * are saved at once; changed details are reviewed by staff before anything
 * in the registry changes.
 */
export default function CensusPortal() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // The QR code on a printed sheet links here with "#code=…" after the ref.
  const [linkCode] = useState(() => codeFromHash(location.hash));
  const autoOpened = useRef(false);
  const [screen, setScreen] = useState('signin'); // signin | form | done
  const [status, setStatus] = useState(null);
  const [refNo, setRefNo] = useState(params.get('ref') || '');
  const [code, setCode] = useState(formatAccessCode(linkCode));
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  // The form as it opened: every change makes a new object, so `form !== openedForm` means unsent answers.
  const [openedForm, setOpenedForm] = useState(null);
  const [error, setError] = useState('');
  // Asked once per send: Aktibo members with no activity answers (their score can't be worked out).
  const [notice, setNotice] = useState('');
  const [noticeShown, setNoticeShown] = useState(false);
  const [showStatusErrors, setShowStatusErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  // No details changed: the answers went straight into the census (0083).
  const [approved, setApproved] = useState(false);
  const [logo, setLogo] = useState(null);
  // The parish's name as saved in Parish Config, shown as the website shows it.
  const parish = useParishTitle();
  useEffect(() => { if (parish.saved) document.title = `Census · ${parish.title}`; }, [parish.saved, parish.title]);
  // What a new member's "Pag-apil" step offers (0090), as at registration.
  const [orgOptions, setOrgOptions] = useState([]);
  const [parishRoleOptions, setParishRoleOptions] = useState([]);

  useEffect(() => {
    api.portalStatus().then(setStatus).catch(() => setStatus({ open: false }));
    api.publicParishLogo().then(setLogo).catch(() => {});
    api.listPublicOrganizations().then(setOrgOptions).catch(() => {});
    api.listPublicParishPositions().then(setParishRoleOptions).catch(() => {});
  }, []);

  // Take the code out of the address bar straight away, so it isn't kept in
  // the phone's history or passed on with a shared link or screenshot.
  useEffect(() => {
    if (location.hash) navigate({ search: location.search, hash: '' }, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Scanned the QR code: open the record without making the family type anything.
  useEffect(() => {
    if (!status?.open || !linkCode || !refNo.trim() || autoOpened.current) return;
    autoOpened.current = true;
    open();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  async function open(e) {
    e && e.preventDefault();
    setError('');
    if (!refNo.trim() || !code.trim()) { setError('Ibutang ang reference number ug ang code.'); return; }
    setBusy(true);
    try {
      const res = await api.portalOpen(refNo.trim(), code.trim());
      if (!res?.ok) { setError(portalErrorInBisaya(res?.error)); return; }
      const opened = formFrom(res);
      setData(res);
      setForm(opened);
      setOpenedForm(opened);
      setNotice('');
      setNoticeShown(false);
      setScreen('form');
      top();
    } catch (err) {
      setError(portalErrorInBisaya(err.message));
    } finally {
      setBusy(false);
    }
  }

  // A new member's card changes with a patch (functional, so two calls in a row both count).
  function updateNewMember(i, patch) {
    setForm((f) => ({ ...f, newMembers: f.newMembers.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  }
  /** One of a new member's registration fields. */
  function setNewMemberField(i, field, value) {
    setForm((f) => ({
      ...f,
      newMembers: f.newMembers.map((m, j) => {
        if (j !== i) return m;
        const familyHead = familiesOf(f.members).find((g) => g.familyNo === familyNoOf(m))?.head;
        // The sex a relationship says (a Spouse: the other from their family
        // head), and Single for anyone under 18 (still editable).
        const next = { ...m, [field]: value, ...autoFill(m, field, value, { headSex: familyHead?.sex || '' }) };
        // A new Spouse also starts with the head's Married / Live-in.
        const head = field === 'relationship' && value === 'Spouse' ? familyHead : null;
        if (head && !m.civilStatus && PARTNERED_STATUSES.includes(head.civil_status)) next.civilStatus = head.civil_status;
        return next;
      }),
    }));
  }

  async function submit() {
    setError('');
    // Every member needs a "Kahimtang karon".
    const unmarked = form.members.filter((m) => !MEMBERSHIP_STATUSES.includes(m.status));
    if (unmarked.length) {
      setShowStatusErrors(true);
      setError(`Pilia ang kahimtang karon sa matag miyembro (${unmarked.length} pa ang kulang).`);
      // After the cards re-render with their errors, bring the first one into view.
      setTimeout(() => document.querySelector('[data-census-status][aria-invalid=true]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    // Each new member, step by step: the first with something missing opens at that step.
    const k = form.newMembers.findIndex((m, i) => incompleteStep(m, othersFor(form, i)));
    if (k >= 0) {
      const m = form.newMembers[k];
      const step = incompleteStep(m, othersFor(form, k));
      updateNewMember(k, { step, done: false, tried: true });
      const who = newMemberName(m) ? `ni ${newMemberName(m)}` : 'sa bag-ong miyembro';
      setError(`Kompletoha ang “${NEW_MEMBER_STEPS[step - 1]}” ${who}, o tangtanga siya.`);
      setTimeout(() => document.querySelector(`[data-new-member="${m.key}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    // An adult marked Aktibo with no activity answers can't be scored: ask once, then send anyway.
    const unanswered = [
      ...form.members.filter((m) => m.status === 'Active' && !isYoungChild(m.dob) && !Object.keys(cleanParticipation(m.participation)).length),
      ...form.newMembers.filter((m) => {
        const answers = registrationAnswers(m);
        return answers.censusStatus === 'Active' && !isYoungChild(m.dob) && !Object.keys(answers.participation).length;
      }),
    ];
    if (unanswered.length && !noticeShown) {
      setNoticeShown(true);
      setNotice(`${unanswered.length} ka miyembro nga Aktibo wala pay tubag sa mga pangutana (Misa, Debosyon, ug uban pa). `
        + 'Tubaga kini kung mahimo, o pindota pag-usab ang “Ipadala sa parokya” aron ipadala gihapon.');
      return;
    }
    setNotice('');
    if (!form.consent) { setError('Palihug i-tsek ang pagtugot sa data privacy sa ubos.'); return; }
    setBusy(true);
    try {
      const res = await api.portalSubmit(refNo.trim(), code.trim(), portalPayload(form));
      if (!res?.ok) { setError(portalErrorInBisaya(res?.error)); return; }
      setApproved(!!res.approved);
      setScreen('done');
      top();
    } catch (err) {
      setError(portalErrorInBisaya(err.message));
    } finally {
      setBusy(false);
    }
  }

  // Answers typed in but not sent yet.
  const unsent = screen === 'form' && !!form && form !== openedForm;

  // Closing the tab, going back or reloading would lose them: the browser asks first.
  useEffect(() => {
    if (!unsent) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsent]);

  function signOut() {
    if (unsent && !window.confirm('Wala pa mapadala ang inyong mga tubag. Mogawas gihapon?')) return;
    setData(null); setForm(null); setOpenedForm(null); setCode(''); setError(''); setNotice(''); setScreen('signin'); top();
  }

  const header = (
    <div className="text-center mb-6">
      <div className="flex justify-center mb-2 text-parish-gold">
        {logo ? <img src={logo} alt="Parish logo" className="w-[64px] h-[64px] object-contain" /> : <span className="text-[40px]" aria-hidden>✝</span>}
      </div>
      <div className="font-semibold text-[12.5px] tracking-[.2em] uppercase text-[var(--p-gold-deep)]">{status?.label || 'Census sa Parokya'}</div>
      <h1 className="font-serif font-semibold text-[clamp(30px,6vw,42px)] leading-tight m-0 text-parish-navy">{parish.name}</h1>
      {parish.sub && <div className="font-serif text-[18px] text-parish-blue tracking-[.04em] mt-0.5">{parish.sub}</div>}
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
            {approved ? (
              <>Nadawat ug natala na sa rehistro ang census sa <strong>{data?.household.household_name}</strong>.
                Kung adunay sayop, mahimo pa ninyo kining usbon samtang bukas pa ang census.</>
            ) : (
              <>Nadawat na sa parokya ang census sa <strong>{data?.household.household_name}</strong>. Tungod kay giusab ninyo ang
                mga detalye, o ang kahimtang sa usa ka miyembro (nibalhin, namatay o mibiya sa Simbahan), susihon kini sa among
                kawani una kini ibutang sa rehistro. Kung adunay sayop, mahimo pa ninyo kining usbon samtang wala pa nasusi.</>
            )}
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
                <Field label="Reference number"><TextInput value={refNo} onChange={(e) => setRefNo(e.target.value.toUpperCase())} placeholder="MEO-2026-0001" autoComplete="off" /></Field>
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
    // A young child stays Aktibo when the birthday is corrected or the status is cleared.
    rows[i] = 'dob' in patch || patch.status === '' ? childDefaults(next) : next;
    return { ...f, [list]: rows };
  });
  // Families in the house (0054), from the members on record.
  const families = familiesOf(form.members);
  const severalFamilies = families.length > 1;
  const headOf = (familyNo) => families.find((g) => g.familyNo === familyNo)?.head;

  return (
    <FlagEmptyRequired.Provider value>
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
            Para sa matag miyembro, pilia una ang <strong>kahimtang karon</strong>. Kung aktibo pa, tubaga kung unsa ka aktibo sa parokya o GKK:
            <strong> Aktibo</strong>, <strong>Panagsa</strong>, o <strong>Wala</strong>. Kung adunay sayop sa detalye sa usa ka miyembro,
            i-klik ang <strong>Usba ang mga detalye</strong>.
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
          <div className="flex flex-col gap-6">
            {families.map((g) => (
              <section key={g.familyNo}>
                {severalFamilies && <div className="font-bold text-[12px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase mb-2.5">{familyLabel(g)}</div>}
                <div className="flex flex-col gap-4">
                  {g.members.map((m, k) => {
                    const i = g.indexes[k];
                    return <MemberCard key={m.id} member={m} showStatusError={showStatusErrors} onChange={(patch) => updateList('members', i, patch)} />;
                  })}
                </div>
              </section>
            ))}
          </div>
        </Section>

        <Section title="Bag-ong miyembro">
          <p className="text-[14px] text-parish-text2 mt-0">
            Bag-ong natawo, bag-ong minyo, o bag-ong nipuyo sa inyong panimalay. Sama sa rehistro: ang iyang mga detalye, mga sakramento,
            pag-apil sa parokya, ug sa katapusan ang census.
          </p>
          <div className="flex flex-col gap-4">
            {form.newMembers.map((m, i) => (
              <NewMemberCard
                key={m.key}
                member={m}
                index={i}
                others={othersFor(form, i)}
                families={severalFamilies ? families : null}
                orgOptions={orgOptions}
                parishRoleOptions={parishRoleOptions}
                onChange={(patch) => updateNewMember(i, patch)}
                onField={(field, value) => setNewMemberField(i, field, value)}
                onRemove={() => setForm((f) => ({ ...f, newMembers: f.newMembers.filter((_, j) => j !== i) }))}
              />
            ))}
          </div>
          {form.newMembers.length < 10 && (
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, newMembers: [...f.newMembers, newMemberCard(portalNewMember(null, { lastName: toNameCase(headOf(1)?.last_name || '') }))] }))}
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
        {notice && <div role="alert" className="mb-4 px-4 py-3 rounded-xl bg-[#fdf1de] text-[#7a5a1f] text-[14.5px] font-medium">{notice}</div>}
        <div className="flex justify-end gap-3 mb-8">
          <GhostButton onClick={signOut} className="px-5 py-3.5 text-[15px]">Kanselahon</GhostButton>
          <PrimaryButton onClick={submit} disabled={busy} className="px-8 py-3.5 text-[16px]">{busy ? 'Ginapadala…' : 'Ipadala sa parokya'}</PrimaryButton>
        </div>
        <CreditFooter inline />
      </div>
    </div>
    </FlagEmptyRequired.Provider>
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

/** A member on record: the census questions, with their details folded away. */
function MemberCard({ member: m, showStatusError = false, onChange }) {
  // Names, birthdays and the like rarely change: they stay folded away and
  // open only to correct a mistake.
  const [editing, setEditing] = useState(false);
  const set = (k) => (e) => onChange({ [k]: e.target.value });
  const tidy = (k, format = toNameCase) => (e) => onChange({ [k]: format(e.target.value) });
  const suggestion = suggestStatus(m.participation);
  const name = [m.first_name, m.last_name].filter(Boolean).join(' ');
  // A family head stays one; anyone else can't be made one here.
  const isHead = HEADS.includes(m.relationship);
  const relationships = isHead ? [m.relationship] : NEW_RELATIONSHIPS;
  // Young children count as Aktibo, and someone inactive, moved, deceased or
  // gone has no participation to answer.
  const child = isYoungChild(m.dob);
  const noSurvey = m.statusPicked && !asksParticipation(m.status);
  const pickStatus = (status) => onChange(asksParticipation(status)
    ? { status, statusPicked: true }
    : { status, statusPicked: true, participation: {} });

  return (
    <div className="border border-[#eee3ce] rounded-xl bg-[#fdfbf6] p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[16px] text-parish-navy">{name}</div>
          <div className="text-[12.5px] text-parish-muted">
            Sakramento: {SACRAMENTS_SHORT.filter(([k]) => m[k]).map(([, l]) => l).join(', ') || 'wala pa narekord'}
          </div>
        </div>
      </div>

      <div className="grid gap-3" style={GRID}>
        <Field label="Kahimtang karon" required error={showStatusError && !MEMBERSHIP_STATUSES.includes(m.status) ? 'Pilia ang kahimtang karon' : ''}>
          <Select data-census-status value={m.status} onChange={(e) => pickStatus(e.target.value)}>
            <option value="">Pili…</option>
            {MEMBERSHIP_STATUSES.map((s) => <option key={s} value={s}>{MEMBERSHIP_STATUS_LABELS[s]}</option>)}
          </Select>
          {suggestion && !m.statusPicked && <div className="text-[12.5px] text-parish-muted mt-1">Gisugyot gikan sa inyong mga tubag.</div>}
        </Field>
        <Field label="Pahibalo (kung naa)"><TextInput value={m.notes} placeholder="pananglitan: nagtrabaho sa abroad" onChange={set('notes')} /></Field>
      </div>

      {child && m.status === 'Active' ? (
        <div className="mt-4 px-3.5 py-3 rounded-xl bg-white border border-[#eee3ce] text-[13.5px] text-parish-text2">
          <strong className="text-parish-navy">Aktibo</strong> — bata pa ({YOUNG_CHILD_MAX_AGE} anyos o ubos), busa dili na kinahanglan tubagon ang mga pangutana.
        </div>
      ) : noSurvey ? (
        // Hidden rather than greyed out, so phones don't scroll past questions nobody answers.
        <div className="mt-4 px-3.5 py-3 rounded-xl bg-white border border-[#eee3ce] text-[13.5px] text-parish-text2">
          Dili na kinahanglan tubagon ang mga pangutana kay <strong className="text-parish-navy">{MEMBERSHIP_STATUS_LABELS[m.status]}</strong> ang napili.
        </div>
      ) : (
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
                    className={`appearance-none px-3 py-2 rounded-full border-[1.5px] text-[13px] font-semibold cursor-pointer ${
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
      )}

      <button
        type="button"
        aria-expanded={editing}
        onClick={() => setEditing((v) => !v)}
        className="mt-3 appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13.5px] text-parish-blue"
      >
        {editing ? '▾ Itago ang mga detalye' : '▸ Usba ang mga detalye (kung adunay sayop)'}
      </button>
      {editing && (
        <div className="grid gap-3 mt-3" style={GRID}>
          <Field label="Pangalan"><TextInput value={m.first_name} onChange={set('first_name')} onBlur={tidy('first_name')} /></Field>
          <Field label="Tunga nga apelyido"><TextInput value={m.middle_name} onChange={set('middle_name')} onBlur={tidy('middle_name')} /></Field>
          <Field label="Apelyido"><TextInput value={m.last_name} onChange={set('last_name')} onBlur={tidy('last_name')} /></Field>
          <Field label="Suffix"><TextInput value={m.suffix} placeholder="Jr., Sr., III" onChange={set('suffix')} onBlur={tidy('suffix', toSuffixCase)} /></Field>
          <Field label={(m.family_no || 1) > 1 ? 'Relasyon sa ulo sa iyang pamilya' : 'Relasyon'}>
            <Select value={m.relationship} onChange={set('relationship')} disabled={isHead}>
              {!isHead && <option value="">Pili…</option>}
              {/* Keep an unusual value on record selectable. */}
              {!isHead && m.relationship && !relationships.includes(m.relationship) && <option value={m.relationship}>{bis(RELATIONSHIP_LABELS, m.relationship)}</option>}
              {relationships.map((r) => <option key={r} value={r}>{bis(RELATIONSHIP_LABELS, r)}</option>)}
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
      )}
    </div>
  );
}

/** Where a new member is: four bars, the steps done and the one open in blue; a step done can be opened again. */
function NewMemberSteps({ step, onPick }) {
  return (
    <ol className="flex gap-1.5 m-0 p-0 list-none" aria-label="Mga lakang">
      {NEW_MEMBER_STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex-1 min-w-0">
            <button
              type="button"
              disabled={!done}
              onClick={() => onPick(n)}
              aria-current={active ? 'step' : undefined}
              aria-label={`Lakang ${n}: ${label}`}
              className="w-full appearance-none border-none bg-transparent p-0 text-left cursor-pointer disabled:cursor-default"
            >
              <span className="block h-[5px] rounded-full" style={{ background: active || done ? 'var(--p-blue)' : '#eaddc2' }} />
              <span className={`hidden sm:block mt-1.5 text-[12px] font-semibold truncate ${active ? 'text-parish-navy' : done ? 'text-parish-blue' : 'text-[#a79f8a]'}`}>
                {n}. {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A new member, asked as at registration (0090) one step at a time: their
 * details, their sacraments, their part in the parish (organizations and
 * Katungdanan), and lastly the census questions. Once done it folds into a
 * summary, with "Usba" to go through it again.
 */
function NewMemberCard({ member: m, index, others, families, orgOptions, parishRoleOptions, onChange, onField, onRemove }) {
  const ref = useRef(null);
  const name = newMemberName(m);
  const errors = m.tried && !m.done ? newMemberErrors(m, m.step, others) : {};
  // As the registration fields take a member: its place, its errors and its name.
  const mv = { ...m, mi: index, err: errors, displayName: name || 'Bag-ong miyembro' };
  const field = (_, k, v) => onField(k, v);
  const asked = askedForAge(m.dob);

  // A new step opens at its top, so a phone doesn't land halfway down it.
  function go(patch) {
    onChange(patch);
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }
  function next() {
    if (Object.keys(newMemberErrors(m, m.step, others)).length) {
      onChange({ tried: true });
      // Once the errors show, bring the first into view.
      setTimeout(() => {
        const invalid = ref.current?.querySelector('[aria-invalid="true"]');
        invalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        invalid?.focus({ preventScroll: true });
      }, 50);
      return;
    }
    go(m.step < LAST_STEP ? { step: m.step + 1, tried: false } : { done: true, tried: false });
  }
  const toggleOrganization = (org) => onField('organizations', m.organizations.includes(org)
    ? m.organizations.filter((o) => o !== org)
    : [...m.organizations, org]);
  const removeButton = (
    <button type="button" onClick={onRemove} className="flex-none appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[13px] text-parish-error bg-parish-errorBg rounded-lg">Tangtangon</button>
  );

  if (m.done) {
    // What will be sent: nothing they're too young for, and the wedding rule.
    const p = toPayloadMember(m);
    const { censusStatus } = registrationAnswers(m);
    const roles = [p.gkkRole && `GKK: ${p.gkkRole}`, p.parishRole && `Parish: ${p.parishRole}`].filter(Boolean);
    const rows = [
      ['Sakramento', NEW_SACRAMENTS_SHORT.filter(([k]) => p[k]).map(([, l]) => l).join(', ') || 'wala pa'],
      p.organizations.length > 0 && ['Organisasyon', p.organizations.join(', ')],
      roles.length > 0 && ['Katungdanan', roles.join(' · ')],
      ['Census', MEMBERSHIP_STATUS_LABELS[censusStatus] || '—'],
    ].filter(Boolean);
    return (
      <div ref={ref} data-new-member={m.key} className="scroll-mt-4 border border-[#eee3ce] rounded-xl bg-[#fdfbf6] p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[16px] text-parish-navy">{name}</div>
            <div className="text-[12.5px] text-parish-muted">
              {[bis(RELATIONSHIP_LABELS, m.relationship), bis(SEX_LABELS, m.sex), m.dob && `natawo ${fmtDate(m.dob)}`, bis(CIVIL_STATUS_LABELS, m.civilStatus)].filter(Boolean).join(' · ')}
            </div>
            <dl className="m-0 mt-2 flex flex-col gap-0.5 text-[13px]">
              {rows.map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="flex-none font-semibold text-parish-blue">{label}</dt>
                  <dd className="m-0 text-parish-text2 min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-none">
            <button type="button" onClick={() => go({ done: false, step: 1, tried: false })} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[13px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg">Usba</button>
            {removeButton}
          </div>
        </div>
      </div>
    );
  }

  let body;
  if (m.step === 1) {
    body = (
      <>
        <MemberNameFields mv={mv} onField={field} />
        <div className="mt-4">
          <MemberFieldsGrid mv={mv} onField={field} bloodType={false}>
            {families && (
              <Field label="Pamilya">
                <Select value={String(familyNoOf(m))} onChange={(e) => onField('familyNo', Number(e.target.value))}>
                  {families.map((g) => <option key={g.familyNo} value={String(g.familyNo)}>{familyLabel(g)}</option>)}
                </Select>
              </Field>
            )}
          </MemberFieldsGrid>
        </div>
      </>
    );
  } else if (m.step === 2) {
    body = (
      <>
        <p className="text-[13.5px] text-parish-muted mt-0 mb-3">I-tsek ang mga sakramento nga nadawat na niya. Dili kinahanglan ang mga detalye, apan makatabang kini sa among rekord.</p>
        <MemberSacraments mv={mv} onField={field} />
      </>
    );
  } else if (m.step === 3) {
    const nothing = !orgOptions.length && !asked.roles;
    body = (
      <div className="flex flex-col gap-5">
        <p className="text-[13.5px] text-parish-muted m-0">
          {nothing ? 'Wala nay pangutana niini nga lakang para kaniya. Pindota ang “Padayon”.' : 'Ang pag-assign sa mga ministeryo himoon sa kawani sa parokya.'}
        </p>
        {orgOptions.length > 0 && (
          <div>
            <div className="font-semibold text-[14.5px] text-parish-navy">Mga Organisasyon</div>
            <div className="text-[13px] text-parish-muted mb-2.5">I-tsek ang matag organisasyon sa parokya nga miyembro siya.</div>
            <OrganizationChecks options={orgOptions} selected={m.organizations} onToggle={toggleOrganization} />
          </div>
        )}
        {/* Children aren't asked about a Katungdanan (see askedForAge). */}
        {asked.roles && (
          <div>
            <div className="grid gap-4" style={GRID}>
              <Field label="Katungdanan sa GKK">
                <ComboInput placeholder="Pili o isulat ang katungdanan" toggleLabel="Ipakita ang mga katungdanan" options={GKK_ROLES} value={m.gkkRole} onChange={(v) => onField('gkkRole', v)} />
              </Field>
              {parishRoleOptions.length > 0 && (
                <Field label="Katungdanan sa Parish">
                  <OptionSelect placeholder="Walay katungdanan" options={parishRoleOptions} value={m.parishRole} onChange={(v) => onField('parishRole', v)} />
                </Field>
              )}
            </div>
            <div className="text-[12.5px] text-parish-muted mt-1.5">Biyai nga blangko kung walay katungdanan.</div>
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <p className="text-[13.5px] text-parish-muted mt-0 mb-3">Pilia ang iyang kahimtang karon ug i-tsek kung unsa siya ka aktibo sa matag kalihokan. Kini ang iyang tubag sa census.</p>
        <MemberCensusCards memberViews={[mv]} onChange={(_, patch) => onChange(censusCardPatch(m, patch))} />
        <div className="mt-3">
          <Field label="Pahibalo (kung naa)"><TextInput value={m.notes} placeholder="pananglitan: nagtrabaho sa abroad" onChange={(e) => onChange({ notes: e.target.value })} /></Field>
        </div>
      </>
    );
  }

  return (
    <div ref={ref} data-new-member={m.key} className="scroll-mt-4 border-[1.5px] border-[#d4e0f2] rounded-xl bg-[#fdfbf6] p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[16px] text-parish-navy">{mv.displayName}</div>
          <div className="text-[12.5px] text-parish-muted" aria-live="polite">Lakang {m.step} sa {LAST_STEP} · {NEW_MEMBER_STEPS[m.step - 1]}</div>
        </div>
        {removeButton}
      </div>
      <NewMemberSteps step={m.step} onPick={(n) => go({ step: n, tried: false })} />
      <div className="mt-4">{body}</div>
      <div className="flex items-center justify-between gap-3 mt-5">
        {m.step > 1 ? <GhostButton onClick={() => go({ step: m.step - 1, tried: false })} className="px-4 py-2.5 text-[14px]">← Balik</GhostButton> : <span />}
        <PrimaryButton onClick={next} className="px-5 py-2.5 text-[14px]">{m.step < LAST_STEP ? 'Padayon →' : 'Human na'}</PrimaryButton>
      </div>
    </div>
  );
}
