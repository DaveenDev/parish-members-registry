import React, { useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput, Select, PrimaryButton, GhostButton } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';

export default function HouseholdEditModal({ household, gkkOptions = [], onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    household_name: household.household_name || '',
    street: household.street || '',
    barangay: household.barangay || '',
    city: household.city || '',
    province: household.province || '',
    zip: household.zip || '',
    gkk: household.gkk || '',
    family_grouping: household.family_grouping || '',
    contact: household.contact || '',
    email: household.email || '',
    status: household.status || 'Pending',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const REQUIRED = [
    ['household_name', 'Family (household) name'],
    ['street', 'Street'],
    ['barangay', 'Barangay'],
    ['city', 'City / Municipality'],
    ['province', 'Province'],
    ['zip', 'ZIP code'],
  ];

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
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-parish-navy/45 backdrop-blur-sm flex items-center justify-center p-4 sm:p-5" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${household.household_name}`}
        className="bg-white rounded-2xl max-w-[640px] w-full shadow-2xl max-h-[90vh] overflow-auto p-5 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-serif text-[24px] font-semibold m-0 text-parish-navy">Edit household</h3>
          <button onClick={onClose} aria-label="Close" className="appearance-none border-none bg-none cursor-pointer text-parish-muted text-2xl leading-none">×</button>
        </div>
        <p className="text-[13px] text-parish-muted mt-0 mb-5">Correct the family's details without re-entering their members.</p>

        {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium">{error}</div>}

        <div className="flex flex-col gap-4">
          <Field label="Family (household) name" required><TextInput value={form.household_name} onChange={set('household_name')} /></Field>
          <Field label="Street / House No. / Purok" required><TextInput value={form.street} onChange={set('street')} /></Field>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <Field label="Barangay" required><TextInput value={form.barangay} onChange={set('barangay')} /></Field>
            <Field label="City / Municipality" required><TextInput value={form.city} onChange={set('city')} /></Field>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <Field label="Province" required><TextInput value={form.province} onChange={set('province')} /></Field>
            <Field label="ZIP Code" required><TextInput value={form.zip} onChange={set('zip')} /></Field>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <Field label="Parish GKK">
              <Select value={form.gkk} onChange={set('gkk')}>
                <option value="">Select…</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              </Select>
            </Field>
            <Field label="Family Grouping"><TextInput value={form.family_grouping} onChange={set('family_grouping')} /></Field>
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <Field label="Household contact no."><TextInput value={form.contact} onChange={set('contact')} /></Field>
            <Field label="Household email"><TextInput value={form.email} onChange={set('email')} /></Field>
            <Field label="Registration status">
              <Select value={form.status} onChange={set('status')}>
                <option value="Pending">Pending</option><option value="Verified">Verified</option>
              </Select>
            </Field>
          </div>
        </div>

        <div className="flex gap-2.5 justify-end mt-6">
          <GhostButton onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
          <PrimaryButton onClick={save} disabled={saving} className="px-6 py-2.5 text-[14px]">
            {saving ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
