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
import { fmtDateTime } from '../../constants.js';
import { markPasswordResetWorking, saveEmailSettings, sendPasswordReset } from '../../emailApi.js';

const MAX_LOGO_BYTES = 500 * 1024;

/** A part of the Parish profile card, below a divider. */
function ProfileSection({ title, note, children }) {
  return (
    <section className="border-t border-parish-line pt-5 mt-5">
      <div className="font-bold text-[15.5px] text-parish-ink mb-1">{title}</div>
      <div className="text-[13.5px] text-parish-muted mb-4">{note}</div>
      {children}
    </section>
  );
}

function LogoSection({ settings, onSaved }) {
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
    <ProfileSection title="Parish logo" note={<>Shown on the sign-in screen, the sidebar, and printed household sheets. PNG or JPG, ideally square, under 500&nbsp;KB.</>}>
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
    </ProfileSection>
  );
}

const HERO_MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/** The parish's main photo, shown in the public home page's hero. */
function HeroImageSection({ settings, onSaved }) {
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
    <ProfileSection title="Parish photo" note="The main photo on the website's home page, e.g. the church front or a parish gathering. A wide (landscape) photo works best; it's resized automatically.">
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
    </ProfileSection>
  );
}

const BLANK_STORAGE = { accountId: '', accessKeyId: '', secretAccessKey: '', bucket: '', publicBaseUrl: '' };
const storageForm = (s) => ({
  accountId: s?.account_id || '', accessKeyId: s?.access_key_id || '', secretAccessKey: '', bucket: s?.bucket || '', publicBaseUrl: s?.public_base_url || '',
});

/**
 * Cloudflare R2 settings for Blog Article photos (staff admins only). The
 * secret key is write-only: once saved it is never sent back to a browser.
 * Locked by default: a wrong value breaks every photo upload, so editing sits
 * behind a danger-zone warning.
 */
