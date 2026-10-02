import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, Tabs, Panel } from '../../components/admin.jsx';
import { ManageListCard } from '../../components/ManageList.jsx';
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

  return (
    <div className="flex flex-col gap-[18px]">
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

      <ChangePasswordCard />

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
      <Panel className="p-6">
        <div className="font-serif text-[22px] font-semibold text-parish-navy mb-3.5">Data &amp; privacy</div>
        <div className="flex gap-2.5 items-start text-[13.5px] text-parish-text2 leading-relaxed">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--p-blue)" strokeWidth="1.7" className="flex-none mt-px"><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          <span>Member information is confidential and accessible only to authorized parish staff. All exports and printed sheets should be handled in accordance with the Data Privacy Act of 2012.</span>
        </div>
      </Panel>
    </div>
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

const THIS_YEAR = new Date().getFullYear();

/** Each GKK's chapel address and year established, shown and searched in the website's GKK directory. */
function GkkChapelCard() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null); // { id, chapel_address, year_established }
  const [saving, setSaving] = useState(false);

  const load = () => api.listGkkDetails().then((r) => setRows(r.rows)).catch((e) => toast.error(e.message));
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    const year = String(editing.year_established ?? '').trim();
    if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1500 && Number(year) <= THIS_YEAR)) {
      toast.error(`Enter the year as four digits, up to ${THIS_YEAR}.`);
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveGkkDetails(editing.id, { chapel_address: editing.chapel_address || '', year_established: year ? Number(year) : null });
      setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));
      setEditing(null);
      toast.success('GKK chapel details saved');
    } catch (err) {
      toast.error(err.message || 'Could not save the chapel details');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="p-6 mt-[18px]">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">GKK chapels</div>
      <div className="text-[13.5px] text-parish-muted mb-4">The chapel address and the year each GKK was established. Both show in the website's GKK directory, and visitors can search by the address.</div>
      {!rows ? (
        <div className="text-[13.5px] text-parish-muted">Loading…</div>
      ) : !rows.length ? (
        <div className="text-[13.5px] text-parish-muted">Add a GKK above first.</div>
      ) : (
        <ul className="list-none m-0 p-0 border border-parish-line rounded-xl overflow-hidden">
          {rows.map((g) => (
            <li key={g.id} className="border-t border-parish-line first:border-t-0 px-4 py-3">
              {editing?.id === g.id ? (
                <form onSubmit={save} className="flex flex-col gap-3">
                  <div className="font-semibold text-[14.5px] text-parish-navy">{g.name}</div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                    <Field label="Chapel address">
                      <TextInput autoFocus value={editing.chapel_address || ''} placeholder="e.g. Purok 3, Brgy. San Isidro" onChange={(e) => setEditing((x) => ({ ...x, chapel_address: e.target.value }))} />
                    </Field>
                    <Field label="Year established">
                      <TextInput inputMode="numeric" maxLength={4} value={editing.year_established ?? ''} placeholder="e.g. 1985" onChange={(e) => setEditing((x) => ({ ...x, year_established: e.target.value.replace(/\D/g, '') }))} />
                    </Field>
                  </div>
                  <div className="flex items-center gap-3">
                    <PrimaryButton type="submit" disabled={saving} className="px-5 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save'}</PrimaryButton>
                    <button type="button" onClick={() => setEditing(null)} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13.5px] text-parish-text2">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14.5px] text-parish-navy">{g.name}</div>
                    <div className="text-[13px] text-parish-text2">
                      {[g.chapel_address, g.year_established && `Est. ${g.year_established}`].filter(Boolean).join(' · ') || <span className="text-parish-faint">No chapel details yet</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => setEditing({ id: g.id, chapel_address: g.chapel_address, year_established: g.year_established })} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-[var(--p-blue-tint)] font-semibold text-[12.5px] text-parish-blue">
                    Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const CONFIG_TABS =[['config', 'Parish Config'], ['gkk', 'Parish GKK']];

export default function ParishConfig() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const tabs = can(user, 'settings') ? CONFIG_TABS : CONFIG_TABS.slice(0, 1);
  const tab = tabs.some(([k]) => k === params.get('tab')) ? params.get('tab') : tabs[0][0];
  const setTab = (k) => setParams(k === CONFIG_TABS[0][0] ? {} : { tab: k }, { replace: true });
  // Adding, renaming or deleting a GKK reloads the chapel list below it.
  const [gkkVersion, setGkkVersion] = useState(0);
  const reloadChapels = (fn) => async (...args) => { const res = await fn(...args); setGkkVersion((v) => v + 1); return res; };

  return (
    <>
      <PageHeader title="Parish Config" subtitle="Profile, privacy & GKK settings" />
      <PageBody>
        <div className="max-w-[720px]">
          {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
          {tab === 'config' && <ProfileTab />}
          {tab === 'gkk' && (
            <ManageListCard
              heading="Basic Ecclesial Communities (GKK)"
              description="Add, rename, or remove the parish's GKKs. A GKK currently assigned to a household cannot be deleted."
              itemNoun="GKK" placeholder="New GKK name (e.g. GKK San Pedro Calungsod)"
              listFn={api.listGkks} addFn={reloadChapels(api.addGkk)} renameFn={reloadChapels(api.renameGkk)} deleteFn={reloadChapels(api.deleteGkk)}
              lockInUse countLabel={(n) => `${n} household(s)`} lockedHint="Move them to another GKK first."
            />
          )}
          {tab === 'gkk' && <GkkChapelCard key={gkkVersion} />}
        </div>
      </PageBody>
    </>
  );
}
