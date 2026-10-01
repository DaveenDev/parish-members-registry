import React, { useState, useRef, useEffect, useId } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useDebounced } from '../hooks.js';
import { toNameCase, toSuffixCase } from '../lib/util.js';
import { syncSpouses, WEDDING_FIELDS } from '../lib/household.js';
import {
  bis, serverErrorInBisaya, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, RELIGION_LABELS, WEDDING_TYPE_LABELS, VOLUNTEER_LABELS,
} from '../lib/bisaya.js';
import {
  blankMember, HEAD, RELATIONSHIPS, CIVIL_STATUSES, RELIGIONS, BLOOD_TYPES, WEDDING_TYPES,
  PARTICIPATION_ITEMS, HELP_WAYS, DEFAULT_ADDRESS, fmtDate,
} from '../constants.js';
import { Field, TextInput, Select, Checkbox, Card, PrimaryButton, GoldButton, GhostButton, Spinner, TribeSelect, FamilyGroupingSelect } from '../components/ui.jsx';
import CreditFooter from '../components/CreditFooter.jsx';
import ParticipationSurvey from '../components/ParticipationSurvey.jsx';
import { ConfirmationPrintSheet } from '../components/PrintSheet.jsx';
import { ThemePickerPopover } from '../components/ThemePicker.jsx';

const STEPS = ['Pamilya ug Ulo', 'Mga Miyembro', 'Mga Sakramento', 'Pag-apil', 'Pagsusi'];
const MEMBER_RELATIONSHIPS = RELATIONSHIPS.filter((r) => r !== HEAD);

function CrossLogo({ size = 82, className = '' }) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" className={className}>
      <circle cx="40" cy="38" r="30" stroke="#e4d3a8" />
      <path d="M40 14l3.2 9.6h10.1l-8.2 5.9 3.1 9.6-8.2-5.9-8.2 5.9 3.1-9.6-8.2-5.9h10.1z" />
      <path d="M40 46v18M31 55h18" />
    </svg>
  );
}

function top() {
  try { requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' })); } catch {}
}

// v2: members[0] is now always the Household Head, entered on Step 1. Older
// drafts don't follow that shape, so they're ignored rather than migrated.
const DRAFT_KEY = 'pmr_registration_draft_v2';
const EMPTY_HOUSEHOLD = {
  householdName: '', street: '', barangay: '', ...DEFAULT_ADDRESS,
  contact: '', email: '', gkk: '', familyGrouping: '',
  participation: {}, helpWays: [],
};

function blankHead() {
  return { ...blankMember(), relationship: HEAD };
}

function fullName(m) {
  return [m.firstName, m.middleName, m.lastName, m.suffix].filter(Boolean).join(' ');
}

/**
 * What actually gets sent for a member: names in Capitalized case, and the
 * wedding type only while Married.
 */
function toPayloadMember({ civilFromHead, weddingFromHead, ...m }) {
  const named = {
    ...m,
    firstName: toNameCase(m.firstName), middleName: toNameCase(m.middleName),
    lastName: toNameCase(m.lastName), suffix: toSuffixCase(m.suffix),
  };
  if (m.civilStatus === 'Married') return { ...named, hasMatrimony: m.matType === 'Catholic Marriage' };
  return { ...named, matType: WEDDING_TYPES.includes(m.matType) ? '' : m.matType };
}

/** Alternatives offered when the household name is already taken. */
function householdNameCandidates(household, head) {
  const last = toNameCase(head.lastName);
  if (!last) return [];
  const first = toNameCase(head.firstName);
  const barangay = String(household.barangay || '').trim();
  return [
    first && `${first} ${last} Family`,
    barangay && `${last} Family (${barangay})`,
    first && barangay && `${first} ${last} Family (${barangay})`,
  ].filter(Boolean);
}

/** Restore an in-progress registration so a refresh doesn't discard everything. */
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object' || !Array.isArray(draft.members) || !draft.members.length) return null;
    if (draft.members[0].relationship !== HEAD) return null;
    return draft;
  } catch {
    return null;
  }
}

