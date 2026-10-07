import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, Tabs, Panel, LoadingState } from '../../components/admin.jsx';
import { GkkManager } from '../../components/GkkManager.jsx';
import MyGkk from './MyGkk.jsx';
import LastYearList from '../../components/LastYearList.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { ownSettingsOnly } from '../../components/adminNav.js';
import { Field, TextInput, PrimaryButton, GhostButton, Badge, Spinner } from '../../components/ui.jsx';
import { UploadOverlay } from '../../components/website/shared.jsx';
import { ThemePickerGrid, ModeSwitch } from '../../components/ThemePicker.jsx';
import { useTheme, THEMES } from '../../ThemeContext.jsx';
import { useToast } from '../../ToastContext.jsx';
import ChangePasswordForm, { MIN_PASSWORD_LENGTH } from '../../components/ChangePasswordForm.jsx';
import { resizeLogo, resizePhoto } from '../../lib/images.js';
import { fmtDateTime } from '../../constants.js';
import { DEFAULT_SITE_URL, normalizeSiteUrl } from '../../lib/census.js';
import { markPasswordResetWorking, saveEmailSettings, sendPasswordReset } from '../../emailApi.js';

// The logo is shrunk before it's saved (resizeLogo), so the file picked can be big.
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** A titled card on the Parish Config tab, with an optional note under the title. */
function ConfigCard({ title, note, children, footer }) {
  return (
    <Panel className="overflow-hidden">
      <div className="p-6">
        <div className="font-serif text-[22px] font-semibold text-parish-navy">{title}</div>
        {note && <div className="text-[13.5px] text-parish-muted mt-1">{note}</div>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="px-6 py-3.5 border-t border-parish-line2 bg-parish-card flex items-center gap-3 flex-wrap">{footer}</div>}
    </Panel>
  );
}

/** One image of the Logo & photo card: its name, where it shows, then the picture and its buttons. */
function ImageBlock({ title, usedOn, note, children }) {
  return (
    <section className="first:pt-0 first:mt-0 first:border-t-0 border-t border-parish-line pt-5 mt-5">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="font-bold text-[15px] text-parish-ink">{title}</span>
        {usedOn.map((u) => <Badge key={u} tone="gray">{u}</Badge>)}
      </div>
      <div className="text-[13px] text-parish-muted mb-3.5">{note}</div>
      {children}
    </section>
  );
}

/** What an image's preview and button say while `busy` is 'upload' or 'remove'. */
const IMAGE_BUSY_LABELS = { upload: 'Uploading…', remove: 'Removing…' };

/** Upload / Replace and Remove for one image; `busy` is '', 'upload' or 'remove'. */
function ImageButtons({ has, busy, noun, onFile, onRemove }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label aria-busy={!!busy || undefined} className={`cursor-pointer px-4 py-2 font-semibold text-[13.5px] text-white bg-parish-fill rounded-xl inline-flex items-center gap-2 ${busy ? 'opacity-90 pointer-events-none' : ''}`}>
        {busy && <Spinner />}
        {busy ? IMAGE_BUSY_LABELS[busy] : has ? `Replace ${noun}` : `Upload ${noun}`}
        <input type="file" accept="image/*" onChange={onFile} className="hidden" disabled={busy} />
      </label>
      {has && (
        <button type="button" onClick={onRemove} disabled={busy} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-error p-0 disabled:opacity-60">
          Remove
        </button>
      )}
    </div>
  );
}

