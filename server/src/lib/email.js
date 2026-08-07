import { pool } from '../db/pool.js';
import { decrypt } from './crypto.js';

/**
 * Outbound email.
 *
 * Deliberately an HTTP API rather than SMTP: Render's free web services block
 * outbound traffic to ports 25/465/587, so nodemailer against smtp.gmail.com
 * connect-times-out there no matter how the credentials are set. Providers
 * here speak HTTPS on 443 and are unaffected.
 *
 * The parish's own Gmail address is still what recipients see — it is
 * registered with the provider as a verified sender, which needs no domain.
 */

class EmailNotConfigured extends Error {
  constructor(message) {
    super(message);
    this.status = 503;
    this.code = 'EMAIL_NOT_CONFIGURED';
  }
}

/** Reads the single settings row, decrypting the API key. */
export async function loadEmailSettings() {
  const { rows } = await pool.query('SELECT * FROM email_settings WHERE id = 1');
  const row = rows[0] || null;
  if (!row) return null;
  return { ...row, apiKey: decrypt(row.api_key_enc) };
}

/** What the admin UI is allowed to see — everything except the credential. */
export function publicEmailSettings(settings) {
  if (!settings) {
    return { provider: 'brevo', senderEmail: '', senderName: '', replyTo: '', enabled: false, hasApiKey: false };
  }
  return {
    provider: settings.provider,
    senderEmail: settings.sender_email,
    senderName: settings.sender_name,
    replyTo: settings.reply_to,
    enabled: settings.enabled,
    hasApiKey: Boolean(settings.apiKey),
    updatedAt: settings.updated_at,
  };
}

/**
 * Why sending would fail right now, or null if it would work. Lets the UI say
 * what is missing before anyone relies on a reset email arriving.
 */
export function describeEmailGap(settings) {
  if (!settings || !settings.enabled) return 'Email sending is turned off';
  if (!settings.apiKey) {
    return settings.api_key_enc
      ? 'The stored API key could not be read — re-enter it (this happens if JWT_SECRET was rotated)'
      : 'No API key has been set';
  }
  if (!settings.sender_email) return 'No sender address has been set';
  return null;
}

const PROVIDERS = {
  /** https://developers.brevo.com/reference/sendtransacemail */
  brevo: {
    label: 'Brevo',
    async send({ apiKey, from, to, subject, text, html }) {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: from.email, name: from.name || undefined },
          replyTo: from.replyTo ? { email: from.replyTo } : undefined,
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Brevo rejected the message (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      return res.json().catch(() => ({}));
    },
  },

  /** https://resend.com/docs/api-reference/emails/send-email — needs a verified domain. */
  resend: {
    label: 'Resend',
    async send({ apiKey, from, to, subject, text, html }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: from.name ? `${from.name} <${from.email}>` : from.email,
          reply_to: from.replyTo || undefined,
          to: [to],
          subject,
          text,
          html,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Resend rejected the message (HTTP ${res.status}): ${detail.slice(0, 300)}`);
      }
      return res.json().catch(() => ({}));
    },
  },
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

/**
 * Send one message using whatever the parish has configured. Throws
 * EmailNotConfigured (503) when setup is incomplete, so callers can tell
 * "nobody set this up" apart from "the provider refused it".
 */
export async function sendEmail({ to, subject, text, html }) {
  const settings = await loadEmailSettings();
  const gap = describeEmailGap(settings);
  if (gap) throw new EmailNotConfigured(gap);

  const provider = PROVIDERS[settings.provider];
  if (!provider) throw new EmailNotConfigured(`Unknown email provider "${settings.provider}"`);

  return provider.send({
    apiKey: settings.apiKey,
    from: {
      email: settings.sender_email,
      name: settings.sender_name,
      replyTo: settings.reply_to,
    },
    to,
    subject,
    text,
    html,
  });
}

export { EmailNotConfigured };
