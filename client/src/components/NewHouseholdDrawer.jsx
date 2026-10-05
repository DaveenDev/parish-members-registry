import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput, Select, Checkbox, PrimaryButton, GhostButton, TribeSelect, FamilyGroupingSelect, ComboInput, OptionSelect } from './ui.jsx';
import ParticipationSurvey, { ParticipationReview } from './ParticipationSurvey.jsx';
import { useHouseholdNameTaken } from '../hooks.js';
import { toNameCase, toSuffixCase } from '../lib/util.js';
import { MEN_ONLY_NOTE, isMale, menOnlyBlocked, menOnlyMessage } from '../lib/ministries.js';
import { syncSpouses, weddingPartners, toPayloadMember, WEDDING_FIELDS } from '../lib/household.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, RELIGION_LABELS, WEDDING_TYPE_LABELS, VOLUNTEER_LABELS, BLOOD_UNKNOWN_LABEL } from '../lib/bisaya.js';
import {
  blankMember, HEAD, RELATIONSHIPS, CIVIL_STATUSES, RELIGIONS, BLOOD_TYPES, WEDDING_TYPES, HELP_WAYS, DEFAULT_ADDRESS, GKK_ROLES, fmtDate,
} from '../constants.js';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useAuth } from '../AuthContext.jsx';
import { can } from '../lib/access.js';

