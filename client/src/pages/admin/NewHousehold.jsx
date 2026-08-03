import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody } from '../../components/admin.jsx';
import { Field, TextInput, Select, Checkbox, PrimaryButton, GhostButton } from '../../components/ui.jsx';
import { RELATIONSHIPS, CIVIL_STATUSES, BLOOD_TYPES, blankMember } from '../../constants.js';

function blankNhMember() {
  const b = blankMember();
  return { first: '', middle: '', last: '', rel: '', sex: '', dob: '', pob: '', civil: '', contact: '', email: '', occupation: '', bloodType: '', organizations: [], ...pickSac(b) };
}
function pickSac(b) {
  const { hasBaptism, baptismDate, baptismChurch, hasCommunion, communionDate, communionChurch, hasConfirmation, confDate, confChurch, confName, confSponsor, hasMatrimony, matDate, matChurch, matType, ministries } = b;
  return { hasBaptism, baptismDate, baptismChurch, hasCommunion, communionDate, communionChurch, hasConfirmation, confDate, confChurch, confName, confSponsor, hasMatrimony, matDate, matChurch, matType, ministries };
}

export default function NewHousehold() {
  const navigate = useNavigate();
  const [nh, setNh] = useState({ name: '', street: '', barangay: '', city: '', province: '', zip: '', gkk: '', grouping: '', contact: '', email: '', status: 'Pending' });
  const [members, setMembers] = useState([blankNhMember()]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [ministryOptions, setMinistryOptions] = useState([]);
  const [orgOptions, setOrgOptions] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name)));
    api.listMinistries().then((r) => setMinistryOptions(r.rows.map((x) => x.name)));
    api.listOrganizations().then((r) => setOrgOptions(r.rows.map((x) => x.name)));
  }, []);

  function setField(field, value) { setNh((h) => ({ ...h, [field]: value })); }
  function setMemberField(mi, field, value) {
    setMembers((ms) => ms.map((m, i) => (i === mi ? { ...m, [field]: value } : m)));
  }
  function toggleGroup(mi, listKey, name) {
    setMembers((ms) => ms.map((m, i) => {
      if (i !== mi) return m;
      const set = new Set(m[listKey] || []);
      set.has(name) ? set.delete(name) : set.add(name);
      return { ...m, [listKey]: [...set] };
    }));
  }

  async function save() {
    setError('');
    if (!nh.name || !nh.street || !nh.barangay || !nh.city || !nh.province || !nh.zip) {
      setError('Please complete the household address fields.'); return;
    }
    for (const m of members) {
      if (!m.first || !m.last) { setError('Every member needs a first and last name.'); return; }
    }
    setSaving(true);
    try {
      await api.createHousehold({ household: nh, members });
      navigate('/admin/households');
    } catch (e) {
      setError(e.message || 'Could not save household');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="New Household" subtitle="Register a family on their behalf">
        <GhostButton onClick={() => navigate('/admin/households')} className="px-4 py-2.5 text-[13.5px] !border-[#cdd7e8] !text-parish-blue bg-white">← Back to Households</GhostButton>
      </PageHeader>
      <PageBody>
        <div className="max-w-[900px]">
          {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium">{error}</div>}

          <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-[clamp(20px,3vw,30px)] shadow-cardSm mb-5">
            <h2 className="font-serif text-[23px] font-semibold text-parish-navy m-0 mb-1">Household Information</h2>
            <p className="text-[13px] text-parish-muted m-0 mb-4">Register the family's home address and contact details on their behalf.</p>
            <div className="flex flex-col gap-4">
              <Field label="Family (household) name" required><TextInput value={nh.name} onChange={(e) => setField('name', e.target.value)} /></Field>
              <Field label="Street / House No. / Purok" required><TextInput value={nh.street} onChange={(e) => setField('street', e.target.value)} /></Field>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <Field label="Barangay" required><TextInput value={nh.barangay} onChange={(e) => setField('barangay', e.target.value)} /></Field>
                <Field label="City / Municipality" required><TextInput value={nh.city} onChange={(e) => setField('city', e.target.value)} /></Field>
              </div>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <Field label="Province" required><TextInput value={nh.province} onChange={(e) => setField('province', e.target.value)} /></Field>
                <Field label="ZIP Code" required><TextInput value={nh.zip} onChange={(e) => setField('zip', e.target.value)} /></Field>
              </div>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <Field label="Parish GKK">
                  <Select value={nh.gkk} onChange={(e) => setField('gkk', e.target.value)}>
                    <option value="">Select…</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                  </Select>
                </Field>
                <Field label="Family Grouping"><TextInput value={nh.grouping} onChange={(e) => setField('grouping', e.target.value)} /></Field>
              </div>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
                <Field label="Household contact no."><TextInput value={nh.contact} onChange={(e) => setField('contact', e.target.value)} /></Field>
                <Field label="Household email"><TextInput value={nh.email} onChange={(e) => setField('email', e.target.value)} /></Field>
                <Field label="Registration status">
                  <Select value={nh.status} onChange={(e) => setField('status', e.target.value)}>
                    <option value="Pending">Pending</option><option value="Verified">Verified</option>
                  </Select>
                </Field>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5 mb-5">
            {members.map((mv, i) => (
              <div key={i} className="bg-[#fffdf8] border border-parish-border rounded-2xl p-[clamp(18px,3vw,28px)] shadow-cardSm">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#eef3fb] text-parish-blue flex items-center justify-center font-bold text-[14px]">{i + 1}</div>
                    <span className="font-serif text-[21px] font-semibold text-parish-navy">{[mv.first, mv.last].filter(Boolean).join(' ') || `Member ${i + 1}`}</span>
                  </div>
                  {members.length > 1 && (
                    <button onClick={() => setMembers((ms) => ms.filter((_, idx) => idx !== i))} className="border border-[#e7d5cf] bg-white text-parish-error cursor-pointer font-semibold text-[12.5px] px-3 py-1.5 rounded-lg">Remove</button>
                  )}
                </div>
                <div className="grid gap-3.5 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
                  <Field label="First name" required><TextInput value={mv.first} onChange={(e) => setMemberField(i, 'first', e.target.value)} /></Field>
                  <Field label="Middle name"><TextInput value={mv.middle} onChange={(e) => setMemberField(i, 'middle', e.target.value)} /></Field>
                  <Field label="Last name" required><TextInput value={mv.last} onChange={(e) => setMemberField(i, 'last', e.target.value)} /></Field>
                  <Field label="Relationship" required>
                    <Select value={mv.rel} onChange={(e) => setMemberField(i, 'rel', e.target.value)}>
                      <option value="">Select…</option>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </Field>
                  <Field label="Sex" required>
                    <Select value={mv.sex} onChange={(e) => setMemberField(i, 'sex', e.target.value)}>
                      <option value="">Select…</option><option value="Male">Male</option><option value="Female">Female</option>
                    </Select>
                  </Field>
                  <Field label="Date of birth" required><TextInput type="date" value={mv.dob} onChange={(e) => setMemberField(i, 'dob', e.target.value)} /></Field>
                  <Field label="Place of birth"><TextInput value={mv.pob} onChange={(e) => setMemberField(i, 'pob', e.target.value)} /></Field>
                  <Field label="Civil status" required>
                    <Select value={mv.civil} onChange={(e) => setMemberField(i, 'civil', e.target.value)}>
                      <option value="">Select…</option>{CIVIL_STATUSES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </Select>
                  </Field>
                  <Field label="Contact number"><TextInput value={mv.contact} onChange={(e) => setMemberField(i, 'contact', e.target.value)} /></Field>
                  <Field label="Email"><TextInput value={mv.email} onChange={(e) => setMemberField(i, 'email', e.target.value)} /></Field>
                  <Field label="Occupation"><TextInput value={mv.occupation} onChange={(e) => setMemberField(i, 'occupation', e.target.value)} /></Field>
                  <Field label="Blood type">
                    <Select value={mv.bloodType} onChange={(e) => setMemberField(i, 'bloodType', e.target.value)}>
                      <option value="">Unknown</option>{BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                    </Select>
                  </Field>
                </div>

                <SectionLabel>Sacraments received</SectionLabel>
                <div className="flex flex-col gap-2.5 mb-5">
                  {[
                    ['hasBaptism', 'baptismDate', 'baptismChurch', 'Baptism'],
                    ['hasCommunion', 'communionDate', 'communionChurch', 'First Communion'],
                  ].map(([field, dateField, churchField, label]) => (
                    <div key={field} className="border border-[#eee3ce] rounded-xl px-3.5 py-3 bg-white">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={mv[field]} onChange={(e) => setMemberField(i, field, e.target.checked)} />
                        <span className="font-semibold text-[14px] text-parish-navy">{label}</span>
                      </label>
                      {mv[field] && (
                        <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                          <TextInput type="date" value={mv[dateField]} onChange={(e) => setMemberField(i, dateField, e.target.value)} />
                          <TextInput placeholder="Parish / Church" value={mv[churchField]} onChange={(e) => setMemberField(i, churchField, e.target.value)} />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="border border-[#eee3ce] rounded-xl px-3.5 py-3 bg-white">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox checked={mv.hasConfirmation} onChange={(e) => setMemberField(i, 'hasConfirmation', e.target.checked)} />
                      <span className="font-semibold text-[14px] text-parish-navy">Confirmation</span>
                    </label>
                    {mv.hasConfirmation && (
                      <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                        <TextInput type="date" value={mv.confDate} onChange={(e) => setMemberField(i, 'confDate', e.target.value)} />
                        <TextInput placeholder="Parish / Church" value={mv.confChurch} onChange={(e) => setMemberField(i, 'confChurch', e.target.value)} />
                        <TextInput placeholder="Confirmation name" value={mv.confName} onChange={(e) => setMemberField(i, 'confName', e.target.value)} />
                        <TextInput placeholder="Sponsor" value={mv.confSponsor} onChange={(e) => setMemberField(i, 'confSponsor', e.target.value)} />
                      </div>
                    )}
                  </div>
                  <div className="border border-[#eee3ce] rounded-xl px-3.5 py-3 bg-white">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox checked={mv.hasMatrimony} onChange={(e) => setMemberField(i, 'hasMatrimony', e.target.checked)} />
                      <span className="font-semibold text-[14px] text-parish-navy">Matrimony</span>
                    </label>
                    {mv.hasMatrimony && (
                      <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
                        <TextInput type="date" value={mv.matDate} onChange={(e) => setMemberField(i, 'matDate', e.target.value)} />
                        <TextInput placeholder="Parish / Church" value={mv.matChurch} onChange={(e) => setMemberField(i, 'matChurch', e.target.value)} />
                        <Select value={mv.matType} onChange={(e) => setMemberField(i, 'matType', e.target.value)}>
                          <option value="">Marriage type…</option><option value="Catholic">Catholic</option><option value="Convalidation">Convalidation</option>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                <SectionLabel>Ministries</SectionLabel>
                <GroupChecks options={ministryOptions} selected={mv.ministries} onToggle={(name) => toggleGroup(i, 'ministries', name)} />
                <SectionLabel>Organizations</SectionLabel>
                <GroupChecks options={orgOptions} selected={mv.organizations} onToggle={(name) => toggleGroup(i, 'organizations', name)} />
              </div>
            ))}
          </div>

          <button onClick={() => setMembers((ms) => [...ms, blankNhMember()])} className="w-full appearance-none cursor-pointer py-3.5 font-bold text-[15px] text-parish-blue bg-white border-[1.5px] border-dashed border-[#b9c6de] rounded-2xl flex items-center justify-center gap-2.5 mb-6">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>Add Another Member
          </button>

          <div className="flex gap-2.5 justify-end">
            <GhostButton onClick={() => navigate('/admin/households')} className="px-6 py-3 text-[15px]">Cancel</GhostButton>
            <PrimaryButton onClick={save} disabled={saving} className="px-7 py-3 text-[15px]">{saving ? 'Saving…' : 'Save Household'}</PrimaryButton>
          </div>
        </div>
      </PageBody>
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <span className="font-bold text-[11.5px] text-[#a98a3f] tracking-[.1em] uppercase">{children}</span>
      <span className="flex-1 h-px bg-[#f0e8d6]" />
    </div>
  );
}
function GroupChecks({ options, selected, onToggle }) {
  return (
    <div className="grid gap-2 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
      {options.map((name) => {
        const checked = (selected || []).includes(name);
        return (
          <label key={name} className="flex items-center gap-2 cursor-pointer border-[1.5px] rounded-lg px-2.5 py-2" style={{ borderColor: checked ? '#9db9e0' : '#e0d6c1', background: checked ? '#eef3fb' : '#fdfbf6' }}>
            <Checkbox checked={checked} onChange={() => onToggle(name)} className="w-4 h-4" />
            <span className="font-medium text-[13.5px] text-parish-ink">{name}</span>
          </label>
        );
      })}
    </div>
  );
}
