import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, Tabs, Panel } from '../../components/admin.jsx';
import { GkkManager } from '../../components/GkkManager.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { Field, TextInput, PrimaryButton } from '../../components/ui.jsx';
import { ThemePickerGrid, ModeSwitch } from '../../components/ThemePicker.jsx';
import { useTheme, THEMES } from '../../ThemeContext.jsx';
import { useToast } from '../../ToastContext.jsx';

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
    <Panel className="p-6">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Parish logo</div>
      <div className="text-[13.5px] text-parish-muted mb-4">
        Shown on the sign-in screen, the sidebar, and printed household sheets. PNG or JPG, ideally square, under 500&nbsp;KB.
      </div>
      <div className="flex items-center gap-5 flex-wrap">
        <div className="w-24 h-24 rounded-[18px] border-2 border-dashed border-parish-borderStrong bg-parish-field flex items-center justify-center overflow-hidden flex-none">
          {settings.logo ? (
            <img src={settings.logo} alt="Current parish logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-parish-gold" aria-hidden>
              <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2.5 items-start">
          <label className={`cursor-pointer px-[18px] py-2.5 font-semibold text-[14px] text-white bg-parish-fill rounded-xl inline-block ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
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
    </Panel>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); };

  async function submit(e) {
    e.preventDefault();
    if (!form.current) { setError('Enter your current password.'); return; }
    if (form.next !== form.confirm) { setError('The new passwords do not match.'); return; }
    if (form.next.length < 10) { setError('New password must be at least 10 characters.'); return; }

    setSaving(true);
    try {
      await api.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) {
      setError(err.message || 'Could not change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="bg-parish-card border border-parish-border rounded-2xl p-6 shadow-cardSm">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Change password</div>
      <div className="text-[13.5px] text-parish-muted mb-4">Use at least 10 characters. You stay signed in on this device.</div>
      {error && <div className="mb-3 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
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
  const layout = useOutletContext();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getSettings().then((r) => setSettings(r.settings)).catch((e) => toast.error(e.message)); }, []);
  if (!settings) return null;
  const canEdit = can(user, 'settings');

  function set(field, value) { setSettings((s) => ({ ...s, [field]: value })); }

  /** Keep this form and the admin sidebar (logo + parish name) in step after a save. */
  function applySaved(saved) {
    setSettings(saved);
    layout?.setParish?.(saved);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api.updateSettings({ name: settings.name });
      applySaved(res.settings);
      toast.success('Parish profile saved');
    } catch (e) {
      toast.error(e.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  // Desktop: the parish's identity on the left, this account and device on the right.
  return (
    <div className="grid gap-[18px] lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-[18px] min-w-0">
      {canEdit && (
      <Panel className="p-6">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-[18px]">Parish profile</div>
        <div className="flex flex-col gap-4">
          <Field label="Parish name"><TextInput value={settings.name || ''} onChange={(e) => set('name', e.target.value)} /></Field>
          <div className="text-[13.5px] text-parish-muted">
            The address, phone, email and office hours are in{' '}
            <Link to="/admin/website?tab=office" className="font-semibold text-parish-blue">Parish Website → Office &amp; Contact</Link>.
          </div>
        </div>
        <div className="flex items-center gap-3 mt-5">
          <PrimaryButton onClick={save} disabled={saving} className="px-[26px] py-3 text-[14.5px]">
            {saving ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
        </div>
      </Panel>

      )}

      {canEdit && <LogoCard settings={settings} onSaved={applySaved} />}

      <PrivacyCard />
      </div>

      <div className="flex flex-col gap-[18px] min-w-0">
      <Panel className="p-6">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Appearance</div>
        <div className="text-[13.5px] text-parish-muted mb-4">Choose a color theme for the registration portal and admin panel. Saved on this device.</div>
        <ThemePickerGrid />
        <ParishThemeRow canEdit={canEdit} onSaved={applySaved} />
        <div className="mt-5 flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-[13.5px] text-parish-text2">Admin panel</span>
          <ModeSwitch />
          <span className="text-[12.5px] text-parish-muted">Auto follows this device's light or dark setting.</span>
        </div>
      </Panel>

      <ChangePasswordCard />
      </div>
    </div>
  );
}

function PrivacyCard() {
  return (
    <Panel className="p-6">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-3.5">Data &amp; privacy</div>
      <div className="flex gap-2.5 items-start text-[13.5px] text-parish-text2 leading-relaxed">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--p-blue)" strokeWidth="1.7" className="flex-none mt-px"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        <span>Member information is confidential and accessible only to authorized parish staff. All exports and printed sheets should be handled in accordance with the Data Privacy Act of 2012.</span>
      </div>
    </Panel>
  );
}

/**
 * The parish default theme: what the public site and every device that
 * hasn't picked its own theme use. Staff with full access can set it to the
 * theme chosen above.
 */
function ParishThemeRow({ canEdit, onSaved }) {
  const toast = useToast();
  const { theme, deviceTheme, parishTheme, setParishTheme, followParishTheme } = useTheme();
  const [busy, setBusy] = useState(false);
  const label = (id) => THEMES.find((t) => t.id === id)?.label || 'Gold & Navy';

  async function makeDefault() {
    setBusy(true);
    try {
      const res = await api.updateSettings({ theme });
      if (res.settings.theme !== theme) throw new Error('Run the 0014_roles_activity_trash.sql migration in Supabase to save a parish theme');
      setParishTheme(theme);
      onSaved(res.settings);
      toast.success(`${label(theme)} is now the parish theme`);
    } catch (e) {
      toast.error(e.message || 'Could not save the parish theme');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex items-center gap-3 flex-wrap text-[13px] text-parish-text2">
      <span>Parish theme: <strong className="text-parish-navy">{label(parishTheme)}</strong>{deviceTheme ? ' · this device uses its own choice' : ''}</span>
      {canEdit && theme !== (parishTheme || 'classic') && (
        <button type="button" onClick={makeDefault} disabled={busy} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-[var(--p-blue-tint)] font-semibold text-[12.5px] text-parish-blue disabled:opacity-60">
          {busy ? 'Saving…' : `Make ${label(theme)} the parish theme`}
        </button>
      )}
      {deviceTheme && (
        <button type="button" onClick={followParishTheme} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[12.5px] text-parish-blue">Use the parish theme on this device</button>
      )}
    </div>
  );
}

const CONFIG_TABS =[['config', 'Parish Config'], ['gkk', 'Parish GKK']];

export default function ParishConfig() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const tabs = can(user, 'settings') ? CONFIG_TABS : CONFIG_TABS.slice(0, 1);
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : tabs[0][0];
  const setTab = (k) => setParams(k === CONFIG_TABS[0][0] ? {} : { tab: k }, { replace: true });

  return (
    <>
      <PageHeader title="Parish Config" subtitle="Profile, privacy & GKK settings" />
      <PageBody>
        <div className="max-w-[1180px]">
          {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
          {tab === 'config' && <ProfileTab />}
          {tab === 'gkk' && <GkkManager />}
        </div>
      </PageBody>
    </>
  );
}
