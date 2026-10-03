import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, Panel, EmptyState, LoadingState } from '../../components/admin.jsx';
import { PrimaryButton, GhostButton, Checkbox } from '../../components/ui.jsx';
import { NotificationRow } from '../../components/NotificationBell.jsx';
import { useToast } from '../../ToastContext.jsx';
import { DEFAULT_PUSH_LEVEL, PUSH_LEVELS, timeAgo } from '../../lib/notifications.js';
import { browserPushSupport, currentSubscription, enablePush, disablePush } from '../../lib/push.js';

function Section({ title, subtitle, children }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="m-0 font-serif text-[21px] font-semibold text-parish-navy">{title}</h2>
      {subtitle && <p className="mt-1 mb-0 text-[14px] text-parish-muted leading-relaxed">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

function Note({ tone = 'info', children }) {
  const cls = tone === 'warn'
    ? 'bg-parish-warnBg border-parish-warnBorder text-parish-warnStrong'
    : 'bg-[var(--p-blue-tint)] border-parish-infoBorder text-parish-text2';
  return <div className={`rounded-xl border px-4 py-3 text-[14px] leading-relaxed ${cls}`}>{children}</div>;
}

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });

/** Settings → Notifications: phone notifications for this account, and the latest notifications. */
export default function Notifications() {
  const { bell } = useOutletContext() || {};
  const toast = useToast();
  const support = browserPushSupport();
  const [sub, setSub] = useState(undefined); // undefined while checking
  const [busy, setBusy] = useState('');
  const [devices, setDevices] = useState(null);
  const [prefs, setPrefs] = useState(null);

  const loadDevices = () => api.listMyPushDevices().then(setDevices).catch(() => setDevices([]));

  useEffect(() => {
    currentSubscription().then(setSub).catch(() => setSub(null));
    loadDevices();
    const defaults = { seen_at: null, push_level: DEFAULT_PUSH_LEVEL, digest: true };
    api.listNotifications(1).then((r) => setPrefs(r?.prefs || defaults)).catch(() => setPrefs(defaults));
  }, []);

  async function run(what, fn) {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  }

  const turnOn = () => run('on', async () => {
    const s = await enablePush();
    setSub(s);
    await loadDevices();
    await api.sendTestPush(s.endpoint);
    toast.success('Notifications are on for this device. A test is on its way.');
  });

  const turnOff = () => run('off', async () => {
    await disablePush();
    setSub(null);
    await loadDevices();
    toast.success('This device will no longer get notifications.');
  });

  const sendTest = () => run('test', async () => {
    const r = await api.sendTestPush(sub?.endpoint);
    if (r.sent) toast.success('Test sent. It should show up in a few seconds.');
    else toast.error('The test could not be delivered. Turn notifications off and on again on this device.');
  });

  const removeDevice = (d) => run(`rm-${d.id}`, async () => {
    await api.removePushDevice({ id: d.id });
    if (sub?.endpoint === d.endpoint) { await sub.unsubscribe().catch(() => {}); setSub(null); }
    await loadDevices();
  });

  async function savePrefs(patch) {
    const before = prefs;
    setPrefs({ ...prefs, ...patch });
    try {
      await api.saveNotifyPrefs(patch);
      toast.success('Saved');
    } catch (e) {
      setPrefs(before);
      toast.error(e.message);
    }
  }

  if (bell && !bell.available) {
    return (
      <>
        <PageHeader title="Notifications" />
        <PageBody>
          <EmptyState title="Not set up yet" subtitle="Run the 0034_staff_notifications.sql migration in Supabase to get notified of new requests (see docs/notifications.md)." />
        </PageBody>
      </>
    );
  }

  const now = new Date();

  return (
    <>
      <PageHeader title="Notifications" subtitle="Know as soon as someone sends a request from the website" />
      <PageBody>
        <div className="max-w-[760px] flex flex-col gap-5">
          <Section
            title="This device"
            subtitle="Get a notification on this phone or computer when a request comes in, even when the admin panel is closed."
          >
            {support === 'ios-install' && (
              <Note tone="warn">
                <b>On iPhone and iPad, add the admin panel to your Home Screen first.</b> In Safari, tap the Share button
                {' '}<span aria-hidden>⬆</span>, then <b>Add to Home Screen</b>. Open <b>Parish Admin</b> from your Home Screen,
                sign in, and come back to Settings → Notifications to turn them on.
              </Note>
            )}
            {support === 'unsupported' && (
              <Note tone="warn">
                This browser can’t show notifications. Use Chrome or Edge on Android or a computer, or Safari on an iPhone
                (from the Home Screen).
              </Note>
            )}
            {support === 'denied' && (
              <Note tone="warn">
                Notifications are blocked for this site. Open the browser’s site settings (the icon left of the address),
                allow Notifications, then reload this page.
              </Note>
            )}
            {support === 'ok' && sub === undefined && <div className="text-[14px] text-parish-muted">Checking…</div>}
            {support === 'ok' && sub === null && (
              <div className="flex flex-wrap items-center gap-3">
                <PrimaryButton onClick={turnOn} disabled={!!busy} className="px-5 py-3 text-[15px]">
                  {busy === 'on' ? 'Turning on…' : 'Turn on notifications on this device'}
                </PrimaryButton>
                <span className="text-[13px] text-parish-muted">The browser will ask you to allow them.</span>
              </div>
            )}
            {support === 'ok' && sub && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 font-semibold text-parish-ok text-[15px]">
                  <span className="w-2.5 h-2.5 rounded-full bg-parish-ok" aria-hidden /> On for this device
                </span>
                <span className="flex-1" />
                <GhostButton onClick={sendTest} disabled={!!busy} className="px-4 py-2.5 text-[14px]">
                  {busy === 'test' ? 'Sending…' : 'Send a test'}
                </GhostButton>
                <GhostButton onClick={turnOff} disabled={!!busy} className="px-4 py-2.5 text-[14px]">
                  {busy === 'off' ? 'Turning off…' : 'Turn off'}
                </GhostButton>
              </div>
            )}
          </Section>

          <Section title="What to send to my devices" subtitle="For every phone and computer you turned notifications on for.">
            {!prefs ? <LoadingState label="Loading your notification choices…" compact /> : (
              <>
                <fieldset className="border-0 p-0 m-0 flex flex-col gap-2.5">
                  <legend className="sr-only">New requests</legend>
                  {PUSH_LEVELS.map((l) => (
                    <label key={l.key} className={`flex gap-3 items-start rounded-xl border-[1.5px] px-4 py-3 cursor-pointer transition ${prefs.push_level === l.key ? 'border-parish-blue bg-[var(--p-blue-tint)]' : 'border-parish-borderSoft hover:bg-parish-hover'}`}>
                      <input
                        type="radio" name="push_level" value={l.key}
                        checked={prefs.push_level === l.key}
                        onChange={() => savePrefs({ push_level: l.key })}
                        className="mt-1 w-[17px] h-[17px] accent-parish-blue"
                      />
                      <span>
                        <span className="block font-bold text-[15px] text-parish-ink">{l.label}</span>
                        <span className="block text-[13.5px] text-parish-muted leading-snug mt-0.5">{l.note}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <label className="flex gap-3 items-start mt-4 cursor-pointer">
                  <Checkbox checked={!!prefs.digest} onChange={(e) => savePrefs({ digest: e.target.checked })} className="mt-0.5" />
                  <span>
                    <span className="block font-bold text-[15px] text-parish-ink">Morning summary at 7:00 AM</span>
                    <span className="block text-[13.5px] text-parish-muted leading-snug mt-0.5">
                      What is still waiting: requests, households to verify and census updates, and how many have waited over 3 days. Not sent when nothing is waiting.
                    </span>
                  </span>
                </label>
              </>
            )}
          </Section>

          <Section title="My devices" subtitle="Where this account gets notifications. Remove a phone you no longer use.">
            {devices === null && <LoadingState label="Loading your devices…" compact />}
            {devices && !devices.length && <div className="text-[14px] text-parish-muted">None yet.</div>}
            {!!devices?.length && (
              <ul className="list-none m-0 p-0 divide-y divide-parish-line border border-parish-line rounded-xl">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[14.5px] text-parish-ink">
                        {d.device || 'Device'}
                        {sub?.endpoint === d.endpoint && <span className="ml-2 text-[12px] font-bold text-parish-ok">This device</span>}
                      </span>
                      <span className="block text-[12.5px] text-parish-muted">
                        Added {shortDate(d.created_at)}{d.last_ok_at ? ` · Last notified ${timeAgo(d.last_ok_at, now).toLowerCase()}` : ''}
                      </span>
                    </span>
                    <GhostButton onClick={() => removeDevice(d)} disabled={!!busy} className="px-3 py-1.5 text-[13px]">
                      {busy === `rm-${d.id}` ? 'Removing…' : 'Remove'}
                    </GhostButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Latest" subtitle="The same list as the bell: the newest 30 that your account can see.">
            {!bell?.items?.length ? (
              <div className="text-[14px] text-parish-muted">Nothing yet. Requests from the website will show up here as they come in.</div>
            ) : (
              <div className="divide-y divide-parish-line border border-parish-line rounded-xl overflow-hidden">
                {bell.items.map((n) => <NotificationRow key={n.id} n={n} now={now} unread={false} />)}
              </div>
            )}
          </Section>
        </div>
      </PageBody>
    </>
  );
}