function LogoSection({ settings, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG or JPG).');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo must be under 5 MB.');
      return;
    }

    setBusy('upload');
    try {
      // Stored inline as a data URL (printed sheets and the sign-in page use it
      // as is), shrunk first: every public page loads it.
      const res = await api.updateSettings({ logo: await resizeLogo(file) });
      onSaved(res.settings);
      toast.success('Logo updated');
    } catch (err) {
      toast.error(err.message || 'Could not upload the logo');
    } finally {
      setBusy('');
    }
  }

  async function removeLogo() {
    setBusy('remove');
    try {
      const res = await api.updateSettings({ logo: '' });
      onSaved(res.settings);
      toast.success('Logo removed');
    } catch (err) {
      toast.error(err.message || 'Could not remove the logo');
    } finally {
      setBusy('');
    }
  }

  return (
    <ImageBlock title="Logo" usedOn={['Sign-in', 'Sidebar', 'Printed sheets']} note={<>PNG or JPG, ideally square with a plain or clear background. It's resized for you.</>}>
      <div className="flex items-center gap-5 flex-wrap">
        <div className={`relative w-24 h-24 rounded-[18px] bg-parish-field flex items-center justify-center overflow-hidden flex-none ${settings.logo ? 'border border-parish-line2 p-1.5' : 'border-2 border-dashed border-parish-borderStrong'}`}>
          <UploadOverlay busy={!!busy} label={IMAGE_BUSY_LABELS[busy]} />
          {settings.logo ? (
            <img src={settings.logo} alt="Current parish logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-parish-gold" aria-hidden>
              <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 items-start min-w-0">
          <div className="text-[13px] text-parish-text2">{settings.logo ? 'Current logo' : 'No logo yet: a star emblem shows instead.'}</div>
          <ImageButtons has={!!settings.logo} busy={busy} noun="logo" onFile={onFile} onRemove={removeLogo} />
        </div>
      </div>
    </ImageBlock>
  );
}

const HERO_MAX_SOURCE_BYTES = 15 * 1024 * 1024;

/**
 * The parish photo, saved where visitors' browsers can keep it: on R2
 * (parish/…, a link the browser caches), else, before the media-upload
 * function allows that folder or without photo storage, inline as before.
 */
async function heroImageValue(file) {
  try {
    return await api.uploadImage(file, 'parish');
  } catch {
    return resizePhoto(file, { maxWidth: 1600, quality: 0.8 });
  }
}

/** An R2 photo the parish photo no longer uses: delete it, quietly (inline ones just go with the setting). */
function dropOldHero(url) {
  if (/^https?:/.test(url || '')) api.deleteImage(url).catch(() => {});
}

/** The parish's main photo, shown in the public home page's hero. */
function HeroImageSection({ settings, onSaved }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file (JPG or PNG).'); return; }
    if (file.size > HERO_MAX_SOURCE_BYTES) { toast.error('That photo is over 15 MB. Choose a smaller one.'); return; }
    setBusy('upload');
    try {
      const old = settings.hero_image;
      const res = await api.updateSettings({ hero_image: await heroImageValue(file) });
      onSaved(res.settings);
      dropOldHero(old);
      toast.success('Parish photo updated');
    } catch (err) {
      toast.error(err.message || 'Could not upload the photo');
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    setBusy('remove');
    try {
      const old = settings.hero_image;
      const res = await api.updateSettings({ hero_image: '' });
      onSaved(res.settings);
      dropOldHero(old);
      toast.success('Parish photo removed');
    } catch (err) {
      toast.error(err.message || 'Could not remove the photo');
    } finally {
      setBusy('');
    }
  }

  return (
    <ImageBlock title="Parish photo" usedOn={['Website home page']} note="The church front or a parish gathering. A wide (landscape) photo works best; it's resized for you.">
      <div className={`relative aspect-[16/7] w-full rounded-[14px] bg-parish-field overflow-hidden flex items-center justify-center mb-3.5 ${settings.hero_image ? 'border border-parish-line2' : 'border-2 border-dashed border-parish-borderStrong'}`}>
        <UploadOverlay busy={!!busy} label={IMAGE_BUSY_LABELS[busy]} />
        {settings.hero_image ? (
          <img src={settings.hero_image} alt="Current parish photo" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-parish-muted px-4">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="mx-auto mb-1.5" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" /></svg>
            <div className="text-[13px]">No photo yet. The home page shows its plain background.</div>
          </div>
        )}
      </div>
      <ImageButtons has={!!settings.hero_image} busy={busy} noun="photo" onFile={onFile} onRemove={remove} />
    </ImageBlock>
  );
}

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

const SERVICE_ICONS = {
  database: (
    <svg {...svgProps} width="22" height="22" strokeWidth="1.7">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8v-13" />
      <path d="M4.5 12c0 1.55 3.36 2.8 7.5 2.8s7.5-1.25 7.5-2.8" />
    </svg>
  ),
  photo: (
    <svg {...svgProps} width="22" height="22" strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" />
    </svg>
  ),
  mail: (
    <svg {...svgProps} width="22" height="22" strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" />
    </svg>
  ),
};

const LockIcon = () => (
  <svg {...svgProps} width="15" height="15" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);

/** Green "working" or gold "needs attention" badge, with a dot. */
function StatusBadge({ ok, children }) {
  return (
    <Badge tone={ok ? 'green' : 'gold'}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5" aria-hidden />
      {children}
    </Badge>
  );
}

/**
 * One card on Platform Integrations: the service's icon, name, provider and
 * status, a short note, its details, then a footer of actions.
 */
function IntegrationCard({ icon, title, provider, status, note, children, footer }) {
  return (
    <Panel className="overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="shrink-0 w-11 h-11 rounded-xl grid place-items-center bg-[var(--p-blue-tint)] text-parish-blue">{SERVICE_ICONS[icon]}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap">
              <h2 className="m-0 font-serif text-[22px] leading-tight font-semibold text-parish-navy">{title}</h2>
              {status}
            </div>
            <div className="text-[12.5px] text-parish-muted mt-0.5">{provider}</div>
          </div>
        </div>
        {note && <p className="text-[13.5px] text-parish-text2 leading-relaxed mt-4 mb-0">{note}</p>}
        <div className="mt-4">{children}</div>
      </div>
      {footer && <div className="px-5 sm:px-6 py-3.5 border-t border-parish-line2 flex items-center gap-3 flex-wrap">{footer}</div>}
    </Panel>
  );
}

/** A small heading inside a card, with an optional action on the right. */
function CardSection({ title, action, children }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-2.5 min-h-[32px]">
        <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{title}</span>
        <span className="flex-1 h-px bg-parish-track" />
        {action}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ value, label }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy. Select it and copy it by hand.');
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : `Copy ${label}`}
      aria-label={`Copy ${label}`}
      className={`appearance-none border-none bg-transparent cursor-pointer shrink-0 w-8 h-8 -my-1 rounded-lg grid place-items-center transition hover:bg-parish-hover ${copied ? 'text-parish-ok' : 'text-parish-icon hover:text-parish-navy'}`}
    >
      {copied ? (
        <svg {...svgProps} width="16" height="16" strokeWidth="2.2"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      ) : (
        <svg {...svgProps} width="16" height="16" strokeWidth="1.8"><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></svg>
      )}
    </button>
  );
}

