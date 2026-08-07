import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody } from '../../components/admin.jsx';
import { Field, TextInput, PrimaryButton } from '../../components/ui.jsx';
import { ThemePickerGrid } from '../../components/ThemePicker.jsx';
import EmailSettingsCard from '../../components/EmailSettingsCard.jsx';
import { useToast } from '../../ToastContext.jsx';
import { useAuth } from '../../AuthContext.jsx';

const MAX_LOGO_BYTES = 500 * 1024;

function LogoCard({ settings, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG or JPG).');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo must be under 500 KB.');
      return;
    }

    setBusy(true);
    try {
      // Stored inline as a data URL — keeps deployment simple (no object
      // storage or static file server needed) and logos are small.
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
      });
      const res = await api.updateSettings({ logo: dataUrl });
      onSaved(res.settings);
      toast.success('Logo updated');
    } catch (err) {
      toast.error(err.message || 'Could not upload the logo');
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    setBusy(true);
    try {
      const res = await api.updateSettings({ logo: '' });
      onSaved(res.settings);
      toast.success('Logo removed');
    } catch (err) {
      toast.error(err.message || 'Could not remove the logo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Parish logo</div>
      <div className="text-[13.5px] text-parish-muted mb-4">
        Shown on the sign-in screen, the sidebar, and printed household sheets. PNG or JPG, ideally square, under 500&nbsp;KB.
      </div>
      <div className="flex items-center gap-5 flex-wrap">
        <div className="w-24 h-24 rounded-[18px] border-2 border-dashed border-[#d9cdb4] bg-[#fdfbf6] flex items-center justify-center overflow-hidden flex-none">
          {settings.logo ? (
            <img src={settings.logo} alt="Current parish logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-parish-gold" aria-hidden>
              <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2.5 items-start">
          <label className={`cursor-pointer px-[18px] py-2.5 font-semibold text-[14px] text-white bg-parish-blue rounded-xl inline-block ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
            {busy ? 'Uploading…' : settings.logo ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/*" onChange={onFile} className="hidden" disabled={busy} />
          </label>
          {settings.logo && (
            <button onClick={removeLogo} disabled={busy} className="appearance-none border-none bg-none cursor-pointer font-semibold text-[13px] text-parish-error p-0">
              Remove logo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const { changePassword } = useAuth();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  async function submit(e) {
    e.preventDefault();
    if (form.next !== form.confirm) { setError('The new passwords do not match.'); return; }
    if (form.next.length < 10) { setError('New password must be at least 10 characters.'); return; }

    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      setError(err.message || 'Could not change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Change password</div>
      <div className="text-[13.5px] text-parish-muted mb-4">Use at least 10 characters. You stay signed in on this device.</div>
      {error && <div className="mb-3 text-parish-error text-[13.5px] font-medium">{error}</div>}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <Field label="Current password"><TextInput type="password" autoComplete="current-password" value={form.current} onChange={set('current')} /></Field>
        <Field label="New password"><TextInput type="password" autoComplete="new-password" value={form.next} onChange={set('next')} /></Field>
        <Field label="Confirm new password"><TextInput type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} /></Field>
      </div>
      <PrimaryButton type="submit" disabled={saving} className="mt-5 px-[26px] py-3 text-[14.5px]">
        {saving ? 'Updating…' : 'Update password'}
      </PrimaryButton>
    </form>
  );
}

function ProfileTab() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getSettings().then((r) => setSettings(r.settings)).catch((e) => toast.error(e.message)); }, []);
  if (!settings) return null;

  function set(field, value) { setSettings((s) => ({ ...s, [field]: value })); }

  async function save() {
    setSaving(true);
    try {
      const { name, address, contact, email } = settings;
      const res = await api.updateSettings({ name, address, contact, email });
      setSettings(res.settings);
      toast.success('Parish profile saved');
    } catch (e) {
      toast.error(e.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-[18px]">Parish profile</div>
        <div className="flex flex-col gap-4">
          <Field label="Parish name"><TextInput value={settings.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Address"><TextInput value={settings.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <Field label="Contact"><TextInput value={settings.contact || ''} onChange={(e) => set('contact', e.target.value)} /></Field>
            <Field label="Email"><TextInput value={settings.email || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <PrimaryButton onClick={save} disabled={saving} className="px-[26px] py-3 text-[14.5px]">
            {saving ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
        </div>
      </div>

      <LogoCard settings={settings} onSaved={setSettings} />

      <ChangePasswordCard />

      <EmailSettingsCard />

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

  async function add() {
    if (!newName.trim()) return;
    setError('');
    try { await api.addGkk(newName.trim()); setNewName(''); reload(); } catch (e) { setError(e.message || 'Could not add this GKK'); }
  }
  async function save() {
    if (!editValue.trim()) return;
    setError('');
    try { await api.renameGkk(editing, editValue.trim()); setEditing(null); reload(); } catch (e) { setError(e.message || 'Could not rename this GKK'); }
  }
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
