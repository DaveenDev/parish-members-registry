import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { RELATIONSHIPS, CIVIL_STATUSES, BLOOD_TYPES, ageFromDob } from '../constants.js';
import { Field, TextInput, Select, Checkbox, PrimaryButton, GhostButton } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

export default function MemberDetailModal({ memberId, onClose, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [member, setMember] = useState(null);
  const [ministryList, setMinistryList] = useState([]);
  const [orgList, setOrgList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!memberId) return;
    setMember(null);
    api.getMember(memberId).then((res) => setMember(res.member)).catch((e) => setError(e.message));
    api.listMinistries().then((res) => setMinistryList(res.rows.map((r) => r.name))).catch(() => {});
    api.listOrganizations().then((res) => setOrgList(res.rows.map((r) => r.name))).catch(() => {});
  }, [memberId]);

  if (!memberId) return null;

  function set(field, value) {
    setMember((m) => ({ ...m, [field]: value }));
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
        first_name: member.first_name, middle_name: member.middle_name, last_name: member.last_name,
        relationship: member.relationship, sex: member.sex, dob: member.dob, place_of_birth: member.place_of_birth,
        civil_status: member.civil_status, contact: member.contact, email: member.email, occupation: member.occupation,
        blood_type: member.blood_type,
        has_baptism: member.has_baptism, baptism_date: member.baptism_date, baptism_church: member.baptism_church,
        has_communion: member.has_communion, communion_date: member.communion_date, communion_church: member.communion_church,
        has_confirmation: member.has_confirmation, conf_date: member.conf_date, conf_church: member.conf_church, conf_name: member.conf_name, conf_sponsor: member.conf_sponsor,
        has_matrimony: member.has_matrimony, mat_date: member.mat_date, mat_church: member.mat_church, mat_type: member.mat_type,
        ministries: member.ministries, organizations: member.organizations,
      };
      await api.updateMember(memberId, patch);
      toast.success('Member updated');
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
      message: 'This permanently deletes the member record, including their sacramental details. This cannot be undone.',
      confirmLabel: 'Remove member',
      tone: 'danger',
    });
    if (!ok) return;

    setSaving(true);
    try {
      await api.deleteMember(memberId);
      toast.success('Member removed');
      onChanged && onChanged();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not delete member');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-parish-navy/45 backdrop-blur-sm flex items-center justify-center p-5" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-[720px] w-full shadow-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {!member ? (
          <div className="p-10 text-center text-parish-muted">Loading…</div>
        ) : (
          <div className="p-[26px]" style={{ padding: '28px' }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-serif text-[26px] font-semibold m-0 text-parish-navy">{member.first_name} {member.last_name}</h3>
              <button onClick={onClose} className="appearance-none border-none bg-none cursor-pointer text-parish-muted text-2xl leading-none">×</button>
            </div>
            <div className="text-[13.5px] text-parish-muted mb-5">{member.household_name} · {ageFromDob(member.dob) ?? '—'} yrs old · {member.household_gkk || 'No GKK'}</div>

            {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium">{error}</div>}

            <div className="grid gap-3.5 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
              <Field label="First name"><TextInput value={member.first_name || ''} onChange={(e) => set('first_name', e.target.value)} /></Field>
              <Field label="Middle name"><TextInput value={member.middle_name || ''} onChange={(e) => set('middle_name', e.target.value)} /></Field>
              <Field label="Last name"><TextInput value={member.last_name || ''} onChange={(e) => set('last_name', e.target.value)} /></Field>
              <Field label="Relationship">
                <Select value={member.relationship || ''} onChange={(e) => set('relationship', e.target.value)}>
                  <option value="">Select…</option>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Sex">
                <Select value={member.sex || ''} onChange={(e) => set('sex', e.target.value)}>
                  <option value="">Select…</option><option value="Male">Male</option><option value="Female">Female</option>
                </Select>
              </Field>
              <Field label="Date of birth"><TextInput type="date" value={member.dob ? String(member.dob).slice(0, 10) : ''} onChange={(e) => set('dob', e.target.value)} /></Field>
              <Field label="Place of birth"><TextInput value={member.place_of_birth || ''} onChange={(e) => set('place_of_birth', e.target.value)} /></Field>
              <Field label="Civil status">
                <Select value={member.civil_status || ''} onChange={(e) => set('civil_status', e.target.value)}>
                  <option value="">Select…</option>{CIVIL_STATUSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Contact"><TextInput value={member.contact || ''} onChange={(e) => set('contact', e.target.value)} /></Field>
              <Field label="Email"><TextInput value={member.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Occupation"><TextInput value={member.occupation || ''} onChange={(e) => set('occupation', e.target.value)} /></Field>
              <Field label="Blood type">
                <Select value={member.blood_type || ''} onChange={(e) => set('blood_type', e.target.value)}>
                  <option value="">Unknown</option>{BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                </Select>
              </Field>
            </div>

            <SectionLabel>Sacraments received</SectionLabel>
            <div className="flex flex-col gap-2.5 mb-5">
              <SacRow label="Baptism" checked={member.has_baptism} onCheck={(v) => set('has_baptism', v)}>
                {member.has_baptism && (
                  <>
                    <TextInput type="date" value={member.baptism_date ? String(member.baptism_date).slice(0, 10) : ''} onChange={(e) => set('baptism_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.baptism_church || ''} onChange={(e) => set('baptism_church', e.target.value)} />
                  </>
                )}
              </SacRow>
              <SacRow label="First Communion" checked={member.has_communion} onCheck={(v) => set('has_communion', v)}>
                {member.has_communion && (
                  <>
                    <TextInput type="date" value={member.communion_date ? String(member.communion_date).slice(0, 10) : ''} onChange={(e) => set('communion_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.communion_church || ''} onChange={(e) => set('communion_church', e.target.value)} />
                  </>
                )}
              </SacRow>
              <SacRow label="Confirmation" checked={member.has_confirmation} onCheck={(v) => set('has_confirmation', v)}>
                {member.has_confirmation && (
                  <>
                    <TextInput type="date" value={member.conf_date ? String(member.conf_date).slice(0, 10) : ''} onChange={(e) => set('conf_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.conf_church || ''} onChange={(e) => set('conf_church', e.target.value)} />
                    <TextInput placeholder="Confirmation name" value={member.conf_name || ''} onChange={(e) => set('conf_name', e.target.value)} />
                    <TextInput placeholder="Sponsor" value={member.conf_sponsor || ''} onChange={(e) => set('conf_sponsor', e.target.value)} />
                  </>
                )}
              </SacRow>
              <SacRow label="Matrimony" checked={member.has_matrimony} onCheck={(v) => set('has_matrimony', v)}>
                {member.has_matrimony && (
                  <>
                    <TextInput type="date" value={member.mat_date ? String(member.mat_date).slice(0, 10) : ''} onChange={(e) => set('mat_date', e.target.value)} />
                    <TextInput placeholder="Parish / Church" value={member.mat_church || ''} onChange={(e) => set('mat_church', e.target.value)} />
                    <Select value={member.mat_type || ''} onChange={(e) => set('mat_type', e.target.value)}>
                      <option value="">Marriage type…</option><option value="Catholic">Catholic</option><option value="Convalidation">Convalidation</option>
                    </Select>
                  </>
                )}
              </SacRow>
            </div>

            <SectionLabel>Ministries</SectionLabel>
            <GroupChecks options={ministryList} selected={member.ministries || []} onToggle={(name) => toggleGroup('ministries', name)} />

            <SectionLabel>Organizations</SectionLabel>
            <GroupChecks options={orgList} selected={member.organizations || []} onToggle={(name) => toggleGroup('organizations', name)} />

            <div className="flex items-center justify-between gap-2.5 mt-[26px]" style={{ marginTop: '28px' }}>
              <button onClick={remove} disabled={saving} className="appearance-none border-none bg-parish-errorBg text-parish-error cursor-pointer font-semibold text-[13px] px-4 py-2.5 rounded-lg">Delete member</button>
              <div className="flex gap-2.5">
                <GhostButton onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
                <PrimaryButton onClick={save} disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save changes'}</PrimaryButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{children}</span>
      <span className="flex-1 h-px bg-[#f0e8d6]" />
    </div>
  );
}

function SacRow({ label, checked, onCheck, children }) {
  return (
    <div className="border border-[#eee3ce] rounded-xl px-3.5 py-3 bg-[#fdfbf6]">
      <label className="flex items-center gap-2.5 cursor-pointer">
        <Checkbox checked={!!checked} onChange={(e) => onCheck(e.target.checked)} />
        <span className="font-semibold text-[14px] text-parish-navy">{label}</span>
      </label>
      {children && <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>{children}</div>}
    </div>
  );
}

function GroupChecks({ options, selected, onToggle }) {
  return (
    <div className="grid gap-2 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
      {options.map((name) => {
        const checked = selected.includes(name);
        return (
          <label key={name} className="flex items-center gap-2 cursor-pointer border-[1.5px] rounded-lg px-2.5 py-2" style={{ borderColor: checked ? '#9db9e0' : '#e0d6c1', background: checked ? 'var(--p-blue-tint)' : '#fdfbf6' }}>
            <Checkbox checked={checked} onChange={() => onToggle(name)} className="w-4 h-4" />
            <span className="font-medium text-[13.5px] text-parish-ink">{name}</span>
          </label>
        );
      })}
    </div>
  );
}
