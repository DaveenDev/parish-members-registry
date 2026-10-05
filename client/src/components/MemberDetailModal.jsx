import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { RELATIONSHIPS, CIVIL_STATUSES, BLOOD_TYPES, WEDDING_TYPES, LEGACY_MAT_TYPES, SACRAMENTS, GKK_ROLES, HEAD, ageFromDob, fmtDateTime } from '../constants.js';
import SacramentVerifyDialog, { SacramentChip } from './SacramentVerifyDialog.jsx';
import { Field, TextInput, Select, Checkbox, PrimaryButton, GhostButton, TribeSelect, ComboInput, OptionSelect, Badge } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { toNameCase, toSuffixCase } from '../lib/util.js';
import { MEN_ONLY_NOTE, menOnlyBlocked, menOnlyMessage } from '../lib/ministries.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, WEDDING_TYPE_LABELS, BLOOD_UNKNOWN_LABEL } from '../lib/bisaya.js';
import { STATUS_TONES } from '../lib/census.js';
import { PRACTICE_MAX, PRACTICE_TONES, PRACTICE_LEVEL_HELP, expectedSacraments, isRated, scoreMember, trendText, practiceSourceText } from '../lib/practice.js';
import { useAuth } from '../AuthContext.jsx';
import { LoadingState } from './admin.jsx';
import { can } from '../lib/access.js';
import ActivityList from './ActivityList.jsx';

// Stored columns for the wedding the Household Head and a married Spouse share.
const WEDDING_COLUMNS = ['has_matrimony', 'mat_date', 'mat_church', 'mat_type'];
const wedding = (m) => Object.fromEntries(WEDDING_COLUMNS.map((c) => [c, c === 'has_matrimony' ? !!m[c] : (m[c] ? String(m[c]).slice(0, 10) : '')]));

