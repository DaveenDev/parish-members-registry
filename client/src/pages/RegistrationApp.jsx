import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { blankMember, RELATIONSHIPS, CIVIL_STATUSES, RELIGIONS, BLOOD_TYPES, fmtDate } from '../constants.js';
import { Field, TextInput, Select, Checkbox, Card, PrimaryButton, GoldButton, GhostButton, Spinner } from '../components/ui.jsx';
import CreditFooter from '../components/CreditFooter.jsx';
import { ThemePickerPopover } from '../components/ThemePicker.jsx';

const STEPS = ['Household', 'Members', 'Sacraments', 'Engagement', 'Review'];

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

const DRAFT_KEY = 'pmr_registration_draft';
const EMPTY_HOUSEHOLD = {
  householdName: '', street: '', barangay: '', city: '', province: '', zip: '',
  contact: '', email: '', gkk: '', familyGrouping: '',
};

/** Restore an in-progress registration so a refresh doesn't discard everything. */
function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object' || !Array.isArray(draft.members) || !draft.members.length) return null;
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
  const [household, setHousehold] = useState(draft?.household || EMPTY_HOUSEHOLD);
  const [members, setMembers] = useState(draft?.members || [blankMember()]);
  const [volunteer, setVolunteer] = useState(draft?.volunteer || '');
  const [notifyOptin, setNotifyOptin] = useState(!!draft?.notifyOptin);
  const [consent, setConsent] = useState(!!draft?.consent);
  const [err, setErr] = useState({});
  const [memberErr, setMemberErr] = useState([]);
  const [banner, setBanner] = useState('');
  const [refNo, setRefNo] = useState('');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (screen !== 'wizard') return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ step, household, members, volunteer, notifyOptin, consent }));
    } catch {}
  }, [screen, step, household, members, volunteer, notifyOptin, consent]);

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
    setErr((e) => ({ ...e, [field]: '' }));
    setBanner('');
  }
  function updateMember(i, field, value) {
    setMembers((ms) => ms.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
    setMemberErr((me) => me.map((e, idx) => (idx === i && e ? { ...e, [field]: '' } : e)));
    setBanner('');
  }
  function toggleMinistry(i, name) {
    setMembers((ms) =>
      ms.map((m, idx) => {
        if (idx !== i) return m;
        const set = new Set(m.ministries || []);
        set.has(name) ? set.delete(name) : set.add(name);
        return { ...m, ministries: [...set] };
      })
    );
  }
  function addMember() {
    setMembers((ms) => [...ms, blankMember()]);
    showToast('Member added', 'ok');
  }
  function removeMember(i) {
    setMembers((ms) => ms.filter((_, idx) => idx !== i));
    showToast('Member removed', 'ok');
  }

  function validate(currentStep) {
    const e = {};
    const me = [];
    let ban = '';
    if (currentStep === 1) {
      const req = { householdName: 'Household name is required', street: 'Street is required', barangay: 'Barangay is required', city: 'City / Municipality is required', province: 'Province is required', zip: 'ZIP code is required' };
      Object.keys(req).forEach((k) => { if (!String(household[k] || '').trim()) e[k] = req[k]; });
      if (household.email && !/.+@.+\..+/.test(household.email)) e.email = 'Enter a valid email';
      const ok = Object.keys(e).length === 0;
      return { ok, err: e, memberErr: me, banner: ok ? '' : 'Please complete the highlighted household fields.' };
    }
    if (currentStep === 2) {
      let ok = true;
      members.forEach((m, i) => {
        const fe = {};
        [['firstName', 'First name is required'], ['lastName', 'Last name is required'], ['relationship', 'Select a relationship'], ['sex', 'Select sex'], ['dob', 'Date of birth is required'], ['civilStatus', 'Select civil status']].forEach(([k, msg]) => {
          if (!String(m[k] || '').trim()) fe[k] = msg;
        });
        if (m.email && !/.+@.+\..+/.test(m.email)) fe.email = 'Enter a valid email';
        me[i] = fe;
        if (Object.keys(fe).length) ok = false;
      });
      return { ok, err: e, memberErr: me, banner: ok ? '' : 'Please complete the required member details.' };
    }
    if (currentStep === 4) {
      if (!consent) return { ok: false, err: e, memberErr: me, banner: 'Data privacy consent is required to continue.' };
      return { ok: true, err: e, memberErr: me, banner: '' };
    }
    return { ok: true, err: e, memberErr: me, banner: '' };
  }

  function next() {
    const v = validate(step);
    if (!v.ok) {
      setErr(v.err); setMemberErr(v.memberErr); setBanner(v.banner);
      showToast(v.banner, 'error'); top();
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
    if (!consent) { showToast('Please give data privacy consent to submit', 'error'); setStep(4); top(); return; }
    setConfirmOpen(true);
  }

  async function submit() {
    setSubmitting(true); setConfirmOpen(false);
    try {
      const res = await api.submitRegistration({ household, members, volunteer, notifyOptin, consent });
      setRefNo(res.refNo);
      clearDraft();
      setScreen('done');
      top();
    } catch (e) {
      showToast(e.message || 'Could not submit registration', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    clearDraft();
    setScreen('landing'); setStep(1);
    setHousehold(EMPTY_HOUSEHOLD);
    setMembers([blankMember()]); setVolunteer(''); setNotifyOptin(false); setConsent(false);
    setErr({}); setMemberErr([]); setBanner(''); setRefNo('');
    top();
  }

  const memberViews = members.map((m, i) => ({
    ...m, mi: i,
    displayName: [m.firstName, m.lastName].filter(Boolean).join(' ') || `Member ${i + 1}`,
    err: memberErr[i] || {},
  }));

  return (
    <div className="min-h-screen relative font-sans">
      {screen === 'landing' && <Landing household={household} onStart={() => { setScreen('wizard'); top(); }} />}
      {screen === 'wizard' && (
        <Wizard
          step={step} banner={banner}
          household={household} err={err} onHouseholdField={updateHousehold}
          memberViews={memberViews} onMemberField={updateMember} onToggleMinistry={toggleMinistry}
          onAddMember={addMember} onRemoveMember={removeMember}
          volunteer={volunteer} setVolunteer={(v) => { setVolunteer(v); setBanner(''); }}
          notifyOptin={notifyOptin} setNotifyOptin={setNotifyOptin}
          consent={consent} setConsent={setConsent}
          onBack={back} onNext={next} onGoStep={goStep}
          submitting={submitting} onOpenConfirm={openConfirm}
        />
      )}
      {screen === 'done' && <Confirmation refNo={refNo} onRestart={restart} />}

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
      <CreditFooter />
    </div>
  );
}

function Landing({ onStart }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-12" style={{ background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' }}>
      <div className="fixed top-4 right-4 z-40">
        <ThemePickerPopover align="right" />
      </div>
      <div className="max-w-[560px] animate-fadeUp">
        <div className="text-parish-gold flex justify-center mb-1.5">
          <CrossLogo />
        </div>
        <div className="font-semibold text-[13px] tracking-[.22em] uppercase text-[var(--p-gold-deep)] mb-3.5">Parish Members Registry</div>
        <h1 className="font-serif font-semibold text-[clamp(38px,8vw,58px)] leading-[1.04] m-0 mb-1.5 text-parish-navy">Our Lady of Guadalupe</h1>
        <div className="font-serif text-[clamp(19px,4vw,24px)] text-parish-blue tracking-[.04em] mb-[22px]">Quasi&#8209;Parish · Mua&#8209;an</div>
        <p className="text-[clamp(16px,3.6vw,18px)] leading-relaxed text-parish-text2 max-w-[440px] mx-auto mb-8">
          Welcome home. Enroll your household in the parish family so we can keep in touch, celebrate the sacraments together, and serve one another in faith.
        </p>
        <PrimaryButton onClick={onStart} className="px-10 py-[18px] text-[17px]">Register Your Household</PrimaryButton>
        <div className="mt-7 inline-flex items-center gap-2 text-[13.5px] text-parish-muted">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <span>Your information is private — seen only by authorized parish staff.</span>
        </div>
        <div className="mt-[30px] pt-[22px] border-t border-[#e7dcc4]">
          <Link to="/admin/login" className="font-semibold text-[14px] text-parish-blue">Parish staff? Sign in to the admin panel →</Link>
        </div>
      </div>
    </div>
  );
}

function Confirmation({ refNo, onRestart }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-12" style={{ background: 'radial-gradient(120% 90% at 50% -10%,#fefcf7 0%,#f7f2e8 55%,#f1ead9 100%)' }}>
      <div className="max-w-[520px] animate-fadeUp">
        <div className="w-[82px] h-[82px] rounded-full bg-[#eaf4ee] flex items-center justify-center mx-auto mb-[22px] text-[#3a8a5e]">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <h1 className="font-serif font-semibold text-[clamp(32px,7vw,46px)] leading-tight m-0 mb-2.5 text-parish-navy">Welcome to the family</h1>
        <p className="text-[16.5px] leading-relaxed text-parish-text2 mb-[26px]">
          Your household has been registered with <strong>Our Lady of Guadalupe Quasi-Parish, Mua-an</strong>. Our parish staff will review and verify your details shortly.
        </p>
        <Card className="p-[26px] mb-[26px]">
          <div className="font-semibold text-[12px] tracking-[.16em] uppercase text-[var(--p-gold-deep)] mb-2">Your reference number</div>
          <div className="font-serif font-semibold text-[36px] tracking-[.06em] text-parish-blue">{refNo}</div>
          <div className="text-[13px] text-parish-muted mt-2">Please keep this for your records.</div>
        </Card>
        <div className="flex gap-3 justify-center flex-wrap">
          <GhostButton onClick={() => window.print()} className="px-6 py-3.5 text-[15px] !border-[#cdd7e8] !text-parish-blue bg-white">Print confirmation</GhostButton>
          <PrimaryButton onClick={onRestart} className="px-[26px] py-3.5 text-[15px]">Register another household</PrimaryButton>
        </div>
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
      <div className="sticky top-0 z-[15] bg-parish-bg/90 backdrop-blur-md border-b border-parish-border px-[18px] pt-4 pb-[18px]">
        <div className="max-w-[880px] mx-auto">
          <div className="flex items-center gap-2.5 justify-center mb-4 text-parish-gold">
            <svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
            <span className="font-serif text-[20px] font-semibold text-parish-navy">OLG Quasi&#8209;Parish · Mua&#8209;an</span>
          </div>
          <StepDots step={step} />
          <div className="h-[5px] bg-[#eaddc2] rounded-full mt-3.5 mx-auto max-w-[520px] overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg,var(--p-blue),var(--p-gold))' }} />
          </div>
        </div>
      </div>

      <div className="max-w-[880px] mx-auto px-[18px] pt-[26px] pb-[150px]">
        {banner && (
          <div className="flex gap-2.5 items-start bg-parish-errorBg border border-parish-errorBorder text-parish-error rounded-xl px-4 py-3.5 mb-5 text-[14.5px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none mt-px"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>
            <span>{banner}</span>
          </div>
        )}

        {step === 1 && <StepHousehold {...props} />}
        {step === 2 && <StepMembers {...props} />}
        {step === 3 && <StepSacraments {...props} />}
        {step === 4 && <StepEngagement {...props} />}
        {step === 5 && <StepReview {...props} />}
      </div>

      <div className="fixed left-0 right-0 bottom-0 z-[16] bg-parish-bg/95 backdrop-blur-md border-t border-parish-border px-[18px] py-3.5">
        <div className="max-w-[880px] mx-auto flex gap-3 justify-between items-center">
          <GhostButton onClick={onBack} className="px-5 py-3.5 text-[15px]">{step === 1 ? '← Home' : '← Back'}</GhostButton>
          {step !== 5 && <PrimaryButton onClick={onNext} className="px-[30px] py-3.5 text-[16px]">Continue →</PrimaryButton>}
          {step === 5 && (
            <GoldButton onClick={onOpenConfirm} disabled={submitting} className="px-[30px] py-3.5 text-[16px] flex items-center gap-2.5">
              {submitting ? (<><Spinner />Submitting…</>) : 'Submit Registration'}
            </GoldButton>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHousehold({ household, err, onHouseholdField }) {
  const f = (field) => ({ value: household[field], onChange: (e) => onHouseholdField(field, e.target.value) });
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Household Information</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[26px]">Let's start with your family's home and how the parish can reach you.</p>
      <Card className="p-[clamp(20px,4vw,32px)]">
        <div className="mb-[18px]">
          <Field label="Family (household) name" required error={err.householdName}>
            <TextInput placeholder="e.g. Dela Cruz Family" {...f('householdName')} />
          </Field>
        </div>
        <div className="mb-[18px]">
          <Field label="Street / House No. / Purok" required error={err.street}>
            <TextInput placeholder="e.g. 24 Rizal St." {...f('street')} />
          </Field>
        </div>
        <div className="grid gap-4 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <Field label="Barangay" required error={err.barangay}><TextInput placeholder="e.g. Purok 3, Mua-an" {...f('barangay')} /></Field>
          <Field label="City / Municipality" required error={err.city}><TextInput placeholder="e.g. Kabankalan City" {...f('city')} /></Field>
        </div>
        <div className="grid gap-4 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <Field label="Province" required error={err.province}><TextInput placeholder="e.g. Negros Occidental" {...f('province')} /></Field>
          <Field label="ZIP Code" required error={err.zip}><TextInput inputMode="numeric" placeholder="e.g. 6111" {...f('zip')} /></Field>
        </div>
        <div className="grid gap-4 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <Field label="Household contact no." error={err.contact}><TextInput type="tel" placeholder="e.g. 0917 123 4567" {...f('contact')} /></Field>
          <Field label="Household email" error={err.email}><TextInput type="email" placeholder="optional" {...f('email')} /></Field>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <Field label="Parish GKK"><TextInput placeholder="e.g. GKK San Lorenzo Ruiz" {...f('gkk')} /></Field>
          <Field label="Family Groupings"><TextInput placeholder="e.g. Grouping 2" {...f('familyGrouping')} /></Field>
        </div>
      </Card>
    </div>
  );
}

function MemberFieldsGrid({ mv, onField }) {
  const set = (field) => (e) => onField(mv.mi, field, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
      <Field label="First name" required error={mv.err.firstName}><TextInput value={mv.firstName} onChange={set('firstName')} /></Field>
      <Field label="Middle / mother's maiden"><TextInput value={mv.middleName} onChange={set('middleName')} /></Field>
      <Field label="Last name" required error={mv.err.lastName}><TextInput value={mv.lastName} onChange={set('lastName')} /></Field>
      <Field label="Relationship to head" required error={mv.err.relationship}>
        <Select value={mv.relationship} onChange={set('relationship')}>
          <option value="">Select…</option>
          {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
      <Field label="Sex" required error={mv.err.sex}>
        <Select value={mv.sex} onChange={set('sex')}>
          <option value="">Select…</option><option value="Male">Male</option><option value="Female">Female</option>
        </Select>
      </Field>
      <Field label="Date of birth" required error={mv.err.dob}><TextInput type="date" value={mv.dob} onChange={set('dob')} /></Field>
      <Field label="Place of birth"><TextInput value={mv.placeOfBirth} onChange={set('placeOfBirth')} /></Field>
      <Field label="Civil status" required error={mv.err.civilStatus}>
        <Select value={mv.civilStatus} onChange={set('civilStatus')}>
          <option value="">Select…</option>
          {CIVIL_STATUSES.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Contact number"><TextInput type="tel" placeholder="0917…" value={mv.contact} onChange={set('contact')} /></Field>
      <Field label="Email" error={mv.err.email}><TextInput type="email" placeholder="optional" value={mv.email} onChange={set('email')} /></Field>
      <Field label="Occupation"><TextInput placeholder="optional" value={mv.occupation} onChange={set('occupation')} /></Field>
      <Field label="Religion">
        <Select value={mv.religion} onChange={set('religion')}>
          {RELIGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Field>
      <div>
        <Field label="Blood type">
          <Select value={mv.bloodType} onChange={set('bloodType')}>
            <option value="">Unknown / prefer not to say</option>
            {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
        <div className="text-[11.5px] text-parish-muted mt-1">Helps the parish reach blood donors in an emergency.</div>
      </div>
    </div>
  );
}

function StepMembers({ memberViews, onMemberField, onAddMember, onRemoveMember }) {
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Household Members</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[18px]">Add everyone living in your household — begin with the head of the family, then add the spouse and each child. They'll all be saved together.</p>
      <div className="flex items-center gap-2.5 bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-xl px-4 py-3 mb-[22px] text-[#2b466f] text-[14px]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="flex-none"><path d="M17 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 20v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></svg>
        <span><strong>{memberViews.length}</strong> member(s) added so far. Use <strong>“Add Another Member”</strong> below for each person before you continue.</span>
      </div>
      <div className="flex flex-col gap-5">
        {memberViews.map((mv, i) => (
          <Card key={i} className="p-[clamp(18px,4vw,28px)]">
            <div className="flex items-center justify-between gap-3 mb-[18px]">
              <div className="flex items-center gap-2.5">
                <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[15px]">{i + 1}</div>
                <span className="font-serif text-[22px] font-semibold text-parish-navy">{mv.displayName}</span>
              </div>
              {memberViews.length > 1 && (
                <button onClick={() => onRemoveMember(i)} className="border border-[#e7d5cf] bg-white text-parish-error cursor-pointer font-semibold text-[13px] px-3.5 py-2 rounded-lg">Remove</button>
              )}
            </div>
            <MemberFieldsGrid mv={mv} onField={onMemberField} />
          </Card>
        ))}
      </div>
      <button onClick={onAddMember} className="mt-5 w-full appearance-none cursor-pointer py-4 font-bold text-[15.5px] text-parish-blue bg-white border-[1.5px] border-dashed border-[#b9c6de] rounded-2xl flex items-center justify-center gap-2.5 hover:bg-[#f4f7fc] hover:border-parish-blue transition">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>
        Add Another Member
      </button>
    </div>
  );
}

function SacramentBlock({ mv, field, dateField, churchField, label, extra, onField }) {
  const checked = mv[field];
  const set = (f) => (e) => onField(mv.mi, f, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  return (
    <div className="border border-[#eee3ce] rounded-xl px-4 py-3.5 bg-[#fdfbf6]">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <Checkbox checked={checked} onChange={set(field)} />
        <span className="font-semibold text-[15px] text-parish-navy">{label}</span>
      </label>
      {checked && (
        <div className="grid gap-3 mt-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <input type="date" value={mv[dateField]} onChange={set(dateField)} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
          <input type="text" placeholder="Parish / Church" value={mv[churchField]} onChange={set(churchField)} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
          {extra && extra(set)}
        </div>
      )}
    </div>
  );
}

function StepSacraments({ memberViews, onMemberField }) {
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Sacramental Records</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[26px]">Tick the sacraments each member has received. Details are optional but help our records.</p>
      <div className="flex flex-col gap-5">
        {memberViews.map((mv, i) => (
          <Card key={i} className="p-[clamp(18px,4vw,28px)]">
            <div className="flex items-center gap-2.5 mb-4 pb-3.5 border-b border-[#f0e8d6]">
              <div className="w-8 h-8 rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[14px]">{i + 1}</div>
              <span className="font-serif text-[21px] font-semibold text-parish-navy">{mv.displayName}</span>
            </div>
            <div className="flex flex-col gap-3">
              <SacramentBlock mv={mv} field="hasBaptism" dateField="baptismDate" churchField="baptismChurch" label="Baptism" onField={onMemberField} />
              <SacramentBlock mv={mv} field="hasCommunion" dateField="communionDate" churchField="communionChurch" label="First Communion (Eucharist)" onField={onMemberField} />
              <SacramentBlock
                mv={mv} field="hasConfirmation" dateField="confDate" churchField="confChurch" label="Confirmation" onField={onMemberField}
                extra={(set) => (
                  <>
                    <input type="text" placeholder="Confirmation name" value={mv.confName} onChange={set('confName')} className="w-full px-3 py-2.5 text-[15px] bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
                    <input type="text" placeholder="Sponsor" value={mv.confSponsor} onChange={set('confSponsor')} className="w-full px-3 py-2.5 text-[15px] bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
                  </>
                )}
              />
              <SacramentBlock
                mv={mv} field="hasMatrimony" dateField="matDate" churchField="matChurch" label="Matrimony" onField={onMemberField}
                extra={(set) => (
                  <select value={mv.matType} onChange={set('matType')} className="px-3 py-2.5 text-[15px] bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none cursor-pointer">
                    <option value="">Select…</option><option value="Catholic">Catholic</option><option value="Convalidation">Convalidation</option>
                  </select>
                )}
              />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StepEngagement({ volunteer, setVolunteer, notifyOptin, setNotifyOptin, consent, setConsent }) {
  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Church Engagement</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[22px]">Ministry and organization assignments are handled by parish staff after your visit.</p>
      <Card className="p-[clamp(20px,4vw,32px)]">
        <div className="mb-[22px]">
          <Field label="Is anyone in the household willing to volunteer?">
            <Select value={volunteer} onChange={(e) => setVolunteer(e.target.value)} className="max-w-[280px]">
              <option value="">Select…</option>
              <option value="Yes">Yes, gladly</option>
              <option value="Maybe">Maybe, please reach out</option>
              <option value="No">Not at this time</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-3 cursor-pointer p-4 border border-[#eee3ce] rounded-xl bg-[#fdfbf6] mb-3.5">
          <Checkbox checked={notifyOptin} onChange={(e) => setNotifyOptin(e.target.checked)} className="mt-0.5" />
          <span className="text-[14.5px] leading-relaxed text-[#3f3b2f]">Add us to the parish email notification list for Mass schedules, feast days, and announcements.</span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-[1.5px] transition" style={{ borderColor: consent ? '#9db9e0' : '#e0d6c1', background: consent ? 'var(--p-blue-tint)' : '#fdfbf6' }}>
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span className="text-[14.5px] leading-relaxed text-[#3f3b2f]">
            <strong className="text-parish-navy">Data privacy consent <span className="text-parish-gold">*</span></strong> — I consent to the parish collecting and storing this information. It is kept private and viewed only by authorized parish staff, in accordance with the Data Privacy Act.
          </span>
        </label>
      </Card>
    </div>
  );
}

function StepReview({ household, memberViews, volunteer, notifyOptin, consent, onGoStep }) {
  const addr = [household.street, household.barangay, household.city, household.province, household.zip].filter(Boolean).join(', ') || '—';
  const householdReview = [
    ['Family name', household.householdName || '—'],
    ['Address', addr],
    ['Parish GKK', household.gkk || '—'],
    ['Family grouping', household.familyGrouping || '—'],
    ['Contact', household.contact || '—'],
    ['Email', household.email || '—'],
  ];
  const engReview = [
    ['Volunteer', volunteer || '—'],
    ['Email list', notifyOptin ? 'Opted in' : 'Not opted in'],
    ['Privacy consent', consent ? 'Granted' : 'Not yet granted'],
  ];

  function sacList(m) {
    const j = (arr) => arr.filter(Boolean).join(' · ');
    const s = [];
    if (m.hasBaptism) s.push(['Baptism', j([fmtDate(m.baptismDate), m.baptismChurch]) || 'Recorded']);
    if (m.hasCommunion) s.push(['First Communion', j([fmtDate(m.communionDate), m.communionChurch]) || 'Recorded']);
    if (m.hasConfirmation) s.push(['Confirmation', j([fmtDate(m.confDate), m.confChurch, m.confName && `Name: ${m.confName}`, m.confSponsor && `Sponsor: ${m.confSponsor}`]) || 'Recorded']);
    if (m.hasMatrimony) s.push(['Matrimony', j([fmtDate(m.matDate), m.matChurch, m.matType]) || 'Recorded']);
    if (!s.length) s.push(['—', 'No sacraments recorded']);
    return s;
  }

  return (
    <div className="animate-fadeUp">
      <h2 className="font-serif font-semibold text-[clamp(28px,6vw,38px)] m-0 mb-1 text-parish-navy">Review &amp; Submit</h2>
      <p className="text-parish-text2 text-[15.5px] mb-[26px]">Please review your household's details. You may edit any section before submitting.</p>

      <ReviewCard title="Household" onEdit={() => onGoStep(1)}>
        {householdReview.map(([label, value]) => <ReviewRow key={label} label={label} value={value} />)}
      </ReviewCard>

      <ReviewCard title={`Members (${memberViews.length})`} onEdit={() => onGoStep(2)}>
        <div className="flex flex-col gap-4 mt-3">
          {memberViews.map((m, i) => (
            <div key={i} className="border border-[#f0e8d6] rounded-2xl px-[18px] py-4 bg-[#fdfbf6]">
              <div className="font-serif text-[20px] font-semibold text-parish-navy mb-1">{[m.firstName, m.middleName, m.lastName].filter(Boolean).join(' ') || `Member ${i + 1}`}</div>
              <div className="text-[13.5px] text-parish-muted mb-3">{[m.relationship, m.sex, m.civilStatus, m.dob && `b. ${fmtDate(m.dob)}`, m.bloodType && `Blood: ${m.bloodType}`].filter(Boolean).join('  ·  ') || '—'}</div>
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

      <ReviewCard title="Engagement" onEdit={() => onGoStep(4)}>
        {engReview.map(([label, value]) => <ReviewRow key={label} label={label} value={value} />)}
      </ReviewCard>

      <div className="flex gap-2.5 items-start bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-2xl px-4 py-3.5 text-[#2b466f] text-[13.5px] leading-relaxed">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-none mt-px"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        <span>By submitting, this record is stored securely and made available only to authorized parish staff.</span>
      </div>
    </div>
  );
}

function ReviewCard({ title, onEdit, children }) {
  return (
    <Card className="p-[clamp(20px,4vw,30px)] mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-serif text-[24px] font-semibold m-0 text-parish-navy">{title}</h3>
        <button onClick={onEdit} className="appearance-none border-none bg-none cursor-pointer font-semibold text-[13.5px] text-parish-blue">Edit</button>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </Card>
  );
}
function ReviewRow({ label, value }) {
  return (
    <div className="flex gap-3.5 text-[15px] border-b border-[#f4eddd] pb-2.5">
      <span className="flex-none w-[130px] text-parish-muted font-semibold">{label}</span>
      <span className="text-parish-ink">{value}</span>
    </div>
  );
}

function ConfirmModal({ memberViews, onCancel, onAddMore, onSubmit }) {
  return (
    <div className="fixed inset-0 z-50 bg-parish-navy/45 backdrop-blur-sm flex items-center justify-center p-5 animate-fadeUp">
      <div className="bg-white rounded-[22px] max-w-[460px] w-full shadow-2xl p-[clamp(24px,5vw,34px)] max-h-[88vh] overflow-auto">
        <div className="flex items-center gap-2.5 mb-1.5 text-parish-gold">
          <svg viewBox="0 0 40 40" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
        </div>
        <h3 className="font-serif text-[28px] font-semibold m-0 mb-1.5 text-parish-navy">Ready to submit?</h3>
        <p className="text-[15px] leading-relaxed text-parish-text2 mb-[18px]">
          You're registering <strong className="text-parish-blue">{memberViews.length}</strong> household member(s). Please make sure everyone is included before finishing — you can still go back and add more.
        </p>
        <div className="bg-[#fdfbf6] border border-[#eee3ce] rounded-xl px-3.5 mb-[22px]">
          {memberViews.map((m, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5 border-b border-[#f4eddd] last:border-b-0">
              <span className="font-semibold text-[15px] text-parish-navy">{m.displayName}</span>
              <span className="font-medium text-[13px] text-parish-muted">{m.relationship || '—'}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <GoldButton onClick={onSubmit} className="w-full py-4 text-[16px]">Yes, submit registration</GoldButton>
          <GhostButton onClick={onAddMore} className="w-full py-3.5 text-[15px] !border-[#cdd7e8] !text-parish-blue bg-white flex items-center justify-center gap-2">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>Wait — add another member
          </GhostButton>
          <button onClick={onCancel} className="appearance-none border-none bg-none cursor-pointer w-full py-2 font-semibold text-[14px] text-parish-muted">Keep reviewing</button>
        </div>
      </div>
    </div>
  );
}
