import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, Tabs, Panel } from '../../components/admin.jsx';
import { GkkManager } from '../../components/GkkManager.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { Field, TextInput, PrimaryButton, Badge } from '../../components/ui.jsx';
import { ThemePickerGrid, ModeSwitch } from '../../components/ThemePicker.jsx';
import { useTheme, THEMES } from '../../ThemeContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import ChangePasswordForm, { MIN_PASSWORD_LENGTH } from '../../components/ChangePasswordForm.jsx';
import { resizePhoto } from '../../lib/images.js';

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

const HERO_MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** The parish's main photo, shown in the public home page's hero. */
function HeroImageCard({ settings, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file (JPG or PNG).'); return; }
    if (file.size > HERO_MAX_SOURCE_BYTES) { toast.error('That photo is over 15 MB. Choose a smaller one.'); return; }
    setBusy(true);
    try {
      const res = await api.updateSettings({ hero_image: await resizePhoto(file) });
      onSaved(res.settings);
      toast.success('Parish photo updated');
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await api.updateSettings({ hero_image: '' });
      onSaved(res.settings);
      toast.success('Parish photo removed');
    } catch (err) {
      toast.error(err.message || 'Could not remove the photo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-6">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Parish photo</div>
      <div className="text-[13.5px] text-parish-muted mb-4">
        The main photo on the website's home page, e.g. the church front or a parish gathering. A wide (landscape) photo works best; it's resized automatically.
      </div>
      <div className="aspect-[16/7] w-full rounded-[14px] border-2 border-dashed border-parish-borderStrong bg-parish-field overflow-hidden flex items-center justify-center mb-4">
        {settings.hero_image ? (
          <img src={settings.hero_image} alt="Current parish photo" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-parish-muted px-4">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="mx-auto mb-1.5" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" /></svg>
            <div className="text-[13px]">No photo yet. The home page shows its plain background.</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <label className={`cursor-pointer px-[18px] py-2.5 font-semibold text-[14px] text-white bg-parish-fill rounded-xl inline-block ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
          {busy ? 'Uploading…' : settings.hero_image ? 'Replace photo' : 'Upload photo'}
          <input type="file" accept="image/*" onChange={onFile} className="hidden" disabled={busy} />
        </label>
        {settings.hero_image && (
          <button onClick={remove} disabled={busy} className="appearance-none border-none bg-none cursor-pointer font-semibold text-[13px] text-parish-error p-0">
            Remove photo
          </button>
        )}
      </div>
    </Panel>
  );
}

const BLANK_STORAGE = { accountId: '', accessKeyId: '', secretAccessKey: '', bucket: '', publicBaseUrl: '' };
const storageForm = (s) => ({
  accountId: s?.account_id || '', accessKeyId: s?.access_key_id || '', secretAccessKey: '', bucket: s?.bucket || '', publicBaseUrl: s?.public_base_url || '',
});

/**
 * Cloudflare R2 settings for Blog Article photos (staff admins only). The
 * secret key is write-only: once saved it is never sent back to a browser.
 */
function PhotoStorageCard() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(BLANK_STORAGE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getMediaStorage()
      .then((s) => { setSaved(s); setForm(storageForm(s)); })
      .catch((e) => setError(e.message));
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const complete = saved && saved.account_id && saved.access_key_id && saved.has_secret && saved.bucket && saved.public_base_url;

  async function save() {
    setBusy(true);
    try {
      const s = await api.saveMediaStorage(form);
      setSaved(s);
      setForm(storageForm(s));
      toast.success('Photo storage settings saved');
    } catch (e) {
      toast.error(e.message || 'Could not save the settings');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm('Remove the saved photo storage settings? Photo uploads stop working unless the media-upload function has its own R2 secrets.')) return;
    setBusy(true);
    try {
      await api.clearMediaStorage();
      setSaved({ has_secret: false });
      setForm(BLANK_STORAGE);
      toast.success('Photo storage settings removed');
    } catch (e) {
      toast.error(e.message || 'Could not remove the settings');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-6">
      <div className="flex items-center gap-2.5 flex-wrap mb-1">
        <div className="font-serif text-[22px] font-semibold text-parish-navy">Photo storage (Cloudflare R2)</div>
        {saved && (
          <Badge tone={complete ? 'green' : 'gold'}>{complete ? 'Set up' : 'Not set up'}</Badge>
        )}
      </div>
      <div className="text-[13.5px] text-parish-muted mb-4">
        Where Blog Article photos are stored. Only staff admins see this. The secret key is never shown again once saved;
        leave it blank to keep the saved one. See <code>docs/media-storage.md</code> for creating the bucket and API token.
      </div>
      {error ? (
        <div className="text-[13.5px] text-parish-error">{error}</div>
      ) : saved && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account ID"><TextInput value={form.accountId} onChange={set('accountId')} autoComplete="off" spellCheck={false} /></Field>
            <Field label="Bucket name"><TextInput value={form.bucket} onChange={set('bucket')} placeholder="parish-media" autoComplete="off" spellCheck={false} /></Field>
            <Field label="Access Key ID"><TextInput value={form.accessKeyId} onChange={set('accessKeyId')} autoComplete="off" spellCheck={false} /></Field>
            <Field label="Secret Access Key">
              <TextInput
                type="password"
                value={form.secretAccessKey}
                onChange={set('secretAccessKey')}
                placeholder={saved.has_secret ? '•••••••• saved (leave blank to keep)' : ''}
                autoComplete="new-password"
                spellCheck={false}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Public URL"><TextInput value={form.publicBaseUrl} onChange={set('publicBaseUrl')} placeholder="https://media.yourparish.org" autoComplete="off" spellCheck={false} inputMode="url" /></Field>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-5 flex-wrap">
            <PrimaryButton onClick={save} disabled={busy} className="px-[26px] py-3 text-[14.5px]">{busy ? 'Saving…' : 'Save storage settings'}</PrimaryButton>
            {saved.updated_at && (
              <button type="button" onClick={clear} disabled={busy} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-error p-0">
                Remove saved settings
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function ChangePasswordCard() {
  const toast = useToast();
  return (
    <div className="bg-parish-card border border-parish-border rounded-2xl p-6 shadow-cardSm">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Change password</div>
      <div className="text-[13.5px] text-parish-muted mb-4">Use at least {MIN_PASSWORD_LENGTH} characters. You stay signed in on this device.</div>
      <ChangePasswordForm onChanged={() => toast.success('Password changed')} />
    </div>
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

      {canEdit && <HeroImageCard settings={settings} onSaved={applySaved} />}

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

      {user?.isAdmin && <PhotoStorageCard />}

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
