import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput, Select, PrimaryButton, GhostButton, HouseholdNameTakenNote, FamilyGroupingSelect } from './ui.jsx';
import { useHouseholdNameTaken } from '../hooks.js';
import { VerifiedLine } from './VerifiedLine.jsx';
import ParticipationSurvey from './ParticipationSurvey.jsx';
import MemberDetailModal from './MemberDetailModal.jsx';
import { HELP_WAYS, HEAD, RELATIONSHIPS, CIVIL_STATUSES, ageFromDob, fmtDateTime } from '../constants.js';
import { toNameCase, toSuffixCase } from '../lib/util.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS } from '../lib/bisaya.js';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useAuth } from '../AuthContext.jsx';
import { can } from '../lib/access.js';
import ActivityList from './ActivityList.jsx';

const REQUIRED = [
  ['household_name', 'Family (household) name'],
  ['street', 'Street'],
  ['barangay', 'Barangay'],
  ['city', 'City / Municipality'],
  ['province', 'Province'],
  ['zip', 'ZIP code'],
];

function formFrom(h) {
  return {
    household_name: h.household_name || '',
    street: h.street || '',
    barangay: h.barangay || '',
    city: h.city || '',
    province: h.province || '',
    zip: h.zip || '',
    gkk: h.gkk || '',
    family_grouping: h.family_grouping || '',
    contact: h.contact || '',
    email: h.email || '',
    status: h.status || 'Pending',
    participation: h.participation || {},
    help_ways: h.help_ways || [],
  };
}

