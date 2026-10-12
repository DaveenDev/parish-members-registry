import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { Modal, Panel } from './admin.jsx';
import { Badge, Checkbox, PrimaryButton } from './ui.jsx';
import { localDay, markStep, popupDue, setupSaved, setupSteps, stepsLeft } from '../lib/setup.js';

/**
 * The setup checklist for this account (lib/setup.js), from the parish
 * settings (`settings`, the admin layout's `parish`) and the GKK, Mass and
 * sacrament counts. `ready` once the counts are in, so a step never shows
 * as still to do while they load. Marks and "Don't show again" save to the
 * account at once.
 */
function useSetupChecklist(settings) {
  const { user } = useAuth();
  const toast = useToast();
  const [counts, setCounts] = useState(undefined);
  // A change waiting for the account to be re-read with it.
  const [pending, setPending] = useState(null);
  const fromAccount = JSON.stringify(user?.setupChecklist || null);
  useEffect(() => { setPending(null); }, [fromAccount]);
  useEffect(() => {
    let live = true;
    api.setupCounts().then((c) => live && setCounts(c)).catch(() => live && setCounts(null));
    return () => { live = false; };
  }, []);

  const saved = pending || setupSaved(user?.setupChecklist);
  const steps = setupSteps({ user, settings, counts, saved });

  async function save(next) {
    setPending(next);
    try {
      await api.saveSetupChecklist(next);
    } catch (e) {
      setPending(null);
      toast.error(e.message || 'Could not save the checklist');
    }
  }

  return {
    user, steps, saved,
    ready: !!user && !!settings && counts !== undefined,
    mark: (key, done) => save(markStep(saved, key, done)),
    setHide: (hide) => save({ ...saved, hide }),
  };
}

function Progress({ steps }) {
  const done = steps.length - stepsLeft(steps);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-parish-sunk overflow-hidden" role="progressbar" aria-label="Setup done" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <div className="h-full rounded-full bg-parish-blue transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <span className="text-[13px] font-semibold text-parish-text2 whitespace-nowrap">{done} of {steps.length} done</span>
    </div>
  );
}

/** The steps, each with where to set it and, until the parish has it, a "Mark done" box. */
function StepList({ steps, onMark, onOpen }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col divide-y divide-parish-line2 border border-parish-line2 rounded-xl overflow-hidden">
      {steps.map((s) => (
        <li key={s.key} className={`flex gap-3 items-start px-4 py-3 ${s.doneBy ? 'bg-parish-card' : 'bg-parish-surface'}`}>
          <span
            aria-hidden
            className={`mt-0.5 w-[22px] h-[22px] flex-none rounded-full flex items-center justify-center text-[13px] font-bold ${s.doneBy ? 'bg-parish-ok text-white' : 'border-2 border-parish-border'}`}
          >
            {s.doneBy ? '✓' : ''}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link to={s.to} onClick={onOpen} className={`font-semibold text-[14.5px] no-underline hover:underline ${s.doneBy ? 'text-parish-muted' : 'text-parish-navy'}`}>{s.label}</Link>
              {s.doneBy === 'parish' && <Badge tone="green">Done</Badge>}
            </div>
            <div className="text-[13px] text-parish-muted mt-0.5 leading-snug">{s.note}</div>
          </div>
          {s.doneBy !== 'parish' && (
            <label className="flex items-center gap-2 flex-none mt-0.5 cursor-pointer text-[13px] font-semibold text-parish-text2 select-none">
              <Checkbox checked={s.doneBy === 'you'} onChange={(e) => onMark(s.key, e.target.checked)} aria-label={`Mark "${s.label}" done`} />
              <span className="hidden sm:inline">Mark done</span>
            </label>
          )}
        </li>
      ))}
    </ul>
  );
}

const INTRO = 'Each step ticks itself off once it\'s set. If one doesn\'t apply to the parish, mark it done.';

/**
 * At the top of Parish Config while any step is still to do, whether or not
 * the pop-up was turned off; gone once every step is done.
 */
export function SetupChecklistCard({ settings }) {
  const { steps, saved, ready, mark, setHide } = useSetupChecklist(settings);
  if (!ready || !stepsLeft(steps)) return null;
  return (
    <Panel className="p-6 mb-[18px] border-[var(--p-blue-border)]">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <div className="font-serif text-[22px] font-semibold text-parish-navy">Setup checklist</div>
          <div className="text-[13.5px] text-parish-muted mt-1">{stepsLeft(steps)} parish {stepsLeft(steps) === 1 ? 'setting' : 'settings'} still to fill in. {INTRO}</div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-[13px] font-semibold text-parish-text2 select-none mt-1">
          <Checkbox checked={!saved.hide} onChange={(e) => setHide(!e.target.checked)} />
          Remind me once a day
        </label>
      </div>
      <div className="mt-4 mb-4"><Progress steps={steps} /></div>
      <StepList steps={steps} onMark={mark} />
    </Panel>
  );
}

const shownKey = (user) => `pmr_setup_shown:${user.id}`;
function lastShown(user) {
  try { return localStorage.getItem(shownKey(user)) || ''; } catch { return ''; }
}
function rememberShown(user, day) {
  try { localStorage.setItem(shownKey(user), day); } catch { /* shows again on the next load */ }
}

/**
 * The checklist as a pop-up, once a day (on this device) while any step is
 * still to do, until the person ticks "Don't show this again". In the admin
 * layout, so it opens on whichever page they land on.
 */
export function SetupChecklistPopup({ settings }) {
  const { user, steps, saved, ready, mark, setHide } = useSetupChecklist(settings);
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);
  const due = ready && popupDue({ steps, saved, lastShown: lastShown(user), today: localDay() });
  useEffect(() => {
    if (!due) return;
    rememberShown(user, localDay());
    setOpen(true);
  }, [due]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const close = () => {
    setOpen(false);
    if (dontShow) setHide(true);
  };
  const first = (user?.name || '').split(' ')[0];
  const left = stepsLeft(steps);
  return (
    <Modal title="Set up the parish" onClose={close} maxWidth={600}>
      <p className="m-0 mb-4 text-[14px] text-parish-text2 leading-relaxed">
        {first ? `Welcome, ${first}! ` : ''}
        {left ? `${left} parish ${left === 1 ? 'setting is' : 'settings are'} still to fill in. ` : 'Everything is set up. '}
        {INTRO} This list also stays at the top of <Link to="/admin/settings" onClick={close} className="font-semibold text-parish-blue">Parish Config</Link> until it's done.
      </p>
      <div className="mb-4"><Progress steps={steps} /></div>
      <StepList steps={steps} onMark={mark} onOpen={close} />
      <div className="flex items-center gap-3 flex-wrap mt-5">
        <label className="flex items-center gap-2 cursor-pointer text-[13.5px] font-semibold text-parish-text2 select-none">
          <Checkbox checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Don't show this again
        </label>
        <PrimaryButton type="button" onClick={close} className="ml-auto px-6 py-2.5 text-[14px]">{left ? 'Later' : 'Close'}</PrimaryButton>
      </div>
    </Modal>
  );
}