/** Saved values, read-only and in full: one row each, with a copy button where it helps. */
function DetailList({ rows }) {
  return (
    <dl className="m-0 rounded-xl border border-parish-line bg-parish-field divide-y divide-parish-line">
      {rows.map(({ label, value, mono, copy, empty = 'Not set' }) => (
        <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5 px-3.5 py-2.5 min-w-0">
          <dt className="sm:w-[132px] shrink-0 text-[12.5px] font-semibold text-parish-muted">{label}</dt>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <dd className={`m-0 flex-1 min-w-0 break-all ${value ? 'text-parish-ink' : 'text-parish-faint italic'} ${mono && value ? 'font-mono text-[13px]' : 'text-[13.5px]'}`}>
              {value || empty}
            </dd>
            {copy && value && <CopyButton value={value} label={label} />}
          </div>
        </div>
      ))}
    </dl>
  );
}

const linkButton = 'appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13.5px] text-parish-muted p-0 hover:text-parish-ink';

/**
 * The Supabase project this build of the site talks to, read from
 * VITE_SUPABASE_URL (https://<project id>.supabase.co). Read-only: it only
 * changes by setting the variable in Vercel and redeploying.
 */
function DatabaseCard() {
  const url = import.meta.env.VITE_SUPABASE_URL || '';
  let projectId = '';
  try { projectId = /^([a-z0-9]+)\.supabase\.co$/i.exec(new URL(url).hostname)?.[1] || ''; } catch { /* not set or not a URL */ }

  return (
    <IntegrationCard
      icon="database"
      title="Database"
      provider="Supabase"
      status={<StatusBadge ok={!!url}>{url ? 'Connected' : 'Not set'}</StatusBadge>}
      note="Where every record in the registry is kept. The Project ID is the one in the Supabase dashboard address."
      footer={(
        <>
          <span className="text-[13px] text-parish-muted flex-1 min-w-[220px]">
            Set by <code>VITE_SUPABASE_URL</code> in Vercel. To move to another project, change it there and redeploy.
          </span>
          {projectId && (
            <a
              href={`https://supabase.com/dashboard/project/${projectId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-semibold text-[13.5px] text-parish-blue no-underline hover:underline"
            >
              Open in Supabase
              <svg {...svgProps} width="14" height="14" strokeWidth="2"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
            </a>
          )}
        </>
      )}
    >
      <DetailList rows={[
        { label: 'Project ID', value: projectId, mono: true, copy: true },
        { label: 'Project URL', value: url, copy: true },
      ]} />
    </IntegrationCard>
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
const TEST_STEPS = { settings: 'Settings', upload: 'Upload to R2', public: 'Public URL', cleanup: 'Clean up' };

/** The result of Test connection on the Photo storage card: a verdict, then each step. */
function ConnectionTest({ test }) {
  if (test.running) {
    return (
      <div role="status" className="rounded-xl border border-parish-line bg-parish-field px-3.5 py-3 text-[13.5px] text-parish-text2">
        Testing: uploading a small file to R2 and reading it back through the Public URL…
      </div>
    );
  }
  if (test.error) {
    return <div role="alert" className="rounded-xl border border-parish-errorBorder bg-parish-errorBg px-3.5 py-3 text-[13.5px] text-parish-error">{test.error}</div>;
  }
  const { passed, steps } = test.result;
  return (
    <div role="status" className={`rounded-xl border overflow-hidden ${passed ? 'border-parish-okBorder' : 'border-parish-errorBorder'}`}>
      <div className={`px-3.5 py-2.5 font-bold text-[14px] ${passed ? 'bg-parish-okBg text-parish-ok' : 'bg-parish-errorBg text-parish-error'}`}>
        {passed ? 'Connection works: these settings are ready to save.' : 'Connection failed: fix the settings below and test again.'}
      </div>
      <ul className="m-0 p-0 list-none divide-y divide-parish-line bg-parish-field">
        {steps.map((s) => {
          // A test file that couldn't be deleted is only a warning.
          const tone = s.ok ? 'text-parish-ok' : s.step === 'cleanup' ? 'text-parish-warnStrong' : 'text-parish-error';
          return (
            <li key={s.step} className="flex gap-2.5 items-start px-3.5 py-2.5">
              <span className={`flex-none font-bold text-[14px] leading-5 ${tone}`} aria-hidden>{s.ok ? '✓' : s.step === 'cleanup' ? '!' : '✕'}</span>
              <div className="min-w-0 text-[13.5px] leading-snug">
                <span className="font-semibold text-parish-navy">{TEST_STEPS[s.step] || s.step}</span>
                <span className="sr-only">{s.ok ? ' passed' : ' failed'}</span>
                <span className="block text-parish-text2 break-words">{s.message}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PhotoStorageCard() {
  const toast = useToast();
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(BLANK_STORAGE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 'locked' → 'warning' (danger-zone notice shown) → 'editing'
  const [mode, setMode] = useState('locked');
  const editing = mode === 'editing';
  // The connection test of what's in the form: null, { running }, { result } or { error }.
  const [test, setTest] = useState(null);

  function lock() {
    setForm(storageForm(saved));
    setTest(null);
    setMode('locked');
  }

  async function runTest() {
    setTest({ running: true });
    try {
      setTest({ result: await api.testMediaStorage(form) });
    } catch (e) {
      setTest({ error: e.message || 'Could not run the test' });
    }
  }

  useEffect(() => {
    api.getMediaStorage()
      .then((s) => { setSaved(s); setForm(storageForm(s)); })
      .catch((e) => setError(e.message));
  }, []);

  // A change makes the last test result out of date.
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setTest(null); };
  const complete = saved && saved.account_id && saved.access_key_id && saved.has_secret && saved.bucket && saved.public_base_url;

  async function save() {
    if (test?.result && !test.result.passed && !window.confirm('The connection test failed with these settings. Save them anyway?')) return;
    setBusy(true);
    try {
      const s = await api.saveMediaStorage(form);
      setSaved(s);
      setForm(storageForm(s));
      setTest(null);
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

  let footer = null;
  if (saved && mode === 'locked') {
    footer = (
      <>
        <GhostButton onClick={() => setMode('warning')} className="px-4 py-2 text-[13.5px] inline-flex items-center gap-2">
          <LockIcon />Edit settings…
        </GhostButton>
        <span className="text-[13px] text-parish-muted">Locked to prevent accidental changes.</span>
        {saved.updated_at && <span className="ml-auto text-[12.5px] text-parish-faint">Saved {fmtDateTime(saved.updated_at, { time: false })}</span>}
      </>
    );
  } else if (saved && editing) {
    footer = (
      <>
        <GhostButton onClick={runTest} disabled={busy || test?.running} className="px-4 py-2.5 text-[14px] disabled:opacity-60">
          {test?.running ? 'Testing…' : 'Test connection'}
        </GhostButton>
        <PrimaryButton onClick={save} disabled={busy || test?.running} className="px-[22px] py-2.5 text-[14px]">{busy ? 'Saving…' : 'Save storage settings'}</PrimaryButton>
        <button type="button" onClick={lock} disabled={busy} className={linkButton}>Cancel</button>
        {saved.updated_at && (
          <button type="button" onClick={clear} disabled={busy} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-error p-0 ml-auto">
            Remove saved settings
          </button>
        )}
      </>
    );
  }

  return (
    <IntegrationCard
      icon="photo"
      title="Photo storage"
      provider="Cloudflare R2"
      status={saved && <StatusBadge ok={complete}>{complete ? 'Set up' : 'Not set up'}</StatusBadge>}
      note={<>Where Blog Article photos are stored. The secret key is never shown again once saved. Setting up the bucket and API token: <code>docs/media-storage.md</code>.</>}
      footer={!error && footer}
    >
      {error ? (
        <div className="text-[13.5px] text-parish-error">{error}</div>
      ) : !saved ? (
        <div className="text-[13.5px] text-parish-muted">Loading…</div>
      ) : (
        <>
          {editing ? (
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
              <div className="sm:col-span-2">
                {test ? <ConnectionTest test={test} /> : (
                  <p className="m-0 text-[13px] text-parish-muted">
                    Use <strong>Test connection</strong> before saving: it uploads a tiny file with these settings, opens it through the Public URL, then deletes it.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <DetailList rows={[
              { label: 'Account ID', value: saved.account_id, mono: true },
              { label: 'Bucket', value: saved.bucket },
              { label: 'Access Key ID', value: saved.access_key_id, mono: true },
              { label: 'Secret Access Key', value: saved.has_secret ? 'Saved (hidden)' : '' },
              { label: 'Public URL', value: saved.public_base_url, copy: true },
            ]} />
          )}

          {/\.r2\.dev(\/|$)/i.test(form.publicBaseUrl.trim()) && (
            <div className="mt-3 px-3.5 py-2.5 rounded-xl bg-parish-warnTint text-parish-warnStrong text-[13px] font-medium">
              Some internet providers block r2.dev addresses, so visitors on them see broken photos. Use the website's own
              address with /media on the end (e.g. https://guadalupe-muaan.vercel.app/media, see docs/media-storage.md) or a
              custom domain; existing article photos switch over when you save.
            </div>
          )}

          {mode === 'warning' && (
            <div role="alert" className="mt-4 p-4 rounded-xl border-[1.5px] border-parish-errorBorder bg-parish-errorBg">
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
                <button type="button" onClick={() => setMode('locked')} className={linkButton}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </IntegrationCard>
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
    <IntegrationCard
      icon="mail"
      title="Email"
      provider="Parish Gmail, sent through Supabase Auth"
      status={settings && <StatusBadge ok={working}>{working ? 'Password reset working' : 'Not set up'}</StatusBadge>}
      note="The parish email staff use for sending. For now it lets staff reset a forgotten password by email; sending documents by email comes later."
    >
      {error ? <div className="text-[13.5px] text-parish-error">{error}</div> : !settings ? (
        <div className="text-[13.5px] text-parish-muted">Loading…</div>
      ) : (
        <div className="flex flex-col gap-6">
          {!migrated && (
            <div className="px-3.5 py-2.5 rounded-xl bg-parish-warnTint text-parish-warnStrong text-[13px] font-medium" role="status">
              Run the <strong>0036_email_integration.sql</strong> migration in Supabase to save these settings.
            </div>
          )}

          <CardSection
            title="Sender"
            action={!editing && (
              <GhostButton onClick={() => setEditing(true)} disabled={!migrated} className="px-3.5 py-1.5 text-[13px] disabled:opacity-50 disabled:cursor-not-allowed">
                Edit…
              </GhostButton>
            )}
          >
            {editing ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Parish email (Gmail)"><TextInput type="email" value={form.outgoingEmail} onChange={set('outgoingEmail')} placeholder="parish.office@gmail.com" autoComplete="off" spellCheck={false} /></Field>
                  <Field label="Sender name"><TextInput value={form.outgoingName} onChange={set('outgoingName')} placeholder={settings.name || 'Our Lady of Guadalupe Quasi-Parish'} autoComplete="off" /></Field>
                </div>
                <div className="flex items-center gap-4 mt-4 flex-wrap">
                  <PrimaryButton onClick={save} disabled={busy} className="px-[22px] py-2.5 text-[14px]">{busy ? 'Saving…' : 'Save email'}</PrimaryButton>
                  <button type="button" onClick={() => { setForm(emailForm(settings)); setEditing(false); }} className={linkButton}>Cancel</button>
                </div>
              </>
            ) : (
              <DetailList rows={[
                { label: 'Parish email', value: settings.outgoing_email, copy: true },
                { label: 'Sender name', value: settings.outgoing_name, empty: settings.name ? `Not set (uses “${settings.name}”)` : 'Not set' },
              ]} />
            )}
          </CardSection>

          <CardSection title="Password reset by email">
            <p className="text-[13px] text-parish-muted mt-0 mb-3">
              "Forgot password?" on the staff sign-in page emails a reset link. Send yourself a test to check it works.
            </p>
            <div className="p-3.5 rounded-xl bg-parish-field border border-parish-line">
              {test === 'asking' ? (
                <div>
                  <div className="text-[13.5px] text-parish-ink mb-2.5">A reset email was sent to <strong>{user.email}</strong>. Did it arrive (check spam too)?</div>
                  <div className="flex gap-2.5 flex-wrap">
                    <PrimaryButton onClick={() => confirm(true)} disabled={busy} className="px-4 py-2 text-[13.5px]">Yes, it arrived</PrimaryButton>
                    <GhostButton onClick={() => confirm(false)} className="px-4 py-2 text-[13.5px]">No</GhostButton>
                  </div>
                  <div className="text-[12px] text-parish-muted mt-2">You don't have to use the link; your password stays the same unless you do.</div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <PrimaryButton onClick={sendTest} disabled={test === 'sending'} className="px-4 py-2 text-[13.5px]">
                    {test === 'sending' ? 'Sending…' : working ? 'Send another test' : 'Send test reset email'}
                  </PrimaryButton>
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

            <details className="group mt-3" open={!working || test === 'failed'}>
              <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 font-semibold text-[13.5px] text-parish-blue py-1">
                <svg {...svgProps} width="14" height="14" strokeWidth="2.2" className="transition-transform group-open:rotate-90"><path d="M9 6l6 6-6 6" /></svg>
                One-time setup steps
              </summary>
              <ol className="mt-2 mb-0 pl-5 flex flex-col gap-2 text-[13.5px] text-parish-ink leading-relaxed">
                <li>On the parish Gmail, turn on <strong>2-Step Verification</strong>, then create an <strong>App Password</strong> (Google Account → Security → App passwords).</li>
                <li>
                  In Supabase: <strong>Authentication → Emails → SMTP Settings</strong>, turn on custom SMTP: host <code>smtp.gmail.com</code>, port <code>465</code>,
                  username = the Gmail address, password = the App Password, sender email and name = the ones above.
                </li>
                <li>
                  In Supabase: <strong>Authentication → URL Configuration</strong>: Site URL <code>{'https://guadalupe-muaan.vercel.app'}</code>; under Redirect URLs add
                  {' '}<code>{'https://guadalupe-muaan.vercel.app/**'}</code>{site !== 'https://guadalupe-muaan.vercel.app' && <> and <code>{`${site}/**`}</code></>}.
                </li>
                <li>Send yourself a test above. More detail in <code>docs/email-setup.md</code>.</li>
              </ol>
            </details>
          </CardSection>
        </div>
      )}
    </IntegrationCard>
  );
}

/** Platform Integrations (staff admins only): the outside services the site uses. */
function IntegrationsTab() {
  return (
    <>
      <p className="text-[13.5px] text-parish-muted mt-0 mb-4">
        The outside services the website depends on. Only staff admins see this tab.
      </p>
      <div className="grid gap-[18px] lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-[18px] min-w-0">
          <DatabaseCard />
          <PhotoStorageCard />
        </div>
        <EmailCard />
      </div>
    </>
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

/**
 * Parish Config: the parish's details (name and website address, saved
 * with the button) on the left with the privacy note; its logo and photo
 * (saved as soon as they're uploaded) on the right.
 */
function ProfileTab() {
  const toast = useToast();
  const layout = useOutletContext();
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(null); // as last loaded or saved
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    api.getSettings().then((r) => { setSettings(r.settings); setSaved(r.settings); }).catch((e) => toast.error(e.message));
  }, []);
  if (!settings) return <LoadingState label="Loading…" />;
  const hasSiteUrl = 'site_url' in settings;
  const dirty = (settings.name || '') !== (saved.name || '') || (hasSiteUrl && (settings.site_url || '') !== (saved.site_url || ''));

  function set(field, value) { setSettings((s) => ({ ...s, [field]: value })); }

  /** Keep this form and the admin sidebar (logo + parish name) in step after a save. */
  function applySaved(next) {
    // An image saved at once keeps any unsaved typing in the details.
    setSettings((s) => ({ ...next, name: s.name, ...(hasSiteUrl ? { site_url: s.site_url } : {}) }));
    setSaved(next);
    layout?.setParish?.(next);
  }

  async function save(e) {
    e?.preventDefault();
    if (!(settings.name || '').trim()) { setNameError('Enter the parish name.'); return; }
    if (hasSiteUrl) {
      try { normalizeSiteUrl(settings.site_url); } catch (err) { setUrlError(err.message); return; }
    }
    setSaving(true);
    try {
      // site_url only once the 0042 migration has added the column.
      const res = await api.updateSettings({ name: settings.name, ...(hasSiteUrl ? { site_url: settings.site_url } : {}) });
      setSettings(res.settings);
      setSaved(res.settings);
      layout?.setParish?.(res.settings);
      toast.success('Parish details saved');
    } catch (err) {
      toast.error(err.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start">
      <div className="flex flex-col gap-[18px] min-w-0">
        <form onSubmit={save}>
          <ConfigCard
            title="Parish details"
            note="Used across the admin, the website and printed household sheets."
            footer={(
              <>
                <span className={`text-[13px] ${dirty ? 'font-semibold text-[#c2410c]' : 'text-parish-muted'}`}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
                <PrimaryButton type="submit" disabled={saving || !dirty} className="ml-auto px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save details'}</PrimaryButton>
              </>
            )}
          >
            <div className="flex flex-col gap-4">
              <Field label="Parish name" required error={nameError}>
                <TextInput value={settings.name || ''} onChange={(e) => { set('name', e.target.value); setNameError(''); }} />
              </Field>
              <div>
                <Field label="Public website address" error={urlError}>
                  <TextInput
                    type="url" inputMode="url" value={settings.site_url || ''} onChange={(e) => { set('site_url', e.target.value); setUrlError(''); }}
                    placeholder={DEFAULT_SITE_URL} disabled={!hasSiteUrl} autoComplete="off" spellCheck={false}
                  />
                </Field>
                <div className="text-[12.5px] text-parish-muted mt-1.5 leading-relaxed">
                  {hasSiteUrl
                    ? <>Where the QR code and census link on printed household sheets point. Leave blank to use <span className="font-semibold text-parish-text2">{DEFAULT_SITE_URL.replace('https://', '')}</span>; change it if the parish moves to its own domain.</>
                    : <>Run the <strong>0042_public_site_url.sql</strong> migration in Supabase to set the address printed sheets point to.</>}
                </div>
              </div>
              <Link to="/admin/website?tab=office" className="flex items-center gap-3 px-4 py-3 rounded-xl border border-parish-line2 bg-parish-field no-underline hover:border-[var(--p-blue-border)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--p-blue)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-none" aria-hidden><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
                <span className="flex-1 min-w-0 text-[13.5px] text-parish-text2">Address, phone, email and office hours are kept in <span className="font-semibold text-parish-blue">Parish Website → Office &amp; Contact</span></span>
                <span className="text-parish-blue text-[18px] leading-none" aria-hidden>›</span>
              </Link>
            </div>
          </ConfigCard>
        </form>
        <MaintenanceCard settings={saved} onSaved={applySaved} />
      </div>

      <div className="flex flex-col gap-[18px] min-w-0">
        <ConfigCard title="Logo & photo" note="These save as soon as you upload or remove them.">
          <LogoSection settings={settings} onSaved={applySaved} />
          <HeroImageSection settings={settings} onSaved={applySaved} />
        </ConfigCard>
        <PrivacyCard />
      </div>
    </div>
  );
}

/**
 * Maintenance mode: when on, visitors to the public website, /register and
 * /census see a "ginaayo pa" notice (with the optional note) instead of the
 * page. Signed-in staff still see the site; the admin is never affected.
 */
function MaintenanceCard({ settings, onSaved }) {
  const toast = useToast();
  const ready = 'maintenance_mode' in settings;
  const on = !!settings.maintenance_mode;
  const [message, setMessage] = useState(settings.maintenance_message || '');
  const [busy, setBusy] = useState(false);
  const dirty = message.trim() !== (settings.maintenance_message || '');

  async function save(patch, done) {
    setBusy(true);
    try {
      const res = await api.updateSettings(patch);
      onSaved(res.settings);
      setMessage(res.settings.maintenance_message || '');
      toast.success(done);
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfigCard
      title="Maintenance mode"
      note="Closes the public website for a while, e.g. during updates. The admin keeps working."
    >
      {!ready ? (
        <div className="text-[13.5px] text-parish-muted">Run the <strong>0049_maintenance_mode.sql</strong> migration in Supabase to use maintenance mode.</div>
      ) : (
        <div className="flex flex-col gap-4">
          <label className={`flex items-center gap-3 cursor-pointer select-none ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
            <span className="relative inline-flex">
              <input
                type="checkbox" role="switch" aria-label="Maintenance mode" checked={on} disabled={busy}
                onChange={(e) => save({ maintenance_mode: e.target.checked, ...(dirty ? { maintenance_message: message } : {}) }, e.target.checked ? 'Maintenance mode is on: the website is closed to the public' : 'Maintenance mode is off: the website is open again')}
                className="peer sr-only"
              />
              <span className="w-12 h-7 rounded-full bg-parish-sunk border border-parish-border transition peer-checked:bg-[#c2410c] peer-checked:border-transparent peer-focus-visible:ring-4 peer-focus-visible:ring-parish-blue/20" />
              <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
            <span className={`font-semibold text-[14px] ${on ? 'text-[#c2410c]' : 'text-parish-text2'}`}>
              {on ? 'On: the website is closed to the public' : 'Off: the website is open'}
            </span>
          </label>
          {on && (
            <div className="px-4 py-3 rounded-xl border border-[#fdba74] bg-[#fff7ed] text-[13px] text-[#9a3412] leading-relaxed">
              Visitors see a "Ginaayo pa ang website" notice on every public page, including registration and the census. You still see the site while signed in.
            </div>
          )}
          <Field label="Note to visitors (optional)">
            <textarea
              rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="pananglitan: Mobalik ang website sa Lunes, Oktubre 12."
              className="w-full px-3.5 py-3 text-[15px] text-parish-ink bg-parish-field border-[1.5px] border-parish-borderSoft rounded-xl outline-none transition focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15 resize-y"
            />
          </Field>
          {dirty && (
            <div className="flex">
              <PrimaryButton type="button" disabled={busy} onClick={() => save({ maintenance_message: message }, 'Note saved')} className="ml-auto px-5 py-2.5 text-[14px]">
                {busy ? 'Saving…' : 'Save note'}
              </PrimaryButton>
            </div>
          )}
        </div>
      )}
    </ConfigCard>
  );
}

/**
 * Personal Settings: this account's password and this device's look. The
 * parish default theme row is here too, since it saves the theme picked
 * above (staff with full access only). Accounts without the Parish Config
 * tab see the data privacy note here.
 */
function PersonalTab({ withPrivacy }) {
  const layout = useOutletContext();
  const { user } = useAuth();
  const canEdit = can(user, 'settings');
  return (
    <div className="grid gap-[18px] lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-[18px] min-w-0">
        <Panel className="p-6">
          <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Appearance</div>
          <div className="text-[13.5px] text-parish-muted mb-4">Choose a color theme for the registration portal and admin panel. Saved on this device.</div>
          <ThemePickerGrid />
          <ParishThemeRow canEdit={canEdit} onSaved={(saved) => layout?.setParish?.(saved)} />
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-[13.5px] text-parish-text2">Admin panel</span>
            <ModeSwitch />
            <span className="text-[12.5px] text-parish-muted">Auto follows this device's light or dark setting.</span>
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-[18px] min-w-0">
        <ChangePasswordCard />
        {withPrivacy && <PrivacyCard />}
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

/**
 * Last year's household list (0041) and whether the census uses it (0048).
 * On: each GKK is measured against its names here, and the names not ticked
 * off are the families to visit. Off: the census compares with the previous
 * census in the registry instead; the names are kept but not shown.
 */
function LastYearTab({ gkk }) {
  const toast = useToast();
  const [parish, setParish] = useState(null);
  const [cycles, setCycles] = useState(null);
  const [names, setNames] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getSettings().then((r) => setParish(r.settings)).catch((e) => toast.error(e.message));
    api.listCensusCycles().then(setCycles).catch(() => setCycles([]));
    api.lastYearCounts().then((m) => setNames([...m.values()].reduce((n, c) => n + c.total, 0))).catch(() => setNames(0));
  }, []);
  if (!parish) return <LoadingState label="Loading…" />;
  const on = parish.last_year_list_enabled !== false;
  // With the list off, a census needs an earlier one in the registry to compare with.
  const latest = cycles?.[0];
  const noEarlier = cycles && cycles.length < 2;

  async function toggle(next) {
    setBusy(true);
    try {
      const res = await api.updateSettings({ last_year_list_enabled: next });
      setParish(res.settings);
      toast.success(next ? "Last year's list is in use" : 'The census now compares with the previous census');
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <Panel className="p-6">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px] max-w-[720px]">
            <div className="font-serif text-[22px] font-semibold text-parish-navy">Use last year's household list</div>
            <div className="text-[13.5px] text-parish-muted mt-1 leading-relaxed">
              How the census tracks the families who haven't registered yet. Use the list when last year's census was on paper; turn it off once the previous census was held in this registry.
            </div>
          </div>
          <label className={`flex items-center gap-3 cursor-pointer select-none ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
            <span className="font-semibold text-[14px] text-parish-text2">{on ? 'On' : 'Off'}</span>
            <span className="relative inline-flex">
              <input type="checkbox" role="switch" aria-label="Use last year's household list" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} className="peer sr-only" />
              <span className="w-12 h-7 rounded-full bg-parish-sunk border border-parish-border transition peer-checked:bg-parish-fill peer-checked:border-transparent peer-focus-visible:ring-4 peer-focus-visible:ring-parish-blue/20" />
              <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>

        <div className="grid gap-3 mt-5 sm:grid-cols-2">
          <div className={`rounded-xl border px-4 py-3.5 ${on ? 'border-[var(--p-blue-border)] bg-[var(--p-blue-tint)]' : 'border-parish-line2 bg-parish-field opacity-75'}`}>
            <div className="font-semibold text-[14px] text-parish-navy mb-1">{on && '✓ '}On: last year's list</div>
            <div className="text-[13px] text-parish-text2 leading-relaxed">Each GKK is measured against its names below (or the household count in Parish GKK when it has none). The list comes first: a count that doesn't match a GKK's names is cleared. Tick families off as they register; the names left are printed for house visits.</div>
          </div>
          <div className={`rounded-xl border px-4 py-3.5 ${!on ? 'border-[var(--p-blue-border)] bg-[var(--p-blue-tint)]' : 'border-parish-line2 bg-parish-field opacity-75'}`}>
            <div className="font-semibold text-[14px] text-parish-navy mb-1">{!on && '✓ '}Off: the previous census</div>
            <div className="text-[13px] text-parish-text2 leading-relaxed">Each GKK is measured against the households that took part in the previous census here (until there is one, against the household count in Parish GKK). Those not registered yet are listed under Census → Results by GKK, to print or export.</div>
          </div>
        </div>
        {!on && noEarlier && (
          <div className="mt-4 px-4 py-3 rounded-xl border border-[#fdba74] bg-[#fff7ed] text-[13.5px] text-[#9a3412]">
            {latest ? <>The {latest.label} is the only census in the registry, so there's nothing earlier to compare it with.</> : <>No census has been held in the registry yet.</>}{' '}
            Until there is, each GKK is measured against its households last year set in Parish GKK, which gives how many haven't registered but not their names. Turn the list back on if last year's census was on paper.
          </div>
        )}
      </Panel>

      {on ? (
        <Panel className="p-6">
          <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Last year's household list</div>
          <div className="text-[13.5px] text-parish-muted mb-4">
            The names from the previous paper census: each household head, their purok and a note. Choose a GKK, then type or paste its names, or upload a spreadsheet. The same list is on the Census page, where families are ticked off as they register.
          </div>
          <LastYearList key={gkk} initialGkk={gkk} parish={parish} canEdit canManage />
        </Panel>
      ) : (
        <Panel className="p-6 text-[13.5px] text-parish-muted">
          {names ? <>The list's {names} name(s) are kept but not used or shown. Turn the list back on to see them.</> : <>The list is off. Turn it on to type or upload last year's names.</>}
        </Panel>
      )}
    </div>
  );
}

const CONFIG_TABS = [['mygkk', 'My GKK'], ['config', 'Parish Config'], ['gkk', 'Parish GKK'], ['lastyear', "Last year's list"], ['personal', 'Personal Settings'], ['integrations', 'Platform Integrations']];

export default function ParishConfig() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  // My GKK for GKK leaders; the parish profile and GKKs for staff who may
  // change settings; Personal Settings for everyone; integrations for staff
  // admins only.
  const leader = user?.access === 'gkk_leader';
  const show = { mygkk: leader, config: can(user, 'settings'), gkk: can(user, 'settings'), lastyear: can(user, 'settings'), personal: true, integrations: !!user?.isAdmin };
  const tabs = CONFIG_TABS.filter(([k]) => show[k]);
  // GKK leaders see this page as "GKK Config", and accounts with only their
  // own settings as "My Account" (as in the sidebar).
  const ownOnly = ownSettingsOnly(user);
  const title = leader ? 'GKK Config' : ownOnly ? 'My Account' : 'Parish Config';
  const subtitle = leader ? 'Your GKK and your personal settings' : ownOnly ? 'Your personal settings' : 'Profile, privacy, GKK settings & integrations';
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : tabs[0][0];
  const setTab = (k) => setParams(k === tabs[0][0] ? {} : { tab: k }, { replace: true });

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        <div className="max-w-[1180px]">
          {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
          {tab === 'mygkk' && <MyGkk />}
          {tab === 'config' && <ProfileTab />}
          {tab === 'personal' && <PersonalTab withPrivacy={!show.config} />}
          {tab === 'gkk' && (
            <GkkManager
              onOpenList={(name) => setParams({ tab: 'lastyear', gkk: name }, { replace: true })}
              historyOf={params.get('history') || ''}
              onHistoryOpened={() => setParams({ tab: 'gkk' }, { replace: true })}
            />
          )}
          {tab === 'lastyear' && <LastYearTab gkk={params.get('gkk') || ''} />}
          {tab === 'integrations' && <IntegrationsTab />}
        </div>
      </PageBody>
    </>
  );
}
