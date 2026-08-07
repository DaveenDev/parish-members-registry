import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput, Select, Checkbox, PrimaryButton, GhostButton } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';

const PROVIDER_LABELS = {
  brevo: 'Brevo — verified sender, no domain needed',
  resend: 'Resend — requires a verified domain',
};

const BLANK = { provider: 'brevo', senderEmail: '', senderName: '', replyTo: '', enabled: false, hasApiKey: false };

/**
 * Outbound email configuration. The API key is write-only: the server never
 * returns it, so an empty field means "leave what is stored alone" rather than
 * "clear it" — hence the explicit Remove button.
 */
export default function EmailSettingsCard() {
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [problem, setProblem] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .getEmailSettings()
      .then((res) => {
        setForm({ ...BLANK, ...res.settings });
        setProblem(res.problem);
      })
      .catch(() => setError('Could not load the email settings'))
      .finally(() => setLoaded(true));
  }, []);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
    setError('');
  };

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const patch = {
        provider: form.provider,
        senderEmail: form.senderEmail,
        senderName: form.senderName,
        replyTo: form.replyTo,
        enabled: form.enabled,
      };
      // Only send the key when the admin actually typed one.
      if (apiKey.trim()) patch.apiKey = apiKey.trim();

      const res = await api.updateEmailSettings(patch);
      setForm({ ...BLANK, ...res.settings });
      setProblem(res.problem);
      setApiKey('');
      toast.success('Email settings saved');
    } catch (err) {
      setError(err.message || 'Could not save the email settings');
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    setSaving(true);
    try {
      const res = await api.updateEmailSettings({ apiKey: '' });
      setForm({ ...BLANK, ...res.settings });
      setProblem(res.problem);
      toast.success('API key removed');
    } catch (err) {
      setError(err.message || 'Could not remove the API key');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError('');
    try {
      const res = await api.sendTestEmail();
      toast.success(`Test email sent to ${res.sentTo}`);
    } catch (err) {
      setError(err.message || 'Could not send the test email');
    } finally {
      setTesting(false);
    }
  }

  if (!loaded) return null;

  return (
    <form onSubmit={save} className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">Email sending</div>
      <div className="text-[13.5px] text-parish-muted mb-4">
        Used to send password reset links to staff. Emails go out through a sending service over HTTPS, with the
        parish's own address as the sender — free hosting blocks direct SMTP, so a Gmail password will not work here.
      </div>

      {problem && (
        <div className="mb-4 px-3.5 py-3 bg-[#fdf3e3] border border-[#e8d3a8] rounded-xl text-[13px] text-[#7a5b12] leading-relaxed">
          <strong>Password reset emails are not being sent.</strong> {problem}.
        </div>
      )}
      {error && <div className="mb-3 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
        <Field label="Sending service">
          <Select value={form.provider} onChange={set('provider')}>
            {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label={form.hasApiKey ? 'API key (stored — type to replace)' : 'API key'}>
          <TextInput
            type="password"
            autoComplete="off"
            placeholder={form.hasApiKey ? '••••••••••••••••' : 'Paste the key from your provider'}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setError(''); }}
          />
        </Field>
        <Field label="Sender address">
          <TextInput type="email" placeholder="parish@gmail.com" value={form.senderEmail} onChange={set('senderEmail')} />
        </Field>
        <Field label="Sender name">
          <TextInput placeholder="Our Lady of Guadalupe" value={form.senderName} onChange={set('senderName')} />
        </Field>
        <Field label="Reply-to (optional)">
          <TextInput type="email" value={form.replyTo} onChange={set('replyTo')} />
        </Field>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-[13.5px] text-parish-text2 mt-4">
        <Checkbox checked={form.enabled} onChange={set('enabled')} className="w-4 h-4" />
        Send password reset emails
      </label>

      <div className="text-[12.5px] text-parish-muted mt-3 leading-relaxed">
        The sender address must be verified with your provider first, or messages will be rejected. Verifying a single
        address takes a minute and does not require owning a domain.
      </div>

      <div className="flex flex-wrap gap-2.5 mt-5">
        <PrimaryButton type="submit" disabled={saving} className="px-[26px] py-3 text-[14.5px]">
          {saving ? 'Saving…' : 'Save email settings'}
        </PrimaryButton>
        <GhostButton type="button" onClick={sendTest} disabled={testing || Boolean(problem)} className="px-[22px] py-3 text-[14.5px]">
          {testing ? 'Sending…' : 'Send test email'}
        </GhostButton>
        {form.hasApiKey && (
          <GhostButton type="button" onClick={removeKey} disabled={saving} className="px-[22px] py-3 text-[14.5px]">
            Remove key
          </GhostButton>
        )}
      </div>
    </form>
  );
}