const GRID = { gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' };

/**
 * Edit a household from a panel on the right: its details (saved with "Save
 * changes") and its members (added, edited and removed right away).
 */
export default function HouseholdEditDrawer({ household, gkkOptions = [], onClose, onSaved, onMembersChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const [historyKey, setHistoryKey] = useState(0);
  const titleId = useId();
  const initial = useRef(formFrom(household));
  const [form, setForm] = useState(initial.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [members, setMembers] = useState(null);
  const [membersError, setMembersError] = useState('');
  const [openMemberId, setOpenMemberId] = useState(null);
  const [adding, setAdding] = useState(false);
  const nameTaken = useHouseholdNameTaken(form.household_name, household.household_name);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial.current);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setParticipation = (key, level) => setForm((f) => ({ ...f, participation: { ...f.participation, [key]: level } }));
  const toggleHelpWay = (key) => setForm((f) => {
    const on = new Set(f.help_ways);
    on.has(key) ? on.delete(key) : on.add(key);
    return { ...f, help_ways: HELP_WAYS.map(([k]) => k).filter((k) => on.has(k)) };
  });

  function loadMembers() {
    setMembersError('');
    api.getHousehold(household.id)
      .then((res) => setMembers(res.members))
      .catch((e) => setMembersError(e.message || 'Could not load members'));
  }
  useEffect(() => { loadMembers(); }, [household.id]);

  /** Close, asking first if household details were edited but not saved. */
  async function requestClose() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard your changes?',
        message: 'The household details you edited have not been saved.',
        confirmLabel: 'Discard changes',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  }
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  // Escape closes the panel, unless the member window or a confirm prompt is
  // open on top of it (they handle Escape themselves).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || openMemberId || document.querySelector('[role="alertdialog"]')) return;
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMemberId]);

  async function save() {
    setError('');
    const missing = REQUIRED.find(([key]) => !String(form[key] || '').trim());
    if (missing) {
      setError(`${missing[1]} is required.`);
      return;
    }
    setSaving(true);
    try {
      await api.updateHousehold(household.id, form);
      toast.success('Household updated');
      setHistoryKey((k) => k + 1);
      initial.current = form;
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  function membersChanged() {
    loadMembers();
    setHistoryKey((k) => k + 1);
    onMembersChanged && onMembersChanged();
  }

  async function removeMember(m) {
    const name = [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ');
    if (members.length === 1) {
      toast.error('A household needs at least one member. Delete the household instead.');
      return;
    }
    const isHead = m.relationship === HEAD;
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: isHead
        ? `${name} is the Household Head. After removing them, edit another member and set their relationship to "${HEAD}". Their record moves to the Trash, where it can be restored for 30 days.`
        : 'The member record moves to the Trash, where it can be restored for 30 days.',
      confirmLabel: 'Remove member',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const trashId = await api.deleteMember(m.id);
      toast.success(`${name} moved to the trash`, trashId ? {
        action: {
          label: 'Undo',
          onClick: () => api.restoreDeleted(trashId)
            .then(() => { toast.success(`${name} restored`); membersChanged(); })
            .catch((e) => toast.error(e.message || 'Could not restore')),
        },
      } : undefined);
      membersChanged();
    } catch (e) {
      toast.error(e.message || 'Could not remove this member');
    }
  }

  const head = members?.find((m) => m.relationship === HEAD);

  return (
    <div className="fixed inset-0 z-[45] flex justify-end">
      <div className="absolute inset-0 bg-parish-scrim/35 backdrop-blur-[2px] animate-fadeIn" onClick={requestClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative h-full w-full sm:w-[min(100%,560px)] lg:w-[40vw] lg:min-w-[520px] bg-parish-surface shadow-2xl flex flex-col animate-slideInRight"
      >
        <header className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 pb-4 border-b border-parish-line2">
          <div className="min-w-0">
            <h3 id={titleId} className="font-serif text-[24px] font-semibold m-0 text-parish-navy truncate">Edit household</h3>
            <p className="text-[13px] text-parish-muted m-0">{household.household_name}{household.ref_no ? ` · ${household.ref_no}` : ''}</p>
            <p className="text-[12px] text-parish-muted m-0 mt-0.5">
              {[household.created_at && `Registered ${fmtDateTime(household.created_at, { time: false })}`,
                household.updated_at && `Last updated ${fmtDateTime(household.updated_at)}`].filter(Boolean).join(' · ')}
            </p>
            <VerifiedLine household={household} className="text-[12px] text-parish-okText mt-0.5" />
          </div>
          <button onClick={requestClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none px-1">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5">
          <SectionLabel>Household details</SectionLabel>
          {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
          <div className="flex flex-col gap-4">
            <Field label="Family (household) name" required>
              <TextInput value={form.household_name} onChange={set('household_name')} />
              <HouseholdNameTakenNote show={nameTaken} />
            </Field>
            <Field label="Street / House No. / Purok" required><TextInput value={form.street} onChange={set('street')} /></Field>
            <div className="grid gap-4" style={GRID}>
              <Field label="Barangay" required><TextInput value={form.barangay} onChange={set('barangay')} /></Field>
              <Field label="City / Municipality" required><TextInput value={form.city} onChange={set('city')} /></Field>
            </div>
            <div className="grid gap-4" style={GRID}>
              <Field label="Province" required><TextInput value={form.province} onChange={set('province')} /></Field>
              <Field label="ZIP Code" required><TextInput value={form.zip} onChange={set('zip')} /></Field>
            </div>
            <div className="grid gap-4" style={GRID}>
              <Field label="Parish GKK">
                <Select value={form.gkk} onChange={set('gkk')}>
                  <option value="">Select…</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="Family Grouping"><FamilyGroupingSelect value={form.family_grouping} onChange={(v) => setForm((f) => ({ ...f, family_grouping: v }))} /></Field>
            </div>
            <div className="grid gap-4" style={GRID}>
              <Field label="Household contact no."><TextInput value={form.contact} onChange={set('contact')} /></Field>
              <Field label="Household email"><TextInput value={form.email} onChange={set('email')} /></Field>
            </div>
            <Field label="Registration status">
              <Select value={form.status} onChange={set('status')}>
                <option value="Pending">Pending</option><option value="Verified">Verified</option>
              </Select>
            </Field>
          </div>

          <div className="mt-6 pt-5 border-t border-parish-line2">
            <ParticipationSurvey participation={form.participation} helpWays={form.help_ways} onParticipation={setParticipation} onToggleHelpWay={toggleHelpWay} compact english />
          </div>

          <div className="mt-7">
            <div className="flex items-center gap-3 mb-1">
              <SectionLabel className="flex-1 mb-0">Members{members ? ` (${members.length})` : ''}</SectionLabel>
            </div>
            <p className="text-[12.5px] text-parish-muted mt-1 mb-3">Adding, editing and removing members saves right away.</p>
            {membersError && <div className="mb-3 text-parish-error text-[13.5px]">{membersError}</div>}
            {!members && !membersError && <div className="text-[13.5px] text-parish-muted py-3">Loading members…</div>}
            {members && (
              <div className="flex flex-col gap-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-3.5 py-2.5 bg-parish-field border border-parish-line2 rounded-xl">
                    <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12px] flex-none" aria-hidden>
                      {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-parish-navy truncate">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
                      <div className="text-[12px] text-parish-muted truncate">
                        {[bis(RELATIONSHIP_LABELS, m.relationship), ageFromDob(m.dob) !== null && `${ageFromDob(m.dob)} yrs`, bis(CIVIL_STATUS_LABELS, m.civil_status)].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <button onClick={() => setOpenMemberId(m.id)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg">Edit</button>
                    {can(user, 'deleteRecords') && <button onClick={() => removeMember(m)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-error bg-parish-errorBg rounded-lg">Remove</button>}
                  </div>
                ))}
              </div>
            )}

            {members && !adding && can(user, 'editRegistry') && (
              <button
                onClick={() => setAdding(true)}
                className="mt-3 w-full appearance-none cursor-pointer py-3 font-bold text-[14px] text-parish-blue bg-parish-surface border-[1.5px] border-dashed border-parish-focusLine rounded-xl flex items-center justify-center gap-2 hover:bg-parish-fillSoft hover:border-parish-blue transition"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                Add member
              </button>
            )}
            {members && adding && (
              <AddMemberForm
                householdId={household.id}
                defaultLastName={head?.last_name || ''}
                hasHead={!!head}
                onCancel={() => setAdding(false)}
                onAdded={(added) => {
                  setAdding(false);
                  toast.success(`${[added.first_name, added.last_name].join(' ')} added`);
                  membersChanged();
                }}
              />
            )}
          </div>

          {can(user, 'activity') && (
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center gap-2.5 mb-3">
                <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">History</span>
                <span className="text-[12px] text-parish-muted group-open:hidden">Changes to this household and its members</span>
                <span className="flex-1 h-px bg-parish-track" />
              </summary>
              <ActivityList householdId={household.id} reloadKey={historyKey} />
            </details>
          )}
        </div>

        <footer className="flex items-center gap-2.5 justify-end px-5 sm:px-7 py-3.5 border-t border-parish-line2 bg-parish-card">
          {dirty && <span className="mr-auto text-[12.5px] font-semibold text-parish-warn">Unsaved changes</span>}
          <GhostButton onClick={requestClose} className="px-5 py-2.5 text-[14px]">Close</GhostButton>
          {can(user, 'editRegistry') && (
            <PrimaryButton onClick={save} disabled={saving || !dirty} className="px-6 py-2.5 text-[14px]">
              {saving ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
          )}
        </footer>
      </aside>

      {openMemberId && (
        <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={membersChanged} />
      )}
    </div>
  );
}

function SectionLabel({ children, className = 'mb-3' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{children}</span>
      <span className="flex-1 h-px bg-parish-track" />
    </div>
  );
}

/** Quick add with the essentials; the full record is editable afterwards via "Edit". */
export function AddMemberForm({ householdId, defaultLastName, hasHead, onCancel, onAdded }) {
  const [m, setM] = useState({ lastName: toNameCase(defaultLastName), firstName: '', middleName: '', suffix: '', relationship: '', sex: '', dob: '', civilStatus: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const relationships = hasHead ? RELATIONSHIPS.filter((r) => r !== HEAD) : RELATIONSHIPS;

  const set = (field) => (e) => { setM((x) => ({ ...x, [field]: e.target.value })); setErrors((x) => ({ ...x, [field]: '' })); };
  const tidy = (field, format = toNameCase) => (e) => setM((x) => ({ ...x, [field]: format(e.target.value) }));

  async function add() {
    const e = {};
    if (!m.lastName.trim()) e.lastName = 'Last name is required';
    if (!m.firstName.trim()) e.firstName = 'First name is required';
    if (!m.relationship) e.relationship = 'Choose a relationship';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const { member } = await api.addHouseholdMember(householdId, {
        ...m,
        lastName: toNameCase(m.lastName), firstName: toNameCase(m.firstName),
        middleName: toNameCase(m.middleName), suffix: toSuffixCase(m.suffix),
      });
      onAdded(member);
    } catch (err) {
      setErrors({ form: err.message || 'Could not add this member' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-[1.5px] border-parish-focusLine rounded-xl p-4 bg-parish-fillSoft">
      <div className="font-semibold text-[14px] text-parish-navy mb-3">New member</div>
      {errors.form && <div className="mb-3 text-parish-error text-[13px]" role="alert">{errors.form}</div>}
      <div className="grid gap-3" style={GRID}>
        <Field label="Last name" required error={errors.lastName}><TextInput value={m.lastName} onChange={set('lastName')} onBlur={tidy('lastName')} /></Field>
        <Field label="First name" required error={errors.firstName}><TextInput value={m.firstName} onChange={set('firstName')} onBlur={tidy('firstName')} autoFocus /></Field>
        <Field label="Middle name"><TextInput value={m.middleName} onChange={set('middleName')} onBlur={tidy('middleName')} /></Field>
        <Field label="Suffix"><TextInput placeholder="Jr., Sr., III" value={m.suffix} onChange={set('suffix')} onBlur={tidy('suffix', toSuffixCase)} /></Field>
        <Field label="Relationship" required error={errors.relationship}>
          <Select value={m.relationship} onChange={set('relationship')}>
            <option value="">Select…</option>{relationships.map((r) => <option key={r} value={r}>{bis(RELATIONSHIP_LABELS, r)}</option>)}
          </Select>
        </Field>
        <Field label="Sex">
          <Select value={m.sex} onChange={set('sex')}>
            <option value="">Select…</option>{Object.entries(SEX_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Date of birth"><TextInput type="date" value={m.dob} onChange={set('dob')} /></Field>
        <Field label="Civil status">
          <Select value={m.civilStatus} onChange={set('civilStatus')}>
            <option value="">Select…</option>{CIVIL_STATUSES.map((c) => <option key={c} value={c}>{bis(CIVIL_STATUS_LABELS, c)}</option>)}
          </Select>
        </Field>
      </div>
      <p className="text-[12px] text-parish-muted mt-3 mb-0">Sacraments, contact details and groups can be filled in afterwards with “Edit”.</p>
      <div className="flex gap-2.5 justify-end mt-3">
        <GhostButton onClick={onCancel} className="px-4 py-2 text-[13.5px]">Cancel</GhostButton>
        <PrimaryButton onClick={add} disabled={saving} className="px-5 py-2 text-[13.5px]">{saving ? 'Adding…' : 'Add member'}</PrimaryButton>
      </div>
    </div>
  );
}