function PhotoStorageCard() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(BLANK_STORAGE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 'locked' → 'warning' (danger-zone notice shown) → 'editing'
  const [mode, setMode] = useState('locked');
  const editing = mode === 'editing';

  function lock() {
    setForm(storageForm(saved));
    setMode('locked');
  }

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
      setMode('locked');
      const moved = s.photos_moved || 0;
      toast.success(moved ? `Photo storage settings saved; ${moved} article${moved === 1 ? '' : 's'} now use the new Public URL` : 'Photo storage settings saved');
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
      setMode('locked');
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
          <fieldset disabled={!editing} className={`grid gap-4 sm:grid-cols-2 border-none p-0 m-0 min-w-0 ${editing ? '' : 'opacity-60 [&_input]:cursor-not-allowed'}`}>
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
              {/\.r2\.dev(\/|$)/i.test(form.publicBaseUrl.trim()) && (
                <div className="mt-2 px-3.5 py-2.5 rounded-xl bg-parish-warnTint text-parish-warnStrong text-[13px] font-medium">
                  Some internet providers block r2.dev addresses, so visitors on them see broken photos. Use the website's own
                  address with /media on the end (e.g. https://olgqp-registry.vercel.app/media, see docs/media-storage.md) or a
                  custom domain; existing article photos switch over when you save.
                </div>
              )}
            </div>
          </fieldset>

          {mode === 'locked' && (
            <div className="flex items-center gap-3 mt-5 flex-wrap">
              <button type="button" onClick={() => setMode('warning')} className="appearance-none cursor-pointer px-[18px] py-2.5 rounded-xl border-[1.5px] border-parish-errorBorder bg-parish-errorBg font-semibold text-[14px] text-parish-error">
                Edit settings…
              </button>
              <span className="text-[13px] text-parish-muted">Locked to prevent accidental changes.</span>
            </div>
          )}

          {mode === 'warning' && (
            <div role="alert" className="mt-5 p-4 rounded-xl border-[1.5px] border-parish-errorBorder bg-parish-errorBg">
              <div className="font-bold text-[14.5px] text-parish-error mb-1">Danger zone</div>
              <div className="text-[13.5px] text-parish-ink mb-3">
                These settings connect the website to its photo storage. A wrong value stops all Blog Article photo uploads,
                and pointing them at a different bucket or Public URL can make existing photos disappear from the website.
                Only change them if you know what you're doing.
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => setMode('editing')} className="appearance-none border-none cursor-pointer px-[18px] py-2.5 rounded-xl bg-parish-error font-semibold text-[14px] text-white">
                  I understand, unlock
                </button>
                <button type="button" onClick={() => setMode('locked')} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13.5px] text-parish-muted p-0">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editing && (
            <div className="flex items-center gap-4 mt-5 flex-wrap">
              <PrimaryButton onClick={save} disabled={busy} className="px-[26px] py-3 text-[14.5px]">{busy ? 'Saving…' : 'Save storage settings'}</PrimaryButton>
              <button type="button" onClick={lock} disabled={busy} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13.5px] text-parish-muted p-0">
                Cancel
              </button>
              {saved.updated_at && (
                <button type="button" onClick={clear} disabled={busy} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-error p-0 ml-auto">
                  Remove saved settings
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

const emailForm = (s) => ({ outgoingEmail: s?.outgoing_email || '', outgoingName: s?.outgoing_name || '' });

/**
 * Email (staff admins only): the parish email address, and password reset by
 * email. Supabase Auth sends the reset emails through the parish Gmail, set
 * up once in the Supabase dashboard (docs/email-setup.md); the Gmail App
 * Password is kept there, never here. A test email the admin confirms
 * arrived marks password reset as working.
 */
function EmailCard() {
  const toast = useToast();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emailForm(null));
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState('idle'); // idle | sending | asking | failed

  useEffect(() => {
    api.getSettings()
      .then(({ settings: s }) => { setSettings(s); setForm(emailForm(s)); })
      .catch((e) => setError(e.message));
  }, []);

  const migrated = !!settings && 'outgoing_email' in settings;
  const working = !!settings?.password_reset_verified_at;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const site = window.location.origin;

  async function save() {
    if (form.outgoingEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.outgoingEmail.trim())) { toast.error('Enter a valid email address.'); return; }
    setBusy(true);
    try {
      const s = await saveEmailSettings(form);
      setSettings(s);
      setForm(emailForm(s));
      setEditing(false);
      toast.success('Email settings saved');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTest('sending');
    try {
      await sendPasswordReset(user.email);
      setTest('asking');
    } catch (e) {
      toast.error(e.message);
      setTest('idle');
    }
  }

  async function confirm(arrived) {
    if (!arrived) { setTest('failed'); return; }
    setBusy(true);
    try {
      setSettings(await markPasswordResetWorking(true));
      setTest('idle');
      toast.success('Password reset by email is working');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-6">
      <div className="flex items-center gap-2.5 flex-wrap mb-1">
        <div className="font-serif text-[22px] font-semibold text-parish-navy">Email</div>
        {settings && <Badge tone={working ? 'green' : 'gold'}>{working ? 'Password reset working' : 'Not set up'}</Badge>}
      </div>
      <div className="text-[13.5px] text-parish-muted mb-4">
        The parish email staff use for sending. For now it lets staff reset a forgotten password by email; sending documents by email comes later.
      </div>
      {error ? <div className="text-[13.5px] text-parish-error">{error}</div> : settings && (
        <>
          {!migrated && (
            <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-parish-warnTint text-parish-warnStrong text-[13px] font-medium" role="status">
              Run the <strong>0036_email_integration.sql</strong> migration in Supabase to save these settings.
            </div>
          )}
          <fieldset disabled={!editing} className={`grid gap-4 sm:grid-cols-2 border-none p-0 m-0 min-w-0 ${editing ? '' : 'opacity-60 [&_input]:cursor-not-allowed'}`}>
            <Field label="Parish email (Gmail)"><TextInput type="email" value={form.outgoingEmail} onChange={set('outgoingEmail')} placeholder="parish.office@gmail.com" autoComplete="off" spellCheck={false} /></Field>
            <Field label="Sender name"><TextInput value={form.outgoingName} onChange={set('outgoingName')} placeholder={settings.name || 'Our Lady of Guadalupe Quasi-Parish'} autoComplete="off" /></Field>
          </fieldset>
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            {editing ? (
              <>
                <PrimaryButton onClick={save} disabled={busy} className="px-[22px] py-2.5 text-[14px]">{busy ? 'Saving…' : 'Save email'}</PrimaryButton>
                <button type="button" onClick={() => { setForm(emailForm(settings)); setEditing(false); }} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13.5px] text-parish-muted p-0">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)} disabled={!migrated} className="appearance-none cursor-pointer px-4 py-2 rounded-xl border-[1.5px] border-parish-borderSoft bg-parish-card font-semibold text-[13.5px] text-parish-text2 disabled:opacity-50">
                Edit email…
              </button>
            )}
          </div>

          <div className="mt-6 pt-5 border-t border-parish-line">
            <div className="font-semibold text-[15px] text-parish-navy mb-1">Password reset by email</div>
            <div className="text-[13px] text-parish-muted mb-3">
              "Forgot password?" on the staff sign-in page emails a reset link. Set this up once (details in <code>docs/email-setup.md</code>):
            </div>
            <ol className="m-0 pl-5 flex flex-col gap-2 text-[13.5px] text-parish-ink leading-relaxed">
              <li>On the parish Gmail, turn on <strong>2-Step Verification</strong>, then create an <strong>App Password</strong> (Google Account → Security → App passwords).</li>
              <li>
                In Supabase: <strong>Authentication → Emails → SMTP Settings</strong>, turn on custom SMTP: host <code>smtp.gmail.com</code>, port <code>465</code>,
                username = the Gmail address, password = the App Password, sender email and name = the ones above.
              </li>
              <li>
                In Supabase: <strong>Authentication → URL Configuration</strong>: Site URL <code>https://olgqp-registry.vercel.app</code>; under Redirect URLs add
                {' '}<code>https://olgqp-registry.vercel.app/**</code>{site !== 'https://olgqp-registry.vercel.app' && <> and <code>{site}/**</code></>}.
              </li>
              <li>Send yourself a test below.</li>
            </ol>
            <div className="mt-4 p-3.5 rounded-xl bg-parish-field border border-parish-line">
              {test === 'asking' ? (
                <div>
                  <div className="text-[13.5px] text-parish-ink mb-2.5">A reset email was sent to <strong>{user.email}</strong>. Did it arrive (check spam too)?</div>
                  <div className="flex gap-2.5 flex-wrap">
                    <PrimaryButton onClick={() => confirm(true)} disabled={busy} className="px-4 py-2 text-[13.5px]">Yes, it arrived</PrimaryButton>
                    <button type="button" onClick={() => confirm(false)} className="appearance-none cursor-pointer px-4 py-2 rounded-xl border-[1.5px] border-parish-borderSoft bg-parish-card font-semibold text-[13.5px] text-parish-text2">No</button>
                  </div>
                  <div className="text-[12px] text-parish-muted mt-2">You don't have to use the link; your password stays the same unless you do.</div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <button type="button" onClick={sendTest} disabled={test === 'sending'} className="appearance-none border-none cursor-pointer px-4 py-2 rounded-xl bg-parish-fill text-white font-semibold text-[13.5px] disabled:opacity-60">
                    {test === 'sending' ? 'Sending…' : working ? 'Send another test' : 'Send test reset email'}
                  </button>
                  <span className="text-[13px] text-parish-muted">
                    {working ? `Confirmed working on ${fmtDateTime(settings.password_reset_verified_at, { time: false })}.` : `To ${user.email}.`}
                  </span>
                </div>
              )}
              {test === 'failed' && (
                <div className="mt-3 text-[13px] text-parish-warnStrong leading-relaxed">
                  Check that: the App Password was pasted without spaces; the port is 465; the sender email is the same Gmail; and
                  the Redirect URLs are added. Supabase → Authentication → Logs shows why an email failed.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

/** Platform Integrations (staff admins only): the outside services the site uses. */
function IntegrationsTab() {
  return (
    <div className="grid gap-[18px] lg:grid-cols-2 lg:items-start">
      <PhotoStorageCard />
      <EmailCard />
    </div>
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
      {/* The parish's name, logo and photo in one card. The logo and photo save as soon as they're uploaded. */}
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

        <LogoSection settings={settings} onSaved={applySaved} />
        <HeroImageSection settings={settings} onSaved={applySaved} />
      </Panel>
      )}

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

const CONFIG_TABS = [['config', 'Parish Config'], ['gkk', 'Parish GKK'], ['integrations', 'Platform Integrations']];

export default function ParishConfig() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  // GKKs for staff who may change settings; integrations for staff admins only.
  const tabs = CONFIG_TABS.filter(([k]) => k === 'config' || (k === 'gkk' && can(user, 'settings')) || (k === 'integrations' && user?.isAdmin));
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : tabs[0][0];
  const setTab = (k) => setParams(k === CONFIG_TABS[0][0] ? {} : { tab: k }, { replace: true });

  return (
    <>
      <PageHeader title="Parish Config" subtitle="Profile, privacy, GKK settings & integrations" />
      <PageBody>
        <div className="max-w-[1180px]">
          {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
          {tab === 'config' && <ProfileTab />}
          {tab === 'gkk' && <GkkManager />}
          {tab === 'integrations' && <IntegrationsTab />}
        </div>
      </PageBody>
    </>
  );
}