// The same five steps as the public registration wizard, in English.
const STEPS = ['Household & Head', 'Members', 'Sacraments', 'Participation', 'Review'];
const MEMBER_RELATIONSHIPS = RELATIONSHIPS.filter((r) => r !== HEAD);
const GRID = { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' };
const EMPTY_HOUSEHOLD = {
  householdName: '', street: '', barangay: '', ...DEFAULT_ADDRESS,
  contact: '', email: '', gkk: '', familyGrouping: '',
  participation: {}, helpWays: [],
};
const REQUIRED_HOUSEHOLD = {
  householdName: 'Family (household) name is required', street: 'Street is required', barangay: 'Barangay is required',
  city: 'City / Municipality is required', province: 'Province is required', zip: 'ZIP code is required',
};

function blankHead() {
  return { ...blankMember(), relationship: HEAD };
}
function fullName(m) {
  return [m.firstName, m.middleName, m.lastName, m.suffix].filter(Boolean).join(' ');
}
function displayName(m, i) {
  return [m.firstName, m.lastName, m.suffix].filter(Boolean).join(' ') || (i === 0 ? 'Household Head' : `Member ${i + 1}`);
}

function memberErrors(m, { head = false } = {}) {
  const fe = {};
  const req = [['lastName', 'Last name is required'], ['firstName', 'First name is required'], ['sex', 'Select the sex'], ['dob', 'Date of birth is required'], ['civilStatus', 'Select the civil status']];
  if (!head) req.push(['relationship', 'Select the relationship to the head']);
  req.forEach(([k, msg]) => { if (!String(m[k] || '').trim()) fe[k] = msg; });
  if (m.email && !/.+@.+\..+/.test(m.email)) fe.email = 'Enter a valid email';
  return fe;
}

/**
 * Register a family on their behalf, from a panel on the right of the
 * Households page. Follows the public registration wizard step by step
 * (head first, members, sacraments, participation, review), with English labels.
 */
export default function NewHouseholdDrawer({ gkkOptions = [], onClose, onSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const titleId = useId();
  const panelRef = useRef(null);
  const bodyRef = useRef(null);

  const [step, setStep] = useState(1);
  const [household, setHousehold] = useState(EMPTY_HOUSEHOLD);
  const [householdNameTouched, setHouseholdNameTouched] = useState(false);
  const [members, setMembers] = useState(() => [blankHead()]);
  const [status, setStatus] = useState('Pending');
  const [volunteer, setVolunteer] = useState('');
  const [notifyOptin, setNotifyOptin] = useState(false);
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState({});
  const [memberErr, setMemberErr] = useState([]);
  const [banner, setBanner] = useState('');
  const [errorFocusTick, setErrorFocusTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [ministryOptions, setMinistryOptions] = useState([]);
  const [menOnly, setMenOnly] = useState(null); // men-only ministries, e.g. Kaabag (0038)
  const [orgOptions, setOrgOptions] = useState([]);
  const [parishRoleOptions, setParishRoleOptions] = useState([]);
  const nameTaken = useHouseholdNameTaken(household.householdName);

  const snapshot = JSON.stringify({ household, members, status, volunteer, notifyOptin, consent });
  const initial = useRef(snapshot);
  const dirty = snapshot !== initial.current;

  useEffect(() => {
    api.listMinistries().then((r) => setMinistryOptions(r.rows.map((x) => x.name))).catch(() => {});
    api.menOnlyMinistries().then(setMenOnly).catch(() => setMenOnly(null));
    api.listOrganizations().then((r) => setOrgOptions(r.rows.map((x) => x.name))).catch(() => {});
    api.listParishPositions().then((r) => setParishRoleOptions(r.rows.map((x) => x.name))).catch(() => {});
  }, []);

  /** Close, asking first if anything was entered. */
  async function requestClose() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard this household?',
        message: 'The details you entered have not been saved.',
        confirmLabel: 'Discard',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  }
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  // Escape closes the panel, unless a confirm prompt is open on top of it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('[role="alertdialog"]')) return;
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // After a failed "Next", bring the first invalid field into view and focus it.
  useEffect(() => {
    if (!errorFocusTick) return;
    const field = panelRef.current?.querySelector('[aria-invalid="true"]');
    if (field) {
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field.focus({ preventScroll: true });
    } else {
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [errorFocusTick]);

  function goStep(n) {
    setStep(n);
    setBanner('');
    bodyRef.current?.scrollTo({ top: 0 });
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
      const on = new Set(h.helpWays || []);
      on.has(key) ? on.delete(key) : on.add(key);
      return { ...h, helpWays: HELP_WAYS.map(([k]) => k).filter((k) => on.has(k)) };
    });
  }
  function updateMember(i, field, value) {
    // A Spouse follows the head's Married / Live-in status, and the two share one wedding.
    setMembers((ms) => syncSpouses(ms.map((m, idx) => {
      if (idx !== i) return m;
      const next = { ...m, [field]: value };
      if (i > 0 && field === 'relationship') next.civilFromHead = value === 'Spouse';
      if (i > 0 && field === 'civilStatus') next.civilFromHead = false;
      // No longer male: off any men-only ministry (Kaabag) ticked earlier.
      if (field === 'sex' && !isMale(value) && menOnly) next.ministries = (next.ministries || []).filter((n) => !menOnly.has(n));
      return next;
    }), WEDDING_FIELDS.includes(field) ? i : -1));
    const cleared = field === 'relationship' ? [field, 'civilStatus'] : [field];
    setMemberErr((me) => me.map((e, idx) => (idx === i && e ? { ...e, ...Object.fromEntries(cleared.map((f) => [f, ''])) } : e)));
    setBanner('');
    if (i === 0 && field === 'lastName' && !householdNameTouched) {
      const last = toNameCase(value);
      setHousehold((h) => ({ ...h, householdName: last ? `${last} Family` : '' }));
      setErr((e) => ({ ...e, householdName: '' }));
    }
  }
  function toggleGroup(i, listKey, name) {
    setMembers((ms) => ms.map((m, idx) => {
      if (idx !== i) return m;
      const on = new Set(m[listKey] || []);
      on.has(name) ? on.delete(name) : on.add(name);
      return { ...m, [listKey]: [...on] };
    }));
  }
  function addMember() {
    // Most members share the head's surname, so start with it (still editable).
    setMembers((ms) => [...ms, { ...blankMember(), lastName: toNameCase(ms[0]?.lastName) }]);
  }
  function removeMember(i) {
    if (i === 0) return; // the Household Head is required
    setMembers((ms) => ms.filter((_, idx) => idx !== i));
    setMemberErr((me) => me.filter((_, idx) => idx !== i));
  }

  function validate(n) {
    const e = {};
    const me = [];
    if (n === 1) {
      Object.keys(REQUIRED_HOUSEHOLD).forEach((k) => { if (!String(household[k] || '').trim()) e[k] = REQUIRED_HOUSEHOLD[k]; });
      if (household.email && !/.+@.+\..+/.test(household.email)) e.email = 'Enter a valid email';
      if (!e.householdName && nameTaken) e.householdName = `“${household.householdName.trim()}” is already registered. Press Edit to choose another name.`;
      me[0] = memberErrors(members[0], { head: true });
      const ok = !Object.keys(e).length && !Object.keys(me[0]).length;
      return { ok, err: e, memberErr: me, banner: ok ? '' : 'Please complete the marked details of the household and its head.' };
    }
    if (n === 2) {
      let ok = true;
      members.forEach((m, i) => {
        if (i === 0) return;
        me[i] = memberErrors(m);
        if (Object.keys(me[i]).length) ok = false;
      });
      return { ok, err: e, memberErr: me, banner: ok ? '' : 'Please complete the required details of each member.' };
    }
    return { ok: true, err: e, memberErr: me, banner: '' };
  }

  function showErrors(v) {
    setErr(v.err); setMemberErr(v.memberErr); setBanner(v.banner);
    setErrorFocusTick((t) => t + 1);
  }

  function next() {
    const v = validate(step);
    if (!v.ok) { showErrors(v); return; }
    setErr({}); setMemberErr([]);
    goStep(step + 1);
  }

  async function save() {
    // Steps can be revisited from the review, so check them all again.
    for (const n of [1, 2]) {
      const v = validate(n);
      if (!v.ok) { setStep(n); showErrors(v); return; }
    }
    setSaving(true);
    setBanner('');
    try {
      await api.createHousehold({
        household: { ...household, householdName: household.householdName.trim() },
        status, members: members.map(toPayloadMember), volunteer, notifyOptin, consent,
      });
      toast.success(`${household.householdName.trim()} registered`);
      onSaved();
    } catch (e) {
      setBanner(e.message || 'Could not save household');
      bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  const memberViews = members.map((m, i) => ({ ...m, mi: i, displayName: displayName(m, i), err: memberErr[i] || {} }));
  const stepProps = {
    household, err, onHouseholdField: updateHousehold, gkkOptions, nameTaken,
    onParticipation: setParticipation, onToggleHelpWay: toggleHelpWay,
    memberViews, onMemberField: updateMember, onAddMember: addMember, onRemoveMember: removeMember, onToggleGroup: toggleGroup,
    ministryOptions, menOnly, orgOptions, parishRoleOptions,
    status, setStatus, volunteer, setVolunteer, notifyOptin, setNotifyOptin, consent, setConsent,
    onGoStep: goStep,
  };

  return (
    <div className="fixed inset-0 z-[45] flex justify-end">
      <div className="absolute inset-0 bg-parish-scrim/35 backdrop-blur-[2px] animate-fadeIn" onClick={requestClose} />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative h-full w-[90vw] lg:w-[50vw] lg:min-w-[640px] max-w-full bg-parish-surface shadow-2xl flex flex-col animate-slideInRight"
      >
        <header className="px-5 sm:px-7 pt-5 pb-4 border-b border-parish-line2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={titleId} className="font-serif text-[24px] font-semibold m-0 text-parish-navy truncate">New household</h3>
              <p className="text-[13px] text-parish-muted m-0" aria-live="polite">Step {step} of {STEPS.length} · {STEPS[step - 1]}</p>
            </div>
            <button onClick={requestClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none px-1">×</button>
          </div>
          <div className="hidden sm:block mt-3.5"><StepDots step={step} /></div>
          <div className="h-[5px] bg-parish-borderStrong rounded-full mt-3 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(step / STEPS.length) * 100}%`, background: 'linear-gradient(90deg,var(--p-blue),var(--p-gold))' }} />
          </div>
        </header>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 sm:px-7 py-5">
          {banner && (
            <div role="alert" className="flex gap-2.5 items-start bg-parish-errorBg border border-parish-errorBorder text-parish-error rounded-xl px-4 py-3 mb-4 text-[13.5px]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-none mt-px"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" /></svg>
              <span>{banner}</span>
            </div>
          )}
          {step === 1 && <StepHousehold {...stepProps} />}
          {step === 2 && <StepMembers {...stepProps} />}
          {step === 3 && <StepSacraments {...stepProps} />}
          {step === 4 && <StepParticipation {...stepProps} />}
          {step === 5 && <StepReview {...stepProps} />}
        </div>

        <footer className="flex gap-2.5 justify-between items-center px-5 sm:px-7 py-3.5 border-t border-parish-line2 bg-parish-card">
          <GhostButton onClick={step === 1 ? requestClose : () => goStep(step - 1)} className="px-5 py-2.5 text-[14px]">{step === 1 ? 'Cancel' : '← Back'}</GhostButton>
          {step < STEPS.length
            ? <PrimaryButton onClick={next} className="px-6 py-2.5 text-[14px]">Next →</PrimaryButton>
            : <PrimaryButton onClick={save} disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save Household'}</PrimaryButton>}
        </footer>
      </aside>
    </div>
  );
}

function StepDots({ step }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-[24px] h-[24px] rounded-full flex items-center justify-center font-bold text-[11.5px] border-2 transition-all"
              style={{
                borderColor: active ? 'var(--p-blue)' : done ? 'rgb(var(--c-focus-line))' : 'rgb(var(--c-border-strong))',
                background: active ? 'var(--p-blue)' : done ? 'var(--p-blue-tint)' : 'rgb(var(--c-surface))',
                color: active ? 'rgb(var(--c-surface))' : done ? 'var(--p-blue)' : 'rgb(var(--c-icon))',
              }}
            >
              {n}
            </div>
            <span className="font-semibold text-[12px]" style={{ color: active || done ? 'var(--p-navy)' : 'rgb(var(--c-icon))' }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Panel({ title, hint, children }) {
  return (
    <section className="border border-parish-edge rounded-2xl p-[clamp(16px,2.5vw,24px)] bg-parish-card mb-4">
      {title && <h4 className="font-serif text-[20px] font-semibold text-parish-navy m-0 mb-1">{title}</h4>}
      {hint && <p className="text-[13px] text-parish-muted m-0 mb-3.5">{hint}</p>}
      {!hint && title && <div className="mb-3" />}
      {children}
    </section>
  );
}

function MemberHeading({ mv, children }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[14px] flex-none">{mv.mi + 1}</div>
        <span className="font-serif text-[20px] font-semibold text-parish-navy truncate">{mv.displayName}</span>
      </div>
      {children}
    </div>
  );
}

/** Household name: filled in from the head's last name and locked until "Edit" is pressed. */
function HouseholdNameField({ value, error, taken, onChange }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const inputId = useId();
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  function toggle() {
    if (editing) onChange(value.trim());
    setEditing((e) => !e);
  }
  return (
    <Field label="Family (household) name" required error={error} inputId={inputId}>
      <div className="flex gap-2">
        <TextInput
          id={inputId}
          aria-invalid={error ? true : undefined}
          ref={inputRef}
          placeholder={editing ? 'e.g. Dela Cruz Family' : 'Filled in from the last name'}
          value={value}
          readOnly={!editing}
          aria-readonly={!editing}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (editing && e.key === 'Enter') toggle(); }}
          className={`flex-1 ${editing ? '' : '!bg-parish-sunk !text-parish-text2 cursor-default'}`}
        />
        <GhostButton type="button" onClick={toggle} className="px-4 text-[13.5px] flex-none !border-parish-focusLine !text-parish-blue bg-parish-surface">
          {editing ? 'Done' : 'Edit'}
        </GhostButton>
      </div>
      {!error && taken && (
        <div className="text-[12.5px] font-semibold text-parish-error mt-1.5">✗ Another household already uses this name. Press Edit to choose a different one.</div>
      )}
    </Field>
  );
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
      <Field label="Last name" required error={mv.err.lastName}><TextInput value={mv.lastName} onChange={set('lastName')} onBlur={tidy('lastName')} autoCapitalize="words" /></Field>
      <Field label="First name" required error={mv.err.firstName}><TextInput value={mv.firstName} onChange={set('firstName')} onBlur={tidy('firstName')} autoCapitalize="words" /></Field>
      <Field label="Middle name"><TextInput placeholder="mother's maiden surname" value={mv.middleName} onChange={set('middleName')} onBlur={tidy('middleName')} autoCapitalize="words" /></Field>
      <Field label="Suffix"><TextInput placeholder="Jr., Sr., III" value={mv.suffix || ''} onChange={set('suffix')} onBlur={tidy('suffix', toSuffixCase)} /></Field>
    </div>
  );
}

/** Personal details for one member. `head` hides Relationship (the head's is fixed). */
function MemberFieldsGrid({ mv, onField, head = false }) {
  const set = (field) => (e) => onField(mv.mi, field, e.target.value);
  // GKK leaders don't record blood types (0050).
  const { user } = useAuth();
  const showBlood = can(user, 'bloodTypes');
  return (
    <div className="grid gap-4" style={GRID}>
      {!head && (
        <Field label="Relationship to head" required error={mv.err.relationship}>
          <Select value={mv.relationship} onChange={set('relationship')}>
            <option value="">Select…</option>
            {MEMBER_RELATIONSHIPS.map((r) => <option key={r} value={r}>{bis(RELATIONSHIP_LABELS, r)}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Sex" required error={mv.err.sex}>
        <Select value={mv.sex} onChange={set('sex')}>
          <option value="">Select…</option>
          {Object.entries(SEX_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Date of birth" required error={mv.err.dob}><TextInput type="date" value={mv.dob} onChange={set('dob')} /></Field>
      <Field label="Place of birth"><TextInput value={mv.placeOfBirth} onChange={set('placeOfBirth')} /></Field>
      <Field label="Tribe"><TribeSelect placeholder="Select…" value={mv.tribe} onChange={(v) => onField(mv.mi, 'tribe', v)} /></Field>
      <Field label="Civil status" required error={mv.err.civilStatus}>
        <Select value={mv.civilStatus} onChange={set('civilStatus')}>
          <option value="">Select…</option>
          {CIVIL_STATUSES.map((c) => <option key={c} value={c}>{bis(CIVIL_STATUS_LABELS, c)}</option>)}
        </Select>
      </Field>
      <Field label="Contact number"><TextInput type="tel" placeholder="0917…" value={mv.contact} onChange={set('contact')} /></Field>
      <Field label="Email" error={mv.err.email}><TextInput type="email" placeholder="optional" value={mv.email} onChange={set('email')} /></Field>
      <Field label="Occupation"><TextInput placeholder="optional" value={mv.occupation} onChange={set('occupation')} /></Field>
      <Field label="Religion">
        <Select value={mv.religion} onChange={set('religion')}>
          {RELIGIONS.map((r) => <option key={r} value={r}>{bis(RELIGION_LABELS, r)}</option>)}
        </Select>
      </Field>
      {showBlood && (
        <Field label="Blood type">
          <Select value={mv.bloodType} onChange={set('bloodType')}>
            <option value="">{BLOOD_UNKNOWN_LABEL}</option>
            {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

function StepHousehold({ household, err, onHouseholdField, gkkOptions, nameTaken, memberViews, onMemberField, onParticipation, onToggleHelpWay }) {
  const f = (field) => ({ value: household[field], onChange: (e) => onHouseholdField(field, e.target.value) });
  const head = memberViews[0];
  return (
    <div className="animate-fadeUp">
      <Panel title="Household Head" hint="Start with the head of the family; the household name fills in from their last name.">
        <MemberNameFields mv={head} onField={onMemberField} />
        <div className="mt-4">
          <HouseholdNameField value={household.householdName} error={err.householdName} taken={nameTaken} onChange={(v) => onHouseholdField('householdName', v)} />
        </div>
        <div className="mt-4"><MemberFieldsGrid mv={head} onField={onMemberField} head /></div>
      </Panel>

      <Panel title="Address & Contact">
        <div className="flex flex-col gap-4">
          <Field label="Street / House No. / Purok" required error={err.street}><TextInput placeholder="e.g. Purok 3, 24 Rizal St." {...f('street')} /></Field>
          <div className="grid gap-4" style={GRID}>
            <Field label="Barangay" required error={err.barangay}><TextInput {...f('barangay')} /></Field>
            <Field label="City / Municipality" required error={err.city}><TextInput {...f('city')} /></Field>
          </div>
          <div className="grid gap-4" style={GRID}>
            <Field label="Province" required error={err.province}><TextInput {...f('province')} /></Field>
            <Field label="ZIP Code" required error={err.zip}><TextInput inputMode="numeric" {...f('zip')} /></Field>
          </div>
          <div className="grid gap-4" style={GRID}>
            <Field label="Household contact no." error={err.contact}><TextInput type="tel" {...f('contact')} /></Field>
            <Field label="Household email" error={err.email}><TextInput type="email" placeholder="optional" {...f('email')} /></Field>
          </div>
          <div className="grid gap-4" style={GRID}>
            <Field label="Parish GKK">
              <Select {...f('gkk')}>
                <option value="">Select…</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
            <Field label="Family Grouping"><FamilyGroupingSelect value={household.familyGrouping} onChange={(v) => onHouseholdField('familyGrouping', v)} /></Field>
          </div>
        </div>
      </Panel>

      <Panel title="Participation in the Parish / GKK">
        <ParticipationSurvey participation={household.participation} helpWays={household.helpWays} onParticipation={onParticipation} onToggleHelpWay={onToggleHelpWay} compact english />
      </Panel>
    </div>
  );
}

function StepMembers({ memberViews, onMemberField, onAddMember, onRemoveMember }) {
  const head = memberViews[0];
  const others = memberViews.slice(1);
  return (
    <div className="animate-fadeUp">
      <div className="flex items-center gap-2.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl px-4 py-3 mb-4 text-parish-info text-[13.5px]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="flex-none"><path d="M17 20v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 20v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" /></svg>
        <span>
          {others.length
            ? <><strong>{memberViews.length}</strong> people in the household so far, including the head. Add everyone else who lives with <strong>{head.displayName}</strong>.</>
            : <>Only the head is listed. Add everyone who lives with <strong>{head.displayName}</strong> (spouse, each child, other relatives), or press Next if they live alone.</>}
        </span>
      </div>
      {others.map((mv) => (
        <Panel key={mv.mi}>
          <MemberHeading mv={mv}>
            <button onClick={() => onRemoveMember(mv.mi)} className="border border-parish-errorBorder bg-parish-surface text-parish-error cursor-pointer font-semibold text-[12.5px] px-3 py-1.5 rounded-lg flex-none">Remove</button>
          </MemberHeading>
          <MemberNameFields mv={mv} onField={onMemberField} />
          <div className="mt-4"><MemberFieldsGrid mv={mv} onField={onMemberField} /></div>
        </Panel>
      ))}
      <button onClick={onAddMember} className="w-full appearance-none cursor-pointer py-3.5 font-bold text-[14.5px] text-parish-blue bg-parish-surface border-[1.5px] border-dashed border-parish-focusLine rounded-2xl flex items-center justify-center gap-2.5 hover:bg-parish-fillSoft hover:border-parish-blue transition">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>Add Another Member
      </button>
    </div>
  );
}

function SacramentBlock({ mv, field, dateField, churchField, label, extra, onField }) {
  const checked = mv[field];
  const set = (f) => (e) => onField(mv.mi, f, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  return (
    <div className="border border-parish-edge rounded-xl px-3.5 py-1.5 bg-parish-surface">
      <label className="flex items-center gap-2.5 cursor-pointer min-h-[40px]">
        <Checkbox checked={checked} onChange={set(field)} />
        <span className="font-semibold text-[14px] text-parish-navy">{label}</span>
      </label>
      {checked && (
        <div className="grid gap-2.5 mt-1 mb-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
          <TextInput type="date" aria-label={`${label} date`} value={mv[dateField]} onChange={set(dateField)} />
          <TextInput placeholder="Parish / Church" value={mv[churchField]} onChange={set(churchField)} />
          {extra && extra(set)}
        </div>
      )}
    </div>
  );
}

/** Married members say how they were wed; only a Catholic marriage counts as the sacrament. */
function WeddingBlock({ mv, sharedWith, onField }) {
  const set = (f) => (e) => onField(mv.mi, f, e.target.value);
  function choose(type) {
    onField(mv.mi, 'matType', type);
    onField(mv.mi, 'hasMatrimony', type === 'Catholic Marriage');
  }
  return (
    <div className="border border-parish-edge rounded-xl px-3.5 py-3 bg-parish-surface">
      <div className="font-semibold text-[14px] text-parish-navy">Matrimony</div>
      <div className="text-[12.5px] text-parish-muted mb-2.5">What kind of wedding?</div>
      {sharedWith && (
        <div className="text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-lg px-3 py-2 mb-2.5">
          Same wedding as <strong>{sharedWith}</strong>: the type, date and parish entered here are copied to their record too.
        </div>
      )}
      <div role="radiogroup" aria-label={`Wedding type of ${mv.displayName}`} className="flex flex-wrap gap-2">
        {WEDDING_TYPES.map((type) => {
          const checked = mv.matType === type;
          return (
            <label
              key={type}
              className={`cursor-pointer select-none px-3.5 py-2 rounded-full border-[1.5px] text-[13px] font-semibold transition focus-within:ring-2 focus-within:ring-parish-blue/30 ${
                checked ? 'bg-parish-fill border-parish-blue text-white' : 'bg-parish-surface border-parish-borderSoft text-parish-text2 hover:border-parish-blue'
              }`}
            >
              <input type="radio" name={`nh-wedding-${mv.mi}`} value={type} checked={checked} onChange={() => choose(type)} className="sr-only" />
              {bis(WEDDING_TYPE_LABELS, type)}
            </label>
          );
        })}
      </div>
      {mv.matType === 'Catholic Marriage' && (
        <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
          <TextInput type="date" aria-label="Wedding date" value={mv.matDate} onChange={set('matDate')} />
          <TextInput placeholder="Parish / Church" value={mv.matChurch} onChange={set('matChurch')} />
        </div>
      )}
    </div>
  );
}

function StepSacraments({ memberViews, onMemberField }) {
  // The head and a married Spouse share one wedding; each card names the other.
  const partners = weddingPartners(memberViews);
  const sharedWith = (i) => (i === 0 ? partners.map((idx) => memberViews[idx].displayName).join(' and ') : partners.includes(i) ? memberViews[0].displayName : '');
  return (
    <div className="animate-fadeUp">
      <p className="text-[13.5px] text-parish-muted m-0 mb-4">Tick the sacraments each member has received. Dates and parishes are optional but help the records.</p>
      {memberViews.map((mv, i) => (
        <Panel key={i}>
          <MemberHeading mv={mv} />
          <div className="flex flex-col gap-2.5">
            <SacramentBlock mv={mv} field="hasBaptism" dateField="baptismDate" churchField="baptismChurch" label="Baptism" onField={onMemberField} />
            <SacramentBlock mv={mv} field="hasCommunion" dateField="communionDate" churchField="communionChurch" label="First Communion" onField={onMemberField} />
            <SacramentBlock
              mv={mv} field="hasConfirmation" dateField="confDate" churchField="confChurch" label="Confirmation" onField={onMemberField}
              extra={(set) => (
                <>
                  <TextInput placeholder="Confirmation name" value={mv.confName} onChange={set('confName')} />
                  <TextInput placeholder="Sponsor" value={mv.confSponsor} onChange={set('confSponsor')} />
                </>
              )}
            />
            {mv.civilStatus === 'Married'
              ? <WeddingBlock mv={mv} sharedWith={sharedWith(i)} onField={onMemberField} />
              : <SacramentBlock mv={mv} field="hasMatrimony" dateField="matDate" churchField="matChurch" label="Matrimony" onField={onMemberField} />}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function MemberLabel({ mv, htmlFor }) {
  const Tag = htmlFor ? 'label' : 'div';
  return (
    <Tag htmlFor={htmlFor} className="font-semibold text-[14px] text-parish-navy">
      {mv.displayName}
      <span className="block text-[12px] font-medium text-parish-muted">{bis(RELATIONSHIP_LABELS, mv.relationship) || '—'}</span>
    </Tag>
  );
}

/** `blocked(name)`: true greys a choice out (men-only ministries, for women). */
function GroupChecks({ options, selected, onToggle, blocked }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
      {options.map((name) => {
        const checked = (selected || []).includes(name);
        const off = !!blocked?.(name, checked);
        return (
          <label key={name} title={off ? menOnlyMessage(name) : undefined} className={`flex items-center gap-2 border-[1.5px] rounded-lg px-2.5 py-2 ${off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} style={{ borderColor: checked ? 'rgb(var(--c-focus-line))' : 'rgb(var(--c-border-soft))', background: checked ? 'var(--p-blue-tint)' : 'rgb(var(--c-field))' }}>
            <Checkbox checked={checked} disabled={off} onChange={() => onToggle(name)} className="w-4 h-4 flex-none" />
            <span className="font-medium text-[13.5px] text-parish-ink">{name}</span>
            {off && <span className="ml-auto text-[11.5px] font-semibold text-parish-muted whitespace-nowrap">{MEN_ONLY_NOTE}</span>}
          </label>
        );
      })}
    </div>
  );
}

function StepParticipation({
  memberViews, onMemberField, onToggleGroup, ministryOptions, menOnly, orgOptions, parishRoleOptions,
  status, setStatus, volunteer, setVolunteer, notifyOptin, setNotifyOptin, consent, setConsent,
}) {
  const groups = [
    ['organizations', 'Organizations', 'Tick each parish organization the member already belongs to.', orgOptions],
    ['ministries', 'Ministries', 'Assign the ministries each member serves in.', ministryOptions],
  ];
  return (
    <div className="animate-fadeUp">
      {groups.filter(([, , , options]) => options.length).map(([key, title, hint, options]) => (
        <Panel key={key} title={title} hint={hint}>
          <div className="flex flex-col gap-4">
            {memberViews.map((mv) => (
              <fieldset key={mv.mi} className="border-none p-0 m-0 min-w-0">
                <legend className="mb-2"><MemberLabel mv={mv} /></legend>
                <GroupChecks
                  options={options} selected={mv[key]} onToggle={(name) => onToggleGroup(mv.mi, key, name)}
                  blocked={key === 'ministries' ? (name, checked) => menOnlyBlocked(name, mv.sex, menOnly, checked) : undefined}
                />
              </fieldset>
            ))}
          </div>
        </Panel>
      ))}

      <Panel title="Responsibility in GKK" hint="Leave blank if the member has no GKK role.">
        <div className="flex flex-col gap-3">
          {memberViews.map((mv) => (
            <div key={mv.mi} className="grid gap-x-4 gap-y-1.5 items-center" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <MemberLabel mv={mv} htmlFor={`nh-gkk-role-${mv.mi}`} />
              <ComboInput id={`nh-gkk-role-${mv.mi}`} placeholder="Pick or type a role" options={GKK_ROLES} value={mv.gkkRole} onChange={(v) => onMemberField(mv.mi, 'gkkRole', v)} />
            </div>
          ))}
        </div>
      </Panel>

      {parishRoleOptions.length > 0 && (
        <Panel title="Responsibility in Parish" hint="Leave blank if the member has no parish role.">
          <div className="flex flex-col gap-3">
            {memberViews.map((mv) => (
              <div key={mv.mi} className="grid gap-x-4 gap-y-1.5 items-center" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                <MemberLabel mv={mv} htmlFor={`nh-parish-role-${mv.mi}`} />
                <OptionSelect id={`nh-parish-role-${mv.mi}`} placeholder="None" options={parishRoleOptions} value={mv.parishRole} onChange={(v) => onMemberField(mv.mi, 'parishRole', v)} />
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <Field label="Is anyone in the family willing to volunteer?">
            <Select value={volunteer} onChange={(e) => setVolunteer(e.target.value)}>
              <option value="">Select…</option>
              {Object.entries(VOLUNTEER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Registration status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Pending">Pending</option><option value="Verified">Verified</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-start gap-3 cursor-pointer p-3.5 border border-parish-edge rounded-xl bg-parish-field mb-3">
          <Checkbox checked={notifyOptin} onChange={(e) => setNotifyOptin(e.target.checked)} className="mt-0.5" />
          <span className="text-[14px] leading-relaxed text-parish-text3">Add the family to the parish email list for Mass schedules, feasts and announcements.</span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer p-3.5 rounded-xl border-[1.5px] transition" style={{ borderColor: consent ? 'rgb(var(--c-focus-line))' : 'rgb(var(--c-border-soft))', background: consent ? 'var(--p-blue-tint)' : 'rgb(var(--c-field))' }}>
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span className="text-[14px] leading-relaxed text-parish-text3">
            <strong className="text-parish-navy">Data privacy consent</strong> — the family agreed that the parish may collect and keep this information, visible only to authorized parish staff, under the Data Privacy Act.
          </span>
        </label>
      </Panel>
    </div>
  );
}

function StepReview({ household, memberViews, status, volunteer, notifyOptin, consent, onGoStep }) {
  const addr = [household.street, household.barangay, household.city, household.province, household.zip].filter(Boolean).join(', ') || '—';
  const householdReview = [
    ['Household head', fullName(memberViews[0]) || '—'],
    ['Household name', household.householdName || '—'],
    ['Address', addr],
    ['Parish GKK', household.gkk || '—'],
    ['Family Grouping', household.familyGrouping || '—'],
    ['Contact', household.contact || '—'],
    ['Email', household.email || '—'],
  ];
  const otherReview = [
    ['Volunteer', bis(VOLUNTEER_LABELS, volunteer) || '—'],
    ['Email list', notifyOptin ? 'Joined' : 'Not joined'],
    ['Data privacy', consent ? 'Consent given' : 'Not recorded'],
    ['Status', status],
  ];

  function sacList(m) {
    const j = (arr) => arr.filter(Boolean).join(' · ');
    const s = [];
    if (m.hasBaptism) s.push(['Baptism', j([fmtDate(m.baptismDate), m.baptismChurch]) || 'Recorded']);
    if (m.hasCommunion) s.push(['First Communion', j([fmtDate(m.communionDate), m.communionChurch]) || 'Recorded']);
    if (m.hasConfirmation) s.push(['Confirmation', j([fmtDate(m.confDate), m.confChurch, m.confName && `Name: ${m.confName}`, m.confSponsor && `Sponsor: ${m.confSponsor}`]) || 'Recorded']);
    const p = toPayloadMember(m);
    if (p.hasMatrimony) s.push(['Matrimony', j([bis(WEDDING_TYPE_LABELS, p.matType), fmtDate(p.matDate), p.matChurch]) || 'Recorded']);
    else if (p.matType) s.push(['Married', bis(WEDDING_TYPE_LABELS, p.matType)]);
    if (!s.length) s.push(['—', 'No sacraments recorded']);
    return s;
  }

  return (
    <div className="animate-fadeUp">
      <ReviewCard title="Household" onEdit={() => onGoStep(1)}>
        {householdReview.map(([label, value]) => <ReviewRow key={label} label={label} value={value} />)}
        <ParticipationReview participation={household.participation} helpWays={household.helpWays} english />
      </ReviewCard>

      <ReviewCard title={`Members (${memberViews.length})`} onEdit={() => onGoStep(2)}>
        {memberViews.map((m) => (
          <div key={m.mi} className="border border-parish-line2 rounded-xl px-4 py-3.5 bg-parish-surface">
            <div className="flex items-start justify-between gap-3">
              <div className="font-serif text-[18px] font-semibold text-parish-navy mb-1">{fullName(m) || m.displayName}</div>
              <button onClick={() => onGoStep(3)} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[12.5px] text-parish-blue px-2 py-1 -mr-2 rounded-lg hover:bg-[var(--p-blue-tint)] flex-none">Sacraments</button>
            </div>
            <div className="text-[13px] text-parish-muted mb-2.5">
              {[bis(RELATIONSHIP_LABELS, m.relationship), bis(SEX_LABELS, m.sex), bis(CIVIL_STATUS_LABELS, m.civilStatus), m.dob && `born ${fmtDate(m.dob)}`,
                m.tribe && `Tribe: ${m.tribe}`, m.religion && m.religion !== 'Roman Catholic' && `Religion: ${bis(RELIGION_LABELS, m.religion)}`,
                m.bloodType && `Blood: ${m.bloodType}`, m.gkkRole && `GKK: ${m.gkkRole}`, m.parishRole && `Parish: ${m.parishRole}`].filter(Boolean).join('  ·  ') || '—'}
            </div>
            {!!(m.organizations || []).length && (
              <div className="text-[13px] mb-1.5"><span className="text-parish-blue font-semibold">Organizations</span> <span className="text-parish-text2">{m.organizations.join(' · ')}</span></div>
            )}
            {!!(m.ministries || []).length && (
              <div className="text-[13px] mb-1.5"><span className="text-parish-blue font-semibold">Ministries</span> <span className="text-parish-text2">{m.ministries.join(' · ')}</span></div>
            )}
            <div className="flex flex-col gap-1">
              {sacList(m).map(([label, detail]) => (
                <div key={label} className="flex gap-2.5 text-[13.5px] items-baseline">
                  <span className="flex-none text-parish-blue font-semibold">{label}</span>
                  <span className="text-parish-text2">{detail}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </ReviewCard>

      <ReviewCard title="Participation" onEdit={() => onGoStep(4)}>
        {otherReview.map(([label, value]) => <ReviewRow key={label} label={label} value={value} />)}
      </ReviewCard>
    </div>
  );
}

function ReviewCard({ title, onEdit, children }) {
  return (
    <Panel>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-serif text-[20px] font-semibold m-0 text-parish-navy">{title}</h4>
        <button onClick={onEdit} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13.5px] text-parish-blue px-3 py-2 -mr-3 rounded-lg hover:bg-[var(--p-blue-tint)]">Edit</button>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </Panel>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-3.5 text-[14px] border-b border-parish-line2 pb-2">
      <span className="sm:flex-none sm:w-[130px] text-parish-muted font-semibold text-[13px]">{label}</span>
      <span className="text-parish-ink break-words">{value}</span>
    </div>
  );
}