export default function MemberDetailModal({ memberId, onClose, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canEdit = can(user, 'editRegistry');
  const [member, setMember] = useState(null);
  const [ministryList, setMinistryList] = useState([]);
  const [menOnly, setMenOnly] = useState(null); // men-only ministries, e.g. Kaabag (0038)
  const [orgList, setOrgList] = useState([]);
  const [parishRoleList, setParishRoleList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null); // the member as stored, before any unsaved edits
  const [verifications, setVerifications] = useState({});
  const [verifying, setVerifying] = useState(null); // a SACRAMENTS entry while its dialog is open
  const [censusHistory, setCensusHistory] = useState([]);
  const [housemates, setHousemates] = useState([]); // the household's members as stored, to find who shares this wedding

  function loadVerifications() {
    api.getSacramentVerifications(memberId).then(setVerifications).catch(() => setVerifications({}));
  }

  useEffect(() => {
    if (!memberId) return;
    setMember(null);
    setHousemates([]);
    api.getMember(memberId).then((res) => {
      setMember(res.member); setSaved(res.member);
      if (res.member.household_id) api.getHousehold(res.member.household_id).then((h) => setHousemates(h.members)).catch(() => {});
    }).catch((e) => setError(e.message));
    api.listMinistries().then((res) => setMinistryList(res.rows.map((r) => r.name))).catch(() => {});
    api.menOnlyMinistries().then(setMenOnly).catch(() => setMenOnly(null));
    api.listOrganizations().then((res) => setOrgList(res.rows.map((r) => r.name))).catch(() => {});
    api.listParishPositions().then((res) => setParishRoleList(res.rows.map((r) => r.name))).catch(() => {});
    loadVerifications();
    // Before the 0007 migration there is no census table; just show none.
    api.memberCensusHistory(memberId).then(setCensusHistory).catch(() => setCensusHistory([]));
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    // Escape belongs to the verify dialog while it's open on top of this one.
    const onKey = (e) => e.key === 'Escape' && !verifying && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [memberId, onClose, verifying]);

  if (!memberId) return null;

  /**
   * Verification status shown beside a sacrament. Staff can only verify a
   * claim that's already saved, and unticking a verified one warns that
   * saving drops the verification (the 0005 trigger removes it).
   */
  function verifyStatus(key) {
    const s = SACRAMENTS.find((x) => x.key === key);
    const savedClaim = !!saved?.[s.has];
    const verified = !!verifications[key];
    if (!member[s.has]) {
      return savedClaim && verified
        ? <span className="text-[12px] font-semibold text-parish-warn">Saving will remove its verification</span>
        : null;
    }
    if (!savedClaim) return <span className="text-[12px] text-parish-muted">Save first, then verify</span>;
    return <SacramentChip claimed verified={verified} label={s.label} onClick={() => setVerifying(s)} />;
  }

  function set(field, value) {
    setMember((m) => ({ ...m, [field]: value }));
  }

  /** Who shares this member's wedding: the head and a married Spouse are wed to each other. */
  function weddingPartners() {
    if (!member || member.civil_status !== 'Married') return [];
    const others = housemates.filter((h) => h.id !== memberId && h.civil_status === 'Married');
    if (member.relationship === HEAD) return others.filter((h) => h.relationship === 'Spouse');
    if (member.relationship === 'Spouse') return others.filter((h) => h.relationship === HEAD);
    return [];
  }
  const partners = weddingPartners();
  const partnerNames = partners.map((p) => [p.first_name, p.last_name].filter(Boolean).join(' ')).join(' and ');
  /** onBlur handler: tidy a name field to "Dela Cruz" style. */
  function tidy(field, format = toNameCase) {
    return (e) => {
      const formatted = format(e.target.value);
      if (formatted !== e.target.value) set(field, formatted);
    };
  }
  function toggleGroup(listKey, name) {
    setMember((m) => {
      const set = new Set(m[listKey] || []);
      set.has(name) ? set.delete(name) : set.add(name);
      return { ...m, [listKey]: [...set] };
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const patch = {
        first_name: member.first_name, middle_name: member.middle_name, last_name: member.last_name, suffix: member.suffix,
        relationship: member.relationship, sex: member.sex, dob: member.dob, place_of_birth: member.place_of_birth, tribe: member.tribe,
        civil_status: member.civil_status, contact: member.contact, email: member.email, occupation: member.occupation,
        blood_type: member.blood_type, gkk_role: member.gkk_role, parish_role: member.parish_role,
        has_baptism: member.has_baptism, baptism_date: member.baptism_date, baptism_church: member.baptism_church,
        has_communion: member.has_communion, communion_date: member.communion_date, communion_church: member.communion_church,
        has_confirmation: member.has_confirmation, conf_date: member.conf_date, conf_church: member.conf_church, conf_name: member.conf_name, conf_sponsor: member.conf_sponsor,
        has_matrimony: member.has_matrimony, mat_date: member.mat_date, mat_church: member.mat_church, mat_type: member.mat_type,
        ministries: member.ministries, organizations: member.organizations,
      };
      await api.updateMember(memberId, patch);
      // A wedding edit also goes to the spouse's record; unrelated edits leave it alone.
      const edited = JSON.stringify(wedding(member)) !== JSON.stringify(wedding(saved));
      const toUpdate = edited ? partners.filter((p) => JSON.stringify(wedding(p)) !== JSON.stringify(wedding(member))) : [];
      await Promise.all(toUpdate.map((p) => api.updateMember(p.id, wedding(member))));
      toast.success(toUpdate.length ? `Member and ${partnerNames} updated` : 'Member updated');
      onChanged && onChanged();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const name = [member?.first_name, member?.last_name].filter(Boolean).join(' ') || 'this member';
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: 'The member record moves to the Trash, where it can be restored for 30 days.',
      confirmLabel: 'Remove member',
      tone: 'danger',
    });
    if (!ok) return;

    setSaving(true);
    try {
      const trashId = await api.deleteMember(memberId);
      toast.success(`${name} moved to the trash`, trashId ? {
        action: {
          label: 'Undo',
          onClick: () => api.restoreDeleted(trashId)
            .then(() => { toast.success(`${name} restored`); onChanged && onChanged(); })
            .catch((e) => toast.error(e.message || 'Could not restore')),
        },
      } : undefined);
      onChanged && onChanged();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not delete member');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-parish-scrim/45 backdrop-blur-sm flex items-center justify-center p-5" onClick={onClose}>
      <div className="bg-parish-surface rounded-2xl max-w-[720px] w-full shadow-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {!member ? (
          <LoadingState label="Loading member…" />
        ) : (
          <div className="p-[26px]" style={{ padding: '28px' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-serif text-[26px] font-semibold m-0 text-parish-navy">{member.first_name} {member.last_name}</h3>
              <button onClick={onClose} className="appearance-none border-none bg-none cursor-pointer text-parish-muted text-2xl leading-none">×</button>
            </div>
            <div className="text-[13.5px] text-parish-muted mb-5">
              {member.household_name} · {ageFromDob(member.dob) ?? '—'} yrs old · {member.household_gkk || 'No GKK'}
              {saved?.updated_at && <span className="block text-[12px] mt-0.5">Last updated {fmtDateTime(saved.updated_at)}</span>}
            </div>

            {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium">{error}</div>}

            <div className="grid gap-3.5 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              <Field label="First name"><TextInput value={member.first_name || ''} onChange={(e) => set('first_name', e.target.value)} onBlur={tidy('first_name')} /></Field>
              <Field label="Middle name"><TextInput value={member.middle_name || ''} onChange={(e) => set('middle_name', e.target.value)} onBlur={tidy('middle_name')} /></Field>
              <Field label="Last name"><TextInput value={member.last_name || ''} onChange={(e) => set('last_name', e.target.value)} onBlur={tidy('last_name')} /></Field>
              <Field label="Suffix"><TextInput placeholder="Jr., Sr., III" value={member.suffix || ''} onChange={(e) => set('suffix', e.target.value)} onBlur={tidy('suffix', toSuffixCase)} /></Field>
              <Field label="Relationship">
                <Select value={member.relationship || ''} onChange={(e) => set('relationship', e.target.value)}>
                  <option value="">Select…</option>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{bis(RELATIONSHIP_LABELS, r)}</option>)}
                </Select>
              </Field>
              <Field label="Sex">
                <Select value={member.sex || ''} onChange={(e) => set('sex', e.target.value)}>
                  <option value="">Select…</option>{Object.entries(SEX_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </Select>
              </Field>
              <Field label="Date of birth"><TextInput type="date" value={member.dob ? String(member.dob).slice(0, 10) : ''} onChange={(e) => set('dob', e.target.value)} /></Field>
              <Field label="Place of birth"><TextInput value={member.place_of_birth || ''} onChange={(e) => set('place_of_birth', e.target.value)} /></Field>
              <Field label="Tribe"><TribeSelect placeholder="Select…" value={member.tribe} onChange={(v) => set('tribe', v)} /></Field>
              <Field label="Civil status">
                <Select value={member.civil_status || ''} onChange={(e) => set('civil_status', e.target.value)}>
                  <option value="">Select…</option>{CIVIL_STATUSES.map((c) => <option key={c} value={c}>{bis(CIVIL_STATUS_LABELS, c)}</option>)}
                </Select>
              </Field>
              <Field label="Contact"><TextInput value={member.contact || ''} onChange={(e) => set('contact', e.target.value)} /></Field>
              <Field label="Email"><TextInput value={member.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Occupation"><TextInput value={member.occupation || ''} onChange={(e) => set('occupation', e.target.value)} /></Field>
              {/* Not for GKK leaders; the database keeps the value as it was when they save (0050). */}
              {can(user, 'bloodTypes') && (
                <Field label="Blood type">
                  <Select value={member.blood_type || ''} onChange={(e) => set('blood_type', e.target.value)}>
                    <option value="">{BLOOD_UNKNOWN_LABEL}</option>{BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Responsibility in GKK"><ComboInput placeholder="Pick or type a role" options={GKK_ROLES} value={member.gkk_role} onChange={(v) => set('gkk_role', v)} /></Field>
              <Field label="Responsibility in Parish"><OptionSelect placeholder="None" options={parishRoleList} value={member.parish_role} onChange={(v) => set('parish_role', v)} /></Field>
            </div>

            <SectionLabel>Sacraments received</SectionLabel>
            <div className="flex flex-col gap-2.5 mb-5">
              <SacRow label="Baptism" status={verifyStatus('baptism')} checked={member.has_baptism} onCheck={(v) => set('has_baptism', v)}>
                {member.has_baptism && (
                  <>
                    <TextInput type="date" value={member.baptism_date ? String(member.baptism_date).slice(0, 10) : ''} onChange={(e) => set('baptism_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.baptism_church || ''} onChange={(e) => set('baptism_church', e.target.value)} />
                  </>
                )}
              </SacRow>
              <SacRow label="First Communion" status={verifyStatus('communion')} checked={member.has_communion} onCheck={(v) => set('has_communion', v)}>
                {member.has_communion && (
                  <>
                    <TextInput type="date" value={member.communion_date ? String(member.communion_date).slice(0, 10) : ''} onChange={(e) => set('communion_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.communion_church || ''} onChange={(e) => set('communion_church', e.target.value)} />
                  </>
                )}
              </SacRow>
              <SacRow label="Confirmation" status={verifyStatus('confirmation')} checked={member.has_confirmation} onCheck={(v) => set('has_confirmation', v)}>
                {member.has_confirmation && (
                  <>
                    <TextInput type="date" value={member.conf_date ? String(member.conf_date).slice(0, 10) : ''} onChange={(e) => set('conf_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.conf_church || ''} onChange={(e) => set('conf_church', e.target.value)} />
                    <TextInput placeholder="Confirmation name" value={member.conf_name || ''} onChange={(e) => set('conf_name', e.target.value)} />
                    <TextInput placeholder="Sponsor" value={member.conf_sponsor || ''} onChange={(e) => set('conf_sponsor', e.target.value)} />
                  </>
                )}
              </SacRow>
              {!!partners.length && (
                <div className="text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-lg px-3 py-2">
                  Same wedding as <strong>{partnerNames}</strong>: saving a change to the matrimony details also updates their record.
                </div>
              )}
              <SacRow label="Matrimony" status={verifyStatus('matrimony')} checked={member.has_matrimony} onCheck={(v) => set('has_matrimony', v)}>
                {member.has_matrimony && (
                  <>
                    <TextInput type="date" value={member.mat_date ? String(member.mat_date).slice(0, 10) : ''} onChange={(e) => set('mat_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.mat_church || ''} onChange={(e) => set('mat_church', e.target.value)} />
                    <Select value={member.mat_type || ''} onChange={(e) => set('mat_type', e.target.value)}>
                      <option value="">Marriage type…</option>
                      {[...WEDDING_TYPES, ...LEGACY_MAT_TYPES].map((t) => <option key={t} value={t}>{bis(WEDDING_TYPE_LABELS, t)}</option>)}
                    </Select>
                  </>
                )}
              </SacRow>
            </div>

            <SectionLabel>Practicing Catholic status</SectionLabel>
            <PracticeBreakdown member={member} history={censusHistory} />

            <SectionLabel>Parish census</SectionLabel>
            <div className="mb-5">
              <div className="flex items-center gap-2 text-[13.5px] text-parish-text2 mb-2">
                <span>Membership status:</span>
                {member.membership_status
                  ? <Badge tone={STATUS_TONES[member.membership_status]}>{member.membership_status}</Badge>
                  : <span className="text-parish-muted">Not yet assessed</span>}
                <span className="text-[12px] text-parish-muted">· set through the Census page</span>
              </div>
              {censusHistory.length > 0 && (
                <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
                  {censusHistory.map((r) => (
                    <li key={r.cycle_id} className="text-[13px] text-parish-text3 bg-parish-field border border-parish-line2 rounded-lg px-3 py-2">
                      <span className="font-semibold text-parish-navy">{r.census_cycles?.label}</span>: {r.status}
                      <span className="text-parish-muted"> · {r.source} · {r.confirmed_by_name || 'staff'}, {new Date(r.confirmed_at).toLocaleDateString()}</span>
                      {r.notes && <div className="text-[12.5px] text-parish-muted mt-0.5">{r.notes}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <SectionLabel>Ministries</SectionLabel>
            <GroupChecks
              options={ministryList} selected={member.ministries || []} onToggle={(name) => toggleGroup('ministries', name)}
              blocked={(name, checked) => menOnlyBlocked(name, member.sex, menOnly, checked)}
            />

            <SectionLabel>Organizations</SectionLabel>
            <GroupChecks options={orgList} selected={member.organizations || []} onToggle={(name) => toggleGroup('organizations', name)} />

            {can(user, 'activity') && (
              <details className="mt-1 group">
                <summary className="cursor-pointer list-none flex items-center gap-2.5 mb-2.5">
                  <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">History</span>
                  <span className="text-[12px] text-parish-muted group-open:hidden">Show who changed this record</span>
                  <span className="flex-1 h-px bg-parish-track" />
                </summary>
                <ActivityList memberId={memberId} />
              </details>
            )}

            <div className="flex items-center justify-between gap-2.5 mt-[26px] flex-wrap" style={{ marginTop: '28px' }}>
              {can(user, 'deleteRecords')
                ? <button onClick={remove} disabled={saving} className="appearance-none border-none bg-parish-errorBg text-parish-error cursor-pointer font-semibold text-[13px] px-4 py-2.5 rounded-lg">Delete member</button>
                : <span />}
              <div className="flex gap-2.5 items-center">
                {!canEdit && <span className="text-[12.5px] text-parish-muted">View only</span>}
                <GhostButton onClick={onClose} className="px-5 py-2.5 text-[14px]">{canEdit ? 'Cancel' : 'Close'}</GhostButton>
                {canEdit && <PrimaryButton onClick={save} disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save changes'}</PrimaryButton>}
              </div>
            </div>
          </div>
        )}
      </div>
      {verifying && saved && (
        <SacramentVerifyDialog
          member={saved}
          sacrament={verifying}
          verification={verifications[verifying.key] || null}
          onClose={() => setVerifying(null)}
          onChanged={() => { loadVerifications(); onChanged && onChanged(); }}
        />
      )}
    </div>
  );
}

/**
 * How the member's Practicing Catholic score was made — participation,
 * sacraments for their age, involvement — and the score at each census.
 * The numbers come from the members view (0017); the history re-scores each
 * census's answers with lib/practice.js.
 */
function PracticeBreakdown({ member, history }) {
  if (!('practice_level' in member)) {
    return <div className="mb-5 text-[13px] text-parish-muted">Run the 0017_practicing_status.sql migration in Supabase to see this member's status.</div>;
  }
  const level = member.practice_level;
  if (!level) return <div className="mb-5 text-[13px] text-parish-muted">Not rated: no longer on the household roster.</div>;
  const rated = isRated(level);
  const age = member.age ?? null;
  const expected = expectedSacraments(age).map((s) => ({ baptism: 'Baptism', communion: 'First Communion', confirmation: 'Confirmation' }[s]));
  const parts = [
    ['Participation', member.practice_participation, PRACTICE_MAX.participation, practiceSourceText(member)],
    ['Sacraments for their age', member.practice_sacraments, PRACTICE_MAX.sacraments, `Expected: ${expected.join(', ')}`],
    ['Involvement', member.practice_involvement, PRACTICE_MAX.involvement, 'A ministry, organization, or GKK / parish role'],
  ];
  const past = history
    .map((r) => ({ r, s: scoreMember(member, r.participation, age) }))
    .filter(({ s }) => s.participation != null);
  const trend = trendText(member.practice_trend);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 flex-wrap text-[13.5px] text-parish-text2 mb-2.5">
        <Badge tone={PRACTICE_TONES[level]}>{level}{rated && member.practice_score != null ? ` · ${Math.round(member.practice_score)} / 100` : ''}</Badge>
        <span className="text-[12.5px] text-parish-muted">{PRACTICE_LEVEL_HELP[level]}</span>
        {trend && <span className={`text-[12.5px] font-bold ${member.practice_trend > 0 ? 'text-parish-ok' : 'text-parish-error'}`}>{trend} since the census before</span>}
      </div>
      {(rated || level === 'Wala pa matino') && (
        <div className="flex flex-col gap-2 mb-2.5">
          {parts.map(([label, value, max, note]) => (
            <div key={label}>
              <div className="flex justify-between text-[12.5px] mb-0.5">
                <span className="font-semibold text-parish-navy">{label}</span>
                <span className="text-parish-text2">{value == null ? '—' : `${Math.round(value)} / ${max}`}</span>
              </div>
              <div className="h-1.5 rounded-full bg-parish-sunk overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-parish-blue" style={{ width: `${value == null ? 0 : (100 * value) / max}%` }} />
              </div>
              <div className="text-[11.5px] text-parish-muted mt-0.5">{note}</div>
            </div>
          ))}
        </div>
      )}
      {past.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-wrap gap-1.5" aria-label="Score at each census">
          {past.map(({ r, s }) => (
            <li key={r.cycle_id} className="text-[12px] text-parish-text3 bg-parish-field border border-parish-line2 rounded-lg px-2.5 py-1">
              <span className="font-semibold text-parish-navy">{r.census_cycles?.label}</span>: {s.level}{isRated(s.level) ? ` · ${Math.round(s.score)}` : ''}
            </li>
          ))}
        </ul>
      )}
      {member.membership_status && (
        <div className="text-[11.5px] text-parish-muted mt-2">The census status staff chose ({member.membership_status}) is their own judgement; where it differs from the score, go by the census status.</div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{children}</span>
      <span className="flex-1 h-px bg-parish-track" />
    </div>
  );
}

function SacRow({ label, checked, onCheck, status, children }) {
  return (
    <div className="border border-parish-edge rounded-xl px-3.5 py-3 bg-parish-field">
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <Checkbox checked={!!checked} onChange={(e) => onCheck(e.target.checked)} />
          <span className="font-semibold text-[14px] text-parish-navy">{label}</span>
        </label>
        {status}
      </div>
      {children && <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>{children}</div>}
    </div>
  );
}

/** `blocked(name, checked)`: true greys a choice out (men-only ministries, for women). */
function GroupChecks({ options, selected, onToggle, blocked }) {
  return (
    <div className="grid gap-2 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
      {options.map((name) => {
        const checked = selected.includes(name);
        const off = !!blocked?.(name, checked);
        return (
          <label key={name} title={off ? menOnlyMessage(name) : undefined} className={`flex items-center gap-2 border-[1.5px] rounded-lg px-2.5 py-2 ${off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`} style={{ borderColor: checked ? 'rgb(var(--c-focus-line))' : 'rgb(var(--c-border-soft))', background: checked ? 'var(--p-blue-tint)' : 'rgb(var(--c-field))' }}>
            <Checkbox checked={checked} disabled={off} onChange={() => onToggle(name)} className="w-4 h-4" />
            <span className="font-medium text-[13.5px] text-parish-ink">{name}</span>
            {off && <span className="ml-auto text-[11.5px] font-semibold text-parish-muted whitespace-nowrap">{MEN_ONLY_NOTE}</span>}
          </label>
        );
      })}
    </div>
  );
}
