import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody } from '../../components/admin.jsx';
import { Field, TextInput, PrimaryButton } from '../../components/ui.jsx';
import { ThemePickerGrid } from '../../components/ThemePicker.jsx';

function ProfileTab() {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.getSettings().then((r) => setSettings(r.settings)); }, []);
  if (!settings) return null;

  function set(field, value) { setSettings((s) => ({ ...s, [field]: value })); setSaved(false); }
  async function save() {
    const res = await api.updateSettings(settings);
    setSettings(res.settings);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-[18px]" style={{ gap: '18px' }}>
      <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-[18px]" style={{ marginBottom: '18px' }}>Parish profile</div>
        <div className="flex flex-col gap-4">
          <Field label="Parish name"><TextInput value={settings.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Address"><TextInput value={settings.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <Field label="Contact"><TextInput value={settings.contact || ''} onChange={(e) => set('contact', e.target.value)} /></Field>
            <Field label="Email"><TextInput value={settings.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <PrimaryButton onClick={save} className="px-[26px] py-3 text-[14.5px]" style={{ padding: '12px 26px' }}>Save changes</PrimaryButton>
          {saved && <span className="text-[13px] text-[#2f7a52] font-semibold">Saved.</span>}
        </div>
      </div>
      <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Appearance</div>
        <div className="text-[13.5px] text-parish-muted mb-4">Choose a color theme for the registration portal and admin panel. Saved on this device.</div>
        <ThemePickerGrid />
      </div>
      <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-3.5">Data &amp; privacy</div>
        <div className="flex gap-2.5 items-start text-[13.5px] text-parish-text2 leading-relaxed">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--p-blue)" strokeWidth="1.7" className="flex-none mt-px"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <span>Member information is confidential and accessible only to authorized parish staff. All exports and printed sheets should be handled in accordance with the Data Privacy Act of 2012.</span>
        </div>
      </div>
    </div>
  );
}

export default function ParishConfig() {
  const [tab, setTab] = useState('config');

  return (
    <>
      <PageHeader title="Parish Config" subtitle="Profile, privacy & GKK settings" />
      <PageBody>
        <div className="max-w-[720px]">
          <div className="flex gap-1 mb-[22px] border-b border-parish-border" style={{ marginBottom: '22px' }}>
            {[['config', 'Parish Config'], ['gkk', 'Parish GKK']].map(([k, label]) => (
              <button
                key={k} onClick={() => setTab(k)}
                className="appearance-none border-none bg-none cursor-pointer px-4 py-2.5 -mb-px font-semibold text-[15px]"
                style={{ color: tab === k ? 'var(--p-blue)' : '#8a836f', borderBottom: `2.5px solid ${tab === k ? 'var(--p-blue)' : 'transparent'}` }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'config' && <ProfileTab />}
          {tab === 'gkk' && (
            <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
              <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Basic Ecclesial Communities (GKK)</div>
              <div className="text-[13.5px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Add, rename, or remove the parish's GKKs. A GKK currently assigned to a household cannot be deleted.</div>
              <GkkList />
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}

function GkkList() {
  const [rows, setRows] = useState([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  function reload() { api.listGkks().then((r) => setRows(r.rows)); }
  useEffect(() => { reload(); }, []);

  async function add() { if (!newName.trim()) return; await api.addGkk(newName.trim()); setNewName(''); reload(); }
  async function save() { if (!editValue.trim()) return; await api.renameGkk(editing, editValue.trim()); setEditing(null); reload(); }
  async function remove(name) {
    setError('');
    try { await api.deleteGkk(name); reload(); } catch (e) { setError(e.message || 'Could not delete this GKK'); }
  }

  return (
    <>
      {error && <div className="mb-3 text-parish-error text-[13.5px] font-medium">{error}</div>}
      <div className="flex gap-2 mb-4">
        <TextInput placeholder="New GKK name (e.g. GKK San Pedro Calungsod)" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <PrimaryButton onClick={add} className="px-[22px] py-2.5 text-[14px] whitespace-nowrap" style={{ padding: '11px 22px' }}>Add</PrimaryButton>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 border border-[#f0e8d6] rounded-xl px-3.5 py-2.5 bg-[#fdfbf6]">
            {editing === r.name ? (
              <>
                <TextInput value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1 !py-2.5 !bg-white !border-parish-blue" />
                <button onClick={save} className="appearance-none border-none bg-parish-blue text-white cursor-pointer px-4 py-2 rounded-lg font-bold text-[12.5px]">Save</button>
                <button onClick={() => setEditing(null)} className="appearance-none border-none bg-[#f4efe3] text-parish-text2 cursor-pointer px-3.5 py-2 rounded-lg font-semibold text-[12.5px]">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold text-[14.5px] text-parish-navy">{r.name}</span>
                <span className="font-semibold text-[12px] text-parish-muted">{r.count} household(s)</span>
                <button onClick={() => { setEditing(r.name); setEditValue(r.name); }} className="appearance-none border-none bg-[var(--p-blue-tint)] text-parish-blue cursor-pointer px-3.5 py-2 rounded-lg font-semibold text-[12.5px]">Edit</button>
                <button onClick={() => remove(r.name)} className="appearance-none border-none bg-parish-errorBg text-parish-error cursor-pointer px-3.5 py-2 rounded-lg font-semibold text-[12.5px]">Delete</button>
              </>
            )}
          </div>
        ))}
        {!rows.length && <div className="text-[13.5px] text-parish-muted">No GKKs added yet.</div>}
      </div>
    </>
  );
}