export default function RegistrationApp() {
  const draft = useRef(loadDraft()).current;

  const [screen, setScreen] = useState(draft ? 'wizard' : 'landing');
  const [step, setStep] = useState(draft?.step || 1);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [household, setHousehold] = useState(draft?.household ? { ...EMPTY_HOUSEHOLD, ...draft.household } : EMPTY_HOUSEHOLD);
  const [householdNameTouched, setHouseholdNameTouched] = useState(!!draft?.householdNameTouched);
  const [members, setMembers] = useState(draft?.members || [blankHead()]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [orgOptions, setOrgOptions] = useState([]);
  const [nameCheck, setNameCheck] = useState({ name: '', status: 'idle' }); // idle | available | taken | error
  const [nameSuggestion, setNameSuggestion] = useState('');
  const [volunteer, setVolunteer] = useState(draft?.volunteer || '');
  const [notifyOptin, setNotifyOptin] = useState(!!draft?.notifyOptin);
  const [consent, setConsent] = useState(!!draft?.consent);
  const [err, setErr] = useState({});
  const [memberErr, setMemberErr] = useState([]);
  const [banner, setBanner] = useState('');
  const [refNo, setRefNo] = useState('');
  const [toast, setToast] = useState(null);
  const [errorFocusTick, setErrorFocusTick] = useState(0);

  // After a failed "Padayon", bring the first invalid field into view and
  // focus it (Field marks it aria-invalid). Errors without a field, like the
  // consent box, fall back to the banner at the top.
  useEffect(() => {
    if (!errorFocusTick) return;
    const field = document.querySelector('[aria-invalid="true"]');
    if (field) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.focus({ preventScroll: true });
    } else {
      document.getElementById('wizard-banner')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [errorFocusTick]);

  useEffect(() => {
    if (screen !== 'wizard') return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, household, householdNameTouched, members, volunteer, notifyOptin, consent }));
    } catch {}
  }, [screen, step, household, householdNameTouched, members, volunteer, notifyOptin, consent]);

  useEffect(() => {
    api.listPublicGkks().then(setGkkOptions).catch(() => {});
    api.listPublicOrganizations().then(setOrgOptions).catch(() => {});
  }, []);

  // Household names are unique parish-wide. Check as the name settles, and if
  // it's taken, find the first free alternative to offer as a one-tap fix.
  const trimmedName = household.householdName.trim();
  const debouncedName = useDebounced(trimmedName, 400);
  useEffect(() => {
    if (!debouncedName) { setNameCheck({ name: '', status: 'idle' }); return; }
    let cancelled = false;
    api.householdNameAvailable(debouncedName)
      .then((ok) => { if (!cancelled) setNameCheck({ name: debouncedName, status: ok ? 'available' : 'taken' }); })
      .catch(() => { if (!cancelled) setNameCheck({ name: debouncedName, status: 'error' }); });
    return () => { cancelled = true; };
  }, [debouncedName]);

  const nameStatus = !trimmedName ? 'idle' : nameCheck.name === trimmedName ? nameCheck.status : 'checking';

  useEffect(() => {
    setNameSuggestion('');
    if (nameStatus !== 'taken') return;
    let cancelled = false;
    (async () => {
      for (const candidate of householdNameCandidates(household, members[0])) {
        if (candidate.toLowerCase() === trimmedName.toLowerCase()) continue;
        try {
          if (await api.householdNameAvailable(candidate)) {
            if (!cancelled) setNameSuggestion(candidate);
            return;
          }
        } catch {
          return;
        }
      }
    })();
    return () => { cancelled = true; };
    // Only re-run when the name's verdict changes, not on every keystroke elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameStatus, trimmedName]);

  /** The name's availability, asking the server directly if the debounced check hasn't caught up. */
  async function confirmNameStatus() {
    if (nameStatus === 'available' || nameStatus === 'taken') return nameStatus;
    try {
      const ok = await api.householdNameAvailable(trimmedName);
      setNameCheck({ name: trimmedName, status: ok ? 'available' : 'taken' });
      return ok ? 'available' : 'taken';
    } catch {
      return 'error'; // don't block on a network hiccup; submit_registration re-checks
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  function showToast(msg, tone = 'ok') {
    if (!msg) return;
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2800);
  }

  function updateHousehold(field, value) {
    setHousehold((h) => ({ ...h, [field]: value }));
    // Clearing the name hands it back to the "{Lastname} Family" auto-fill.
    if (field === 'householdName') setHouseholdNameTouched(!!value);
    setErr((e) => ({ ...e, [field]: '' }));
    setBanner('');
  }
  function setParticipation(key, level) {
    setHousehold((h) => ({ ...h, participation: { ...(h.participation || {}), [key]: level } }));
  }
  function toggleHelpWay(key) {
    setHousehold((h) => {
      const set = new Set(h.helpWays || []);
      set.has(key) ? set.delete(key) : set.add(key);
      return { ...h, helpWays: HELP_WAYS.map(([k]) => k).filter((k) => set.has(k)) };
    });
  }
  function updateMember(i, field, value) {
    setMembers((ms) => syncSpouses(ms.map((m, idx) => {
      if (idx !== i) return m;
      const next = { ...m, [field]: value };
      if (i > 0 && field === 'relationship') next.civilFromHead = value === 'Spouse';
      if (i > 0 && field === 'civilStatus') next.civilFromHead = false;
      if (i > 0 && WEDDING_FIELDS.includes(field)) next.weddingFromHead = false;
      return next;
    })));
    // Picking "Spouse" may fill civil status in, so clear that error too.
    const cleared = field === 'relationship' ? [field, 'civilStatus'] : [field];
    setMemberErr((me) => me.map((e, idx) => (idx === i && e ? { ...e, ...Object.fromEntries(cleared.map((f) => [f, ''])) } : e)));
    setBanner('');
    if (i === 0 && field === 'lastName' && !householdNameTouched) {
      const last = toNameCase(value);
      setHousehold((h) => ({ ...h, householdName: last ? `${last} Family` : '' }));
      setErr((e) => ({ ...e, householdName: '' }));
    }
  }
  function toggleOrganization(i, name) {
    setMembers((ms) =>
      ms.map((m, idx) => {
        if (idx !== i) return m;
        const set = new Set(m.organizations || []);
        set.has(name) ? set.delete(name) : set.add(name);
        return { ...m, organizations: [...set] };
      })
    );
  }
  function addMember() {
    // Most members share the head's surname, so start with it (still editable).
    setMembers((ms) => [...ms, { ...blankMember(), lastName: toNameCase(ms[0]?.lastName) }]);
    showToast('Nadugang ang miyembro', 'ok');
  }
  function removeMember(i) {
    if (i === 0) return; // the Household Head is required
    setMembers((ms) => ms.filter((_, idx) => idx !== i));
    setMemberErr((me) => me.filter((_, idx) => idx !== i));
    showToast('Natangtang ang miyembro', 'ok');
  }

  function memberErrors(m, { head = false } = {}) {
    const fe = {};
    const req = [['lastName', 'Kinahanglan ang apelyido'], ['firstName', 'Kinahanglan ang ngalan'], ['sex', 'Pilia ang kasarian'], ['dob', 'Kinahanglan ang adlaw sa pagkatawo'], ['civilStatus', 'Pilia ang kahimtang sibil']];
    if (!head) req.push(['relationship', 'Pilia ang relasyon sa ulo sa pamilya']);
    req.forEach(([k, msg]) => { if (!String(m[k] || '').trim()) fe[k] = msg; });
    if (m.email && !/.+@.+\..+/.test(m.email)) fe.email = 'Isulat ang saktong email';
    return fe;
  }

  function validate(currentStep) {
    const e = {};
    const me = [];
    if (currentStep === 1) {
      const req = { householdName: 'Kinahanglan ang ngalan sa pamilya', street: 'Kinahanglan ang dalan', barangay: 'Kinahanglan ang barangay', city: 'Kinahanglan ang siyudad / lungsod', province: 'Kinahanglan ang probinsya', zip: 'Kinahanglan ang ZIP code' };
      Object.keys(req).forEach((k) => { if (!String(household[k] || '').trim()) e[k] = req[k]; });
      if (household.email && !/.+@.+\..+/.test(household.email)) e.email = 'Isulat ang saktong email';
      me[0] = memberErrors(members[0], { head: true });
      const ok = Object.keys(e).length === 0 && Object.keys(me[0]).length === 0;
      return { ok, err: e, memberErr: me, banner: ok ? '' : 'Palihug kompletoha ang mga gimarkahan nga detalye sa ulo sa pamilya ug sa pamilya.' };
    }
    if (currentStep === 2) {
      let ok = true;
      members.forEach((m, i) => {
        if (i === 0) return;
        me[i] = memberErrors(m);
        if (Object.keys(me[i]).length) ok = false;
      });
      return { ok, err: e, memberErr: me, banner: ok ? '' : 'Palihug kompletoha ang gikinahanglan nga detalye sa mga miyembro.' };
    }
    if (currentStep === 4) {
      if (!consent) return { ok: false, err: e, memberErr: me, banner: 'Kinahanglan ang inyong pagtugot sa data privacy aron makapadayon.' };
      return { ok: true, err: e, memberErr: me, banner: '' };
    }
    return { ok: true, err: e, memberErr: me, banner: '' };
  }

  async function next() {
    let v = validate(step);
    if (v.ok && step === 1 && (await confirmNameStatus()) === 'taken') {
      const banner = 'Narehistro na kana nga ngalan sa pamilya. Pindota ang “Usba” aron mopili og lain.';
      v = { ok: false, err: { householdName: `Narehistro na ang “${trimmedName}”` }, memberErr: [], banner };
    }
    if (!v.ok) {
      setErr(v.err); setMemberErr(v.memberErr); setBanner(v.banner);
      setErrorFocusTick((t) => t + 1); // jump to the first problem once it renders
      return;
    }
    setErr({}); setMemberErr([]); setBanner('');
    if (step < 5) { setStep((s) => s + 1); top(); }
  }
  function back() {
    if (step === 1) { setScreen('landing'); top(); }
    else { setStep((s) => s - 1); top(); }
  }
  function goStep(n) { setStep(n); setScreen('wizard'); setBanner(''); top(); }

  function openConfirm() {
    if (!consent) { showToast('Palihug ihatag ang pagtugot sa data privacy aron makapadala', 'error'); setStep(4); top(); return; }
    setConfirmOpen(true);
  }

  async function submit() {
    setSubmitting(true); setConfirmOpen(false);
    try {
      const res = await api.submitRegistration({ household, members: members.map(toPayloadMember), volunteer, notifyOptin, consent });
      setRefNo(res.refNo);
      clearDraft();
      setScreen('done');
      top();
    } catch (e) {
      showToast(serverErrorInBisaya(e.message), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    clearDraft();
    setScreen('landing'); setStep(1);
    setHousehold(EMPTY_HOUSEHOLD); setHouseholdNameTouched(false);
    setMembers([blankHead()]); setVolunteer(''); setNotifyOptin(false); setConsent(false);
    setErr({}); setMemberErr([]); setBanner(''); setRefNo('');
    top();
  }

  const memberViews = members.map((m, i) => ({
    ...m, mi: i,
    displayName: [m.firstName, m.lastName, m.suffix].filter(Boolean).join(' ') || (i === 0 ? 'Ulo sa Pamilya' : `Miyembro ${i + 1}`),
    err: memberErr[i] || {},
  }));

  return (
    <div className="min-h-screen relative font-sans">
      {screen === 'landing' && <Landing household={household} onStart={() => { setScreen('wizard'); top(); }} />}
      {screen === 'wizard' && (
        <Wizard
          step={step} banner={banner}
          household={household} err={err} onHouseholdField={updateHousehold} gkkOptions={gkkOptions}
          nameStatus={nameStatus} nameSuggestion={nameSuggestion}
          onParticipation={setParticipation} onToggleHelpWay={toggleHelpWay}
          memberViews={memberViews} onMemberField={updateMember}
          orgOptions={orgOptions} onToggleOrganization={toggleOrganization}
          onAddMember={addMember} onRemoveMember={removeMember}
          volunteer={volunteer} setVolunteer={(v) => { setVolunteer(v); setBanner(''); }}
          notifyOptin={notifyOptin} setNotifyOptin={setNotifyOptin}
          consent={consent} setConsent={setConsent}
          onBack={back} onNext={next} onGoStep={goStep}
          submitting={submitting} onOpenConfirm={openConfirm}
        />
      )}
      {screen === 'done' && <Confirmation refNo={refNo} householdName={household.householdName} onRestart={restart} />}

      {confirmOpen && (
        <ConfirmModal
          memberViews={memberViews}
          onCancel={() => setConfirmOpen(false)}
          onAddMore={() => { setConfirmOpen(false); setStep(2); top(); }}
          onSubmit={submit}
        />
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-24 z-[60] -translate-x-1/2 animate-fadeUp">
          <div className={`flex items-center gap-2.5 px-[18px] py-3 rounded-xl shadow-card font-semibold text-[14.5px] max-w-[88vw] border ${
            toast.tone === 'error' ? 'bg-parish-errorBg text-parish-error border-parish-errorBorder' : 'bg-parish-okBg text-parish-ok border-parish-okBorder'
          }`}>
            <span>{toast.tone === 'error' ? '!' : '✓'}</span><span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Landing({ onStart }) {
  const [stats, setStats] = useState(null);
  const [logo, setLogo] = useState(null);
  useEffect(() => {
    api.publicStats().then(setStats).catch(() => {});
    // Before 0004 is run (or with no logo uploaded) this fails or is null — keep the cross.
    api.publicParishLogo().then(setLogo).catch(() => {});
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 py-12" style={{ background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' }}>
      <div className="fixed top-4 right-4 z-40">
        <ThemePickerPopover align="right" label="Kolor" />
      </div>
      <div className="max-w-[560px] animate-fadeUp">
        <div data-section-id="parish-logo" className="text-parish-gold flex justify-center mb-1.5">
          {logo ? (
            <img src={logo} alt="Parish logo" className="w-[82px] h-[82px] object-contain" />
          ) : (
            <CrossLogo />
          )}
        </div>
        <div className="font-semibold text-[13px] tracking-[.22em] uppercase text-[var(--p-gold-deep)] mb-3.5">Rehistro sa mga Miyembro sa Parokya</div>
        <h1 className="font-serif font-semibold text-[clamp(38px,8vw,58px)] leading-[1.04] m-0 mb-1.5 text-parish-navy">Our Lady of Guadalupe</h1>
        <div className="font-serif text-[clamp(19px,4vw,24px)] text-parish-blue tracking-[.04em] mb-[22px]">Quasi&#8209;Parish · Mua&#8209;an</div>
        <p className="text-[clamp(16px,3.6vw,18px)] leading-relaxed text-parish-text2 max-w-[440px] mx-auto mb-8">
          Maayong pag-abot! Irehistro ang inyong pamilya sa parokya aron kita magpabiling magkasinabot, magkauban sa pagsaulog sa mga sakramento, ug mag-alagaray sa usag usa diha sa pagtuo.
        </p>
        {stats && (
          <div className="grid grid-cols-2 gap-3 max-w-[400px] mx-auto mb-8">
            <LandingStat value={stats.gkks} label="Mga GKK sa Parokya" />
            <LandingStat value={stats.households} label="Narehistro nga Pamilya" />
          </div>
        )}
        <PrimaryButton onClick={onStart} className="px-10 py-[18px] text-[17px]">Irehistro ang Inyong Pamilya</PrimaryButton>
        <div className="mt-7 inline-flex items-center gap-2 text-[13.5px] text-parish-muted">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <span>Pribado ang inyong impormasyon — makita lamang sa awtorisadong kawani sa parokya.</span>
        </div>
        <div className="mt-[30px] pt-[22px] border-t border-[#e7dcc4]">
          <Link to="/admin/login" className="inline-block py-2.5 font-semibold text-[14px] text-parish-blue">Kawani sa parokya? Mag-sign in sa admin panel →</Link>
        </div>
        <CreditFooter inline />
      </div>
    </div>
  );
}

function LandingStat({ value, label }) {
  return (
    <div className="bg-white/70 border border-[#e7dcc4] rounded-2xl px-4 py-3.5 animate-fadeUp">
      <div className="font-serif font-semibold text-[34px] leading-none text-parish-blue">{Number(value || 0).toLocaleString()}</div>
      <div className="font-semibold text-[12px] tracking-[.08em] uppercase text-parish-muted mt-1.5">{label}</div>
    </div>
  );
}

function Confirmation({ refNo, householdName, onRestart }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 py-12" style={{ background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' }}>
      <ConfirmationPrintSheet refNo={refNo} householdName={householdName} />
      <div className="max-w-[520px] animate-fadeUp">
        <div className="w-[82px] h-[82px] rounded-full bg-[#eaf4ee] flex items-center justify-center mx-auto mb-[22px] text-[#3a8a5e]">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <h1 className="font-serif font-semibold text-[clamp(32px,7vw,46px)] leading-tight m-0 mb-2.5 text-parish-navy">Maayong pag-abot sa pamilya!</h1>
        <p className="text-[16.5px] leading-relaxed text-parish-text2 mb-[26px]">
          Narehistro na ang inyong pamilya sa <strong>Our Lady of Guadalupe Quasi-Parish, Mua-an</strong>. Susihon ug pamatud-an sa among kawani sa parokya ang inyong mga detalye sa dili madugay.
        </p>
        <Card className="p-[clamp(18px,5vw,26px)] mb-[26px]">
          <div className="font-semibold text-[12px] tracking-[.16em] uppercase text-[var(--p-gold-deep)] mb-2">Inyong Reference Number</div>
          {/* Sized to the screen so "OLG-2026-XXXXXX" stays on one line on small phones. */}
          <div className="font-serif font-semibold text-[clamp(20px,6.8vw,36px)] tracking-[.06em] text-parish-blue whitespace-nowrap">{refNo}</div>
          <div className="text-[13px] text-parish-muted mt-2">Palihug tipigi kini isip inyong rekord.</div>
        </Card>
        <div className="flex gap-3 justify-center flex-wrap">
          <GhostButton onClick={() => window.print()} className="px-6 py-3.5 text-[15px] !border-[#cdd7e8] !text-parish-blue bg-white">I-print ang kumpirmasyon</GhostButton>
          <PrimaryButton onClick={onRestart} className="px-[26px] py-3.5 text-[15px]">Magrehistro og laing pamilya</PrimaryButton>
        </div>
        <CreditFooter inline />
      </div>
    </div>
  );
}

function StepDots({ step }) {
  return (
    <div className="flex flex-wrap gap-2.5 justify-center">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-[29px] h-[29px] rounded-full flex items-center justify-center font-bold text-[13px] border-2 transition-all"
              style={{
                borderColor: active ? 'var(--p-blue)' : done ? '#c6d3ea' : '#e6dcc7',
                background: active ? 'var(--p-blue)' : done ? 'var(--p-blue-tint)' : '#fff',
                color: active ? '#fff' : done ? 'var(--p-blue)' : '#a79f8a',
              }}
            >
              {n}
            </div>
            <span className="font-semibold text-[12.5px]" style={{ color: active || done ? 'var(--p-navy)' : '#a79f8a' }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Wizard(props) {
  const { step, banner, onBack, onNext, submitting, onOpenConfirm } = props;
  const progressPct = (step / 5) * 100;
  return (
    <div>
      <div className="sticky top-0 z-[15] bg-parish-bg/90 backdrop-blur-md border-b border-parish-border px-[18px] pt-3 pb-3 sm:pt-4 sm:pb-[18px]">
        <div className="max-w-[880px] mx-auto">
          <div className="hidden sm:flex items-center gap-2.5 justify-center mb-4 text-parish-gold">
            <svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
            <span className="font-serif text-[20px] font-semibold text-parish-navy">OLG Quasi&#8209;Parish · Mua&#8209;an</span>
          </div>
          {/* Phones: one line instead of five wrapped step labels, to keep the form visible. */}
          <div className="sm:hidden text-center text-[14px] font-semibold text-parish-navy" aria-live="polite">
            <span className="text-parish-muted font-medium">Lakang {step} sa {STEPS.length} · </span>{STEPS[step - 1]}
          </div>
          <div className="hidden sm:block"><StepDots step={step} /></div>
          <div className="h-[5px] bg-[#eaddc2] rounded-full mt-2.5 sm:mt-3.5 mx-auto max-w-[520px] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,var(--p-blue),var(--p-gold))' }} />
          </div>
        </div>
      </div>

      <div className="max-w-[880px] mx-auto px-[18px] pt-[26px] pb-[150px]">
        {banner && (
          <div id="wizard-banner" role="alert" className="flex gap-2.5 items-start bg-parish-errorBg border border-parish-errorBorder text-parish-error rounded-xl px-4 py-3.5 mb-5 text-[14.5px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none mt-px"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>
            <span>{banner}</span>
          </div>
        )}

        {step === 1 && <StepHousehold {...props} />}
        {step === 2 && <StepMembers {...props} />}
        {step === 3 && <StepSacraments {...props} />}
        {step === 4 && <StepEngagement {...props} />}
        {step === 5 && <StepReview {...props} />}
        <CreditFooter inline />
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-[16] bg-parish-bg/95 backdrop-blur-md border-t border-parish-border px-[18px] py-2.5 sm:py-3.5">
        <div className="max-w-[880px] mx-auto flex gap-3 justify-between items-center">
          <GhostButton onClick={onBack} className="px-4 sm:px-5 py-3 sm:py-3.5 text-[15px]">{step === 1 ? '← Sinugdanan' : '← Balik'}</GhostButton>
          {step !== 5 && <PrimaryButton onClick={onNext} className="px-6 sm:px-[30px] py-3 sm:py-3.5 text-[16px]">Padayon →</PrimaryButton>}
          {step === 5 && (
            <GoldButton onClick={onOpenConfirm} disabled={submitting} className="px-5 sm:px-[30px] py-3 sm:py-3.5 text-[16px] flex items-center gap-2.5">
              {submitting ? (<><Spinner />Ginapadala…</>) : 'Ipadala ang Rehistro'}
            </GoldButton>
          )}
        </div>
      </div>
    </div>
  );
}

const GRID = { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' };

/**
 * Household name: filled in automatically from the head's last name and
 * locked until "Edit" is pressed. Shows whether the name is still free.
 */
function HouseholdNameField({ value, error, status, suggestion, onChange }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const inputId = useId();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function toggle() {
    if (editing) onChange(value.trim());
    setEditing((e) => !e);
  }

  const statusLine = {
    checking: <span className="text-parish-muted">Gisusi kung magamit pa kini nga ngalan…</span>,
    available: <span className="text-parish-ok font-semibold">✓ Magamit kini nga ngalan</span>,
    taken: <span className="text-parish-error font-semibold">✗ Narehistro na ang “{value.trim()}”. Palihug gamit og laing ngalan.</span>,
  }[status];

  return (
    <Field label="Ngalan sa Pamilya" required error={error} inputId={inputId}>
      <div className="flex gap-2">
        <TextInput
          id={inputId}
          aria-invalid={error ? true : undefined}
          ref={inputRef}
          placeholder={editing ? 'pananglitan: Dela Cruz Family' : 'Mapuno gikan sa apelyido'}
          value={value}
          readOnly={!editing}
          aria-readonly={!editing}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (editing && e.key === 'Enter') toggle(); }}
          className={`flex-1 ${editing ? '' : '!bg-[#f4efe3] !text-parish-text2 cursor-default'}`}
        />
        <GhostButton type="button" onClick={toggle} className="px-4 text-[14px] flex-none !border-[#cdd7e8] !text-parish-blue bg-white">
          {editing ? 'Human na' : 'Usba'}
        </GhostButton>
      </div>
      {!error && statusLine && <div className="text-[12.5px] mt-1.5">{statusLine}</div>}
      {status === 'taken' && suggestion && (
        <button
          type="button"
          onClick={() => { onChange(suggestion); setEditing(false); }}
          className="mt-2 appearance-none cursor-pointer border-[1.5px] border-[#9db9e0] bg-[var(--p-blue-tint)] text-parish-blue font-semibold text-[13px] px-3 py-1.5 rounded-lg"
        >
          Gamita ang “{suggestion}”
        </button>
      )}
    </Field>
  );
}

function StepHousehold({ household, err, onHouseholdField, gkkOptions, memberViews, onMemberField, onParticipation, onToggleHelpWay, nameStatus, nameSuggestion }) {
  const f = (field) => ({ value: household[field], onChange: (e) => onHouseholdField(field, e.target.value) });
  const head = memberViews[0];
  // Keep a GKK saved in an older draft selectable even if it's no longer in the list.
  const gkks = household.gkk && !gkkOptions.includes(household.gkk) ? [household.gkk, ...gkkOptions] : gkkOptions;
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Pamilya ug Ulo sa Pamilya</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[26px]">Sugdan nato sa ulo sa inyong pamilya, sa inyong puy-anan, ug kung unsaon pagkontak sa parokya kaninyo.</p>

      <Card className="p-[clamp(20px,4vw,32px)] mb-5">
        <SectionTitle>Ulo sa Pamilya</SectionTitle>
        <MemberNameFields mv={head} onField={onMemberField} />
        <div className="mt-[18px]">
          <HouseholdNameField
            value={household.householdName}
            error={err.householdName}
            status={nameStatus}
            suggestion={nameSuggestion}
            onChange={(v) => onHouseholdField('householdName', v)}
          />
        </div>
        <div className="mt-[18px]">
          <MemberFieldsGrid mv={head} onField={onMemberField} head />
        </div>
      </Card>

      <Card className="p-[clamp(20px,4vw,32px)] mb-5">
        <SectionTitle>Puy-anan ug Kontak</SectionTitle>
        <div className="mb-[18px]">
          <Field label="Dalan / Numero sa Balay / Purok" required error={err.street}>
            <TextInput placeholder="pananglitan: Purok 3, 24 Rizal St." {...f('street')} />
          </Field>
        </div>
        <div className="grid gap-4 mb-[18px]" style={GRID}>
          <Field label="Barangay" required error={err.barangay}><TextInput placeholder="pananglitan: Mua-an" {...f('barangay')} /></Field>
          <Field label="Siyudad / Lungsod" required error={err.city}><TextInput {...f('city')} /></Field>
        </div>
        <div className="grid gap-4 mb-[18px]" style={GRID}>
          <Field label="Probinsya" required error={err.province}><TextInput {...f('province')} /></Field>
          <Field label="ZIP Code" required error={err.zip}><TextInput inputMode="numeric" {...f('zip')} /></Field>
        </div>
        <div className="grid gap-4 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <Field label="Numero sa kontak sa pamilya" error={err.contact}><TextInput type="tel" placeholder="pananglitan: 0917 123 4567" {...f('contact')} /></Field>
          <Field label="Email sa pamilya" error={err.email}><TextInput type="email" placeholder="opsyonal" {...f('email')} /></Field>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <Field label="GKK sa Parokya">
            <Select {...f('gkk')}>
              <option value="">Pilia ang inyong GKK…</option>
              {gkks.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>
          <Field label="Family Grouping (FG)"><FamilyGroupingSelect placeholder="Pili…" value={household.familyGrouping} onChange={(v) => onHouseholdField('familyGrouping', v)} /></Field>
        </div>
      </Card>

      <Card className="p-[clamp(20px,4vw,32px)]">
        <SectionTitle>Partisipasyon sa Parokya / GKK</SectionTitle>
        <ParticipationSurvey
          participation={household.participation}
          helpWays={household.helpWays}
          onParticipation={onParticipation}
          onToggleHelpWay={onToggleHelpWay}
        />
      </Card>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h3 className="font-serif text-[22px] font-semibold text-parish-navy m-0 mb-4">{children}</h3>;
}

function MemberNameFields({ mv, onField }) {
  const set = (field) => (e) => onField(mv.mi, field, e.target.value);
  // Tidy to "Dela Cruz" style when the field is left, not while typing.
  const tidy = (field, format = toNameCase) => (e) => {
    const formatted = format(e.target.value);
    if (formatted !== e.target.value) onField(mv.mi, field, formatted);
  };
  return (
    <div className="grid gap-4" style={GRID}>
      <Field label="Apelyido" required error={mv.err.lastName}><TextInput value={mv.lastName} onChange={set('lastName')} onBlur={tidy('lastName')} autoCapitalize="words" /></Field>
      <Field label="Ngalan" required error={mv.err.firstName}><TextInput value={mv.firstName} onChange={set('firstName')} onBlur={tidy('firstName')} autoCapitalize="words" /></Field>
      <Field label="Tunga nga ngalan"><TextInput placeholder="apelyido sa inahan" value={mv.middleName} onChange={set('middleName')} onBlur={tidy('middleName')} autoCapitalize="words" /></Field>
      <Field label="Suffix"><TextInput placeholder="Jr., Sr., III" value={mv.suffix || ''} onChange={set('suffix')} onBlur={tidy('suffix', toSuffixCase)} /></Field>
    </div>
  );
}

/** Personal details for one member. `head` hides Relationship (the head's is fixed). */
function MemberFieldsGrid({ mv, onField, head = false }) {
  const set = (field) => (e) => onField(mv.mi, field, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  return (
    <div className="grid gap-4" style={GRID}>
      {!head && (
        <Field label="Relasyon sa ulo sa pamilya" required error={mv.err.relationship}>
          <Select value={mv.relationship} onChange={set('relationship')}>
            <option value="">Pili…</option>
            {MEMBER_RELATIONSHIPS.map((r) => <option key={r} value={r}>{bis(RELATIONSHIP_LABELS, r)}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Kasarian" required error={mv.err.sex}>
        <Select value={mv.sex} onChange={set('sex')}>
          <option value="">Pili…</option>
          {Object.entries(SEX_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Adlaw sa pagkatawo (Birthday)" required error={mv.err.dob}><TextInput type="date" value={mv.dob} onChange={set('dob')} /></Field>
      <Field label="Lugar sa pagkatawo"><TextInput placeholder="Asa gipanganak" value={mv.placeOfBirth} onChange={set('placeOfBirth')} /></Field>
      <Field label="Tribu"><TribeSelect placeholder="Pili…" otherLabel="Uban pa…" value={mv.tribe} onChange={(v) => onField(mv.mi, 'tribe', v)} /></Field>
      <Field label="Kahimtang sibil (Civil status)" required error={mv.err.civilStatus}>
        <Select value={mv.civilStatus} onChange={set('civilStatus')}>
          <option value="">Pili…</option>
          {CIVIL_STATUSES.map((c) => <option key={c} value={c}>{bis(CIVIL_STATUS_LABELS, c)}</option>)}
        </Select>
      </Field>
      <Field label="Numero sa kontak"><TextInput type="tel" placeholder="0917…" value={mv.contact} onChange={set('contact')} /></Field>
      <Field label="Email" error={mv.err.email}><TextInput type="email" placeholder="opsyonal" value={mv.email} onChange={set('email')} /></Field>
      <Field label="Trabaho"><TextInput placeholder="opsyonal" value={mv.occupation} onChange={set('occupation')} /></Field>
      <Field label="Relihiyon">
        <Select value={mv.religion} onChange={set('religion')}>
          {RELIGIONS.map((r) => <option key={r} value={r}>{bis(RELIGION_LABELS, r)}</option>)}
        </Select>
      </Field>
      <div>
        <Field label="Tipo sa dugo (Blood type)">
          <Select value={mv.bloodType} onChange={set('bloodType')}>
            <option value="">Wala mahibal-i / dili gustong isulti</option>
            {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        <div className="text-[12.5px] text-parish-muted mt-1">Makatabang kini sa parokya sa pagpangita og mohatag og dugo kung adunay emerhensya.</div>
      </div>
    </div>
  );
}

function StepMembers({ memberViews, onMemberField, onAddMember, onRemoveMember }) {
  const head = memberViews[0];
  const others = memberViews.slice(1);
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Mga Miyembro sa Pamilya</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[18px]">Idugang ang tanan nga nagpuyo uban ni <strong>{head.displayName}</strong>: ang asawa, matag anak, ug uban pang paryente. Dungan silang matipigan.</p>
      <div className="flex items-center gap-2.5 bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-xl px-4 py-3 mb-[22px] text-[#2b466f] text-[14px]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="flex-none"><path d="M17 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 20v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></svg>
        <span>
          {others.length
            ? <><strong>{memberViews.length}</strong> ka tawo na sa pamilya karon, apil ang ulo. Pindota ang <strong>“Idugang og Laing Miyembro”</strong> para sa matag tawo una mopadayon.</>
            : <>Ang ulo pa lang sa pamilya ang nalista. Pindota ang <strong>“Idugang og Laing Miyembro”</strong> para sa matag tawo nga nagpuyo uban kaniya, o padayon kung nag-inusara ra siya.</>}
        </span>
      </div>
      <div className="flex flex-col gap-5">
        {others.map((mv) => (
          <Card key={mv.mi} className="p-[clamp(18px,4vw,28px)]">
            <div className="flex items-center justify-between gap-3 mb-[18px]">
              <div className="flex items-center gap-2.5">
                <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[15px]">{mv.mi + 1}</div>
                <span className="font-serif text-[22px] font-semibold text-parish-navy">{mv.displayName}</span>
              </div>
              <button onClick={() => onRemoveMember(mv.mi)} className="border border-[#e7d5cf] bg-white text-parish-error cursor-pointer font-semibold text-[13.5px] px-3.5 py-2.5 rounded-lg">Tangtangon</button>
            </div>
            <MemberNameFields mv={mv} onField={onMemberField} />
            <div className="mt-4">
              <MemberFieldsGrid mv={mv} onField={onMemberField} />
            </div>
          </Card>
        ))}
      </div>
      <button onClick={onAddMember} className="mt-5 w-full appearance-none cursor-pointer py-4 font-bold text-[15.5px] text-parish-blue bg-white border-[1.5px] border-dashed border-[#b9c6de] rounded-2xl flex items-center justify-center gap-2.5 hover:bg-[#f4f7fc] hover:border-parish-blue transition">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>
        Idugang og Laing Miyembro
      </button>
    </div>
  );
}

function SacramentBlock({ mv, field, dateField, churchField, label, extra, onField }) {
  const checked = mv[field];
  const set = (f) => (e) => onField(mv.mi, f, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  return (
    <div className="border border-[#eee3ce] rounded-xl px-4 py-1.5 bg-[#fdfbf6]">
      {/* The whole row is the tap target, not just the small checkbox. */}
      <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
        <Checkbox checked={checked} onChange={set(field)} />
        <span className="font-semibold text-[15px] text-parish-navy">{label}</span>
      </label>
      {checked && (
        <div className="grid gap-3 mt-1 mb-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <input type="date" value={mv[dateField]} onChange={set(dateField)} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
          <input type="text" placeholder="Parokya / Simbahan" value={mv[churchField]} onChange={set(churchField)} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
          {extra && extra(set)}
        </div>
      )}
    </div>
  );
}

function StepSacraments({ memberViews, onMemberField }) {
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Mga Sakramento</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[26px]">I-tsek ang mga sakramento nga nadawat na sa matag miyembro. Dili kinahanglan ang mga detalye, apan makatabang kini sa among rekord.</p>
      <div className="flex flex-col gap-5">
        {memberViews.map((mv, i) => (
          <Card key={i} className="p-[clamp(18px,4vw,28px)]">
            <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-[#f0e8d6]">
              <div className="w-8 h-8 rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[14px]">{i + 1}</div>
              <span className="font-serif text-[21px] font-semibold text-parish-navy">{mv.displayName}</span>
            </div>
            <div className="flex flex-col gap-3">
              <SacramentBlock mv={mv} field="hasBaptism" dateField="baptismDate" churchField="baptismChurch" label="Bunyag (Baptism)" onField={onMemberField} />
              <SacramentBlock mv={mv} field="hasCommunion" dateField="communionDate" churchField="communionChurch" label="Unang Kumunyon (First Communion)" onField={onMemberField} />
              <SacramentBlock
                mv={mv} field="hasConfirmation" dateField="confDate" churchField="confChurch" label="Kumpil (Confirmation)" onField={onMemberField}
                extra={(set) => (
                  <>
                    <input type="text" placeholder="Ngalan sa kumpil" value={mv.confName} onChange={set('confName')} className="w-full px-3 py-2.5 text-[15px] bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
                    <input type="text" placeholder="Maninoy / Maninay" value={mv.confSponsor} onChange={set('confSponsor')} className="w-full px-3 py-2.5 text-[15px] bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
                  </>
                )}
              />
              {mv.civilStatus === 'Married'
                ? <WeddingBlock mv={mv} onField={onMemberField} />
                : <SacramentBlock mv={mv} field="hasMatrimony" dateField="matDate" churchField="matChurch" label="Kasal (Matrimony)" onField={onMemberField} />}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Married members say how they were wed; only a Catholic marriage counts as the sacrament. */
function WeddingBlock({ mv, onField }) {
  const set = (f) => (e) => onField(mv.mi, f, e.target.value);
  function choose(type) {
    onField(mv.mi, 'matType', type);
    onField(mv.mi, 'hasMatrimony', type === 'Catholic Marriage');
  }
  const catholic = mv.matType === 'Catholic Marriage';
  return (
    <div className="border border-[#eee3ce] rounded-xl px-4 py-3.5 bg-[#fdfbf6]">
      <div className="font-semibold text-[15px] text-parish-navy">Kasal (Matrimony)</div>
      <div className="text-[13px] text-parish-muted mb-3">Unsang klase sa kasal?</div>
      <div role="radiogroup" aria-label={`Klase sa kasal ni ${mv.displayName}`} className="flex flex-wrap gap-2">
        {WEDDING_TYPES.map((type) => {
          const checked = mv.matType === type;
          return (
            <label
              key={type}
              className={`cursor-pointer select-none px-3.5 py-2.5 rounded-full border-[1.5px] text-[13.5px] font-semibold transition focus-within:ring-2 focus-within:ring-parish-blue/30 ${
                checked ? 'bg-parish-blue border-parish-blue text-white' : 'bg-white border-parish-borderSoft text-parish-text2 hover:border-parish-blue'
              }`}
            >
              <input type="radio" name={`wedding-${mv.mi}`} value={type} checked={checked} onChange={() => choose(type)} className="sr-only" />
              {bis(WEDDING_TYPE_LABELS, type)}
            </label>
          );
        })}
      </div>
      {catholic && (
        <div className="grid gap-3 mt-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <input type="date" aria-label="Petsa sa kasal" value={mv.matDate} onChange={set('matDate')} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
          <input type="text" placeholder="Parokya / Simbahan" value={mv.matChurch} onChange={set('matChurch')} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
        </div>
      )}
    </div>
  );
}

function StepEngagement({ memberViews, onMemberField, orgOptions, onToggleOrganization, volunteer, setVolunteer, notifyOptin, setNotifyOptin, consent, setConsent }) {
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Pag-apil sa Simbahan</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[22px]">Ang pag-assign sa mga ministeryo himoon sa kawani sa parokya human sa inyong pagbisita.</p>
      {orgOptions.length > 0 && (
        <Card className="p-[clamp(20px,4vw,32px)] mb-5">
          <SectionTitle>Mga Organisasyon</SectionTitle>
          <p className="text-[13.5px] text-parish-muted -mt-2 mb-4">I-tsek ang matag organisasyon sa parokya nga miyembro na ang matag usa.</p>
          <div className="flex flex-col gap-5">
            {memberViews.map((mv) => (
              <fieldset key={mv.mi} className="border-none p-0 m-0 min-w-0">
                <legend className="font-semibold text-[15px] text-parish-navy mb-2">
                  {mv.displayName} <span className="font-medium text-[12.5px] text-parish-muted">· {bis(RELATIONSHIP_LABELS, mv.relationship) || '—'}</span>
                </legend>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                  {orgOptions.map((name) => {
                    const checked = (mv.organizations || []).includes(name);
                    return (
                      <label key={name} className="flex items-center gap-2.5 cursor-pointer border-[1.5px] rounded-xl px-3 py-2.5" style={{ borderColor: checked ? '#9db9e0' : '#e0d6c1', background: checked ? 'var(--p-blue-tint)' : '#fdfbf6' }}>
                        <Checkbox checked={checked} onChange={() => onToggleOrganization(mv.mi, name)} className="flex-none" />
                        <span className="text-[14px] text-parish-ink">{name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        </Card>
      )}
      <Card className="p-[clamp(20px,4vw,32px)] mb-5">
        <SectionTitle>Katungdanan sa GKK</SectionTitle>
        <p className="text-[13.5px] text-parish-muted -mt-2 mb-4">Biyai nga blangko kung walay katungdanan sa GKK.</p>
        <div className="flex flex-col gap-3">
          {memberViews.map((mv) => (
            <div key={mv.mi} className="grid gap-x-4 gap-y-1.5 items-center" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <label htmlFor={`gkk-role-${mv.mi}`} className="font-semibold text-[15px] text-parish-navy">
                {mv.displayName}
                <span className="block text-[12.5px] font-medium text-parish-muted">{bis(RELATIONSHIP_LABELS, mv.relationship) || '—'}</span>
              </label>
              <TextInput id={`gkk-role-${mv.mi}`} placeholder="Katungdanan sa GKK" value={mv.gkkRole || ''} onChange={(e) => onMemberField(mv.mi, 'gkkRole', e.target.value)} />
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-[clamp(20px,4vw,32px)]">
        <div className="mb-[22px]">
          <Field label="Aduna bay sa pamilya nga andam mo-boluntaryo?">
            <Select value={volunteer} onChange={(e) => setVolunteer(e.target.value)} className="max-w-[300px]">
              <option value="">Pili…</option>
              {Object.entries(VOLUNTEER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-3 cursor-pointer p-4 border border-[#eee3ce] rounded-xl bg-[#fdfbf6] mb-3.5">
          <Checkbox checked={notifyOptin} onChange={(e) => setNotifyOptin(e.target.checked)} className="mt-0.5" />
          <span className="text-[14.5px] leading-relaxed text-[#3f3b2f]">Ilakip kami sa email list sa parokya para sa iskedyul sa Misa, mga pista, ug mga pahibalo.</span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-[1.5px] transition" style={{ borderColor: consent ? '#9db9e0' : '#e0d6c1', background: consent ? 'var(--p-blue-tint)' : '#fdfbf6' }}>
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span className="text-[14.5px] leading-relaxed text-[#3f3b2f]">
            <strong className="text-parish-navy">Pagtugot sa Data Privacy <span className="text-parish-gold">*</span></strong> — Nagtugot ko nga kolektahon ug tipigan sa parokya kini nga impormasyon. Pribado kini ug makita lamang sa awtorisadong kawani sa parokya, subay sa Data Privacy Act.
          </span>
        </label>
      </Card>
    </div>
  );
}

function StepReview({ household, memberViews, volunteer, notifyOptin, consent, onGoStep }) {
  const addr = [household.street, household.barangay, household.city, household.province, household.zip].filter(Boolean).join(', ') || '—';
  const participation = household.participation || {};
  const householdReview = [
    ['Ulo sa pamilya', fullName(memberViews[0]) || '—'],
    ['Ngalan sa pamilya', household.householdName || '—'],
    ['Puy-anan', addr],
    ['GKK sa Parokya', household.gkk || '—'],
    ['Family Grouping', household.familyGrouping || '—'],
    ['Kontak', household.contact || '—'],
    ['Email', household.email || '—'],
    ['Partisipasyon', PARTICIPATION_ITEMS.filter(([k]) => participation[k]).map(([k, label]) => `${label}: ${participation[k]}`).join('  ·  ') || '—'],
    ['Paagi sa pagtabang', HELP_WAYS.filter(([k]) => (household.helpWays || []).includes(k)).map(([, label]) => label).join(' ') || '—'],
  ];
  const engReview = [
    ['Boluntaryo', bis(VOLUNTEER_LABELS, volunteer) || '—'],
    ['Email list', notifyOptin ? 'Miapil' : 'Wala miapil'],
    ['Data privacy', consent ? 'Gitugotan' : 'Wala pa gitugoti'],
  ];

  function sacList(m) {
    const j = (arr) => arr.filter(Boolean).join(' · ');
    const s = [];
    if (m.hasBaptism) s.push(['Bunyag', j([fmtDate(m.baptismDate), m.baptismChurch]) || 'Natala']);
    if (m.hasCommunion) s.push(['Unang Kumunyon', j([fmtDate(m.communionDate), m.communionChurch]) || 'Natala']);
    if (m.hasConfirmation) s.push(['Kumpil', j([fmtDate(m.confDate), m.confChurch, m.confName && `Ngalan: ${m.confName}`, m.confSponsor && `Maninoy/Maninay: ${m.confSponsor}`]) || 'Natala']);
    const p = toPayloadMember(m);
    if (p.hasMatrimony) s.push(['Kasal', j([bis(WEDDING_TYPE_LABELS, p.matType), fmtDate(p.matDate), p.matChurch]) || 'Natala']);
    else if (p.matType) s.push(['Minyo', bis(WEDDING_TYPE_LABELS, p.matType)]);
    if (!s.length) s.push(['—', 'Walay natala nga sakramento']);
    return s;
  }

  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Susiha ug Ipadala</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[26px]">Palihug susiha ang mga detalye sa inyong pamilya. Mahimo ninyong usbon ang bisan unsang bahin una ipadala.</p>

      <ReviewCard title="Pamilya" onEdit={() => onGoStep(1)}>
        {householdReview.map(([label, value]) => <ReviewRow key={label} label={label} value={value} />)}
      </ReviewCard>

      <ReviewCard title={`Mga Miyembro (${memberViews.length})`} onEdit={() => onGoStep(2)}>
        <div className="flex flex-col gap-4 mt-3">
          {memberViews.map((m, i) => (
            <div key={i} className="border border-[#f0e8d6] rounded-2xl px-[18px] py-4 bg-[#fdfbf6]">
              <div className="font-serif text-[20px] font-semibold text-parish-navy mb-1">{fullName(m) || m.displayName}</div>
              <div className="text-[13.5px] text-parish-muted mb-3">{[bis(RELATIONSHIP_LABELS, m.relationship), bis(SEX_LABELS, m.sex), bis(CIVIL_STATUS_LABELS, m.civilStatus), m.dob && `natawo ${fmtDate(m.dob)}`, m.tribe && `Tribu: ${m.tribe}`, m.bloodType && `Dugo: ${m.bloodType}`, m.gkkRole && `GKK: ${m.gkkRole}`].filter(Boolean).join('  ·  ') || '—'}</div>
              {!!(m.organizations || []).length && (
                <div className="text-[13.5px] mb-3"><span className="text-parish-blue font-semibold">Mga Organisasyon</span> <span className="text-parish-text2">{m.organizations.join(' · ')}</span></div>
              )}
              <div className="flex flex-col gap-1.5">
                {sacList(m).map(([label, detail]) => (
                  <div key={label} className="flex gap-2.5 text-[14px] items-baseline">
                    <span className="flex-none text-parish-blue font-semibold">{label}</span>
                    <span className="text-parish-text2">{detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ReviewCard>

      <ReviewCard title="Pag-apil" onEdit={() => onGoStep(4)}>
        {engReview.map(([label, value]) => <ReviewRow key={label} label={label} value={value} />)}
      </ReviewCard>

      <div className="flex gap-2.5 items-start bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-2xl px-4 py-3.5 text-[#2b466f] text-[13.5px] leading-relaxed">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-none mt-px"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        <span>Inig padala, kini nga rekord luwas nga matipigan ug makita lamang sa awtorisadong kawani sa parokya.</span>
      </div>
    </div>
  );
}

function ReviewCard({ title, onEdit, children }) {
  return (
    <Card className="p-[clamp(20px,4vw,30px)] mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-[24px] font-semibold m-0 text-parish-navy">{title}</h3>
        <button onClick={onEdit} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[14px] text-parish-blue px-3 py-2.5 -mr-3 rounded-lg hover:bg-[var(--p-blue-tint)]">Usba</button>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </Card>
  );
}
function ReviewRow({ label, value }) {
  return (
    // Phones: label above the value so long addresses and survey answers get the full width.
    <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-3.5 text-[15px] border-b border-[#f4eddd] pb-2.5">
      <span className="sm:flex-none sm:w-[130px] text-parish-muted font-semibold text-[13px] sm:text-[15px]">{label}</span>
      <span className="text-parish-ink break-words">{value}</span>
    </div>
  );
}

function ConfirmModal({ memberViews, onCancel, onAddMore, onSubmit }) {
  const titleId = useId();
  const submitRef = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Focus the main action on open, close on Escape, and hand focus back to
  // whatever opened the dialog when it goes away. Runs once per opening.
  useEffect(() => {
    const opener = document.activeElement;
    submitRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') cancelRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-parish-navy/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-5 animate-fadeUp" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-[22px] max-w-[460px] w-full shadow-2xl p-[clamp(22px,5vw,34px)] max-h-[90vh] overflow-auto"
      >
        <div className="flex items-center gap-2.5 mb-1.5 text-parish-gold">
          <svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
        </div>
        <h3 id={titleId} className="font-serif text-[28px] font-semibold m-0 mb-1.5 text-parish-navy">Andam na ba ipadala?</h3>
        <p className="text-[15px] leading-relaxed text-parish-text2 mb-[18px]">
          Magrehistro kamo og <strong className="text-parish-blue">{memberViews.length}</strong> ka miyembro sa pamilya. Palihug siguroha nga apil ang tanan una mahuman — mahimo pa kamong mobalik ug modugang.
        </p>
        <div className="bg-[#fdfbf6] border border-[#eee3ce] rounded-xl px-3.5 mb-[22px]">
          {memberViews.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5 border-b border-[#f4eddd] last:border-b-0">
              <span className="font-semibold text-[15px] text-parish-navy">{m.displayName}</span>
              <span className="font-medium text-[13px] text-parish-muted">{bis(RELATIONSHIP_LABELS, m.relationship) || '—'}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <GoldButton ref={submitRef} onClick={onSubmit} className="w-full py-4 text-[16px]">Oo, ipadala ang rehistro</GoldButton>
          <GhostButton onClick={onAddMore} className="w-full py-3.5 text-[15px] !border-[#cdd7e8] !text-parish-blue bg-white flex items-center justify-center gap-2">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>Kadiyot — idugang og laing miyembro
          </GhostButton>
          <button onClick={onCancel} className="appearance-none border-none bg-none cursor-pointer w-full py-3 font-semibold text-[14px] text-parish-muted">Padayon sa pagsusi</button>
        </div>
      </div>
    </div>
  );
}
