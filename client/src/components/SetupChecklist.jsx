import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { Panel } from './admin.jsx';
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

/**
 * The steps, each with where to set it and, until the parish has it, a
 * "Mark done" box. `compact` (the floating pop-up) leaves the notes out.
 */
function StepList({ steps, onMark, onOpen, compact = false }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col divide-y divide-parish-line2 border border-parish-line2 rounded-xl overflow-hidden">
      {steps.map((s) => (
        <li key={s.key} title={compact ? s.note : undefined} className={`flex gap-3 items-start ${compact ? 'px-3.5 py-2.5' : 'px-4 py-3'} ${s.doneBy ? 'bg-parish-card' : 'bg-parish-surface'}`}>
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
            {!compact && <div className="text-[13px] text-parish-muted mt-0.5 leading-snug">{s.note}</div>}
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
 * still to do, until the person ticks "Don't show this again". A card
 * floating in the corner, not a dialog: the page stays usable around it.
 * Going to a step folds it into a small button, so it's at hand while they
 * fill that setting in. In the admin layout, so it opens on whichever page
 * they land on.
 */
export function SetupChecklistPopup({ settings }) {
  const { user, steps, saved, ready, mark, setHide } = useSetupChecklist(settings);
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(false);
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
  const done = steps.length - left;
  // Under page dialogs (z-50), the mobile menu and toasts.
  const corner = 'fixed z-40 right-3 bottom-3 sm:right-5 sm:bottom-5 animate-fadeUp';
  const iconButton = 'appearance-none border-none bg-transparent cursor-pointer text-parish-muted leading-none hover:text-parish-ink';

  if (folded) {
    return (
      <div className={`${corner} flex items-center bg-parish-surface border border-[var(--p-blue-border)] rounded-full shadow-card`}>
        <button
          type="button" onClick={() => setFolded(false)} aria-label="Open the setup checklist"
          className="appearance-none border-none bg-transparent cursor-pointer flex items-center gap-2.5 pl-4 pr-1.5 py-2.5 font-semibold text-[13.5px] text-parish-navy"
        >
          <span className="w-2 h-2 rounded-full bg-parish-blue" aria-hidden />
          Set up the parish
          <span className="font-medium text-parish-muted">{done} of {steps.length}</span>
        </button>
        <button type="button" onClick={close} aria-label="Close the setup checklist" title="Close" className={`${iconButton} text-[20px] px-3 py-2`}>×</button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Set up the parish"
      className={`${corner} w-[calc(100vw-1.5rem)] sm:w-[420px] max-h-[75dvh] sm:max-h-[calc(100dvh-2.5rem)] flex flex-col bg-parish-surface border border-[var(--p-blue-border)] rounded-2xl shadow-2xl`}
    >
      <div className="flex items-start gap-2 px-5 pt-4">
        <div className="flex-1 min-w-0">
          <div className="font-serif text-[21px] font-semibold text-parish-navy leading-tight">Set up the parish</div>
          <p className="m-0 mt-1 text-[13px] text-parish-text2 leading-snug">
            {first ? `Welcome, ${first}! ` : ''}
            {left ? `${left} parish ${left === 1 ? 'setting is' : 'settings are'} still to fill in. ` : 'Everything is set up. '}
            {INTRO}
          </p>
        </div>
        <button type="button" onClick={() => setFolded(true)} aria-label="Fold the setup checklist" title="Fold" className={`${iconButton} text-[20px] px-1.5 py-0.5`}>–</button>
        <button type="button" onClick={close} aria-label="Close the setup checklist" title="Close" className={`${iconButton} text-[22px] px-1.5 -mr-1.5`}>×</button>
      </div>
      <div className="px-5 py-3"><Progress steps={steps} /></div>
      <div className="px-5 overflow-y-auto min-h-0">
        <StepList steps={steps} onMark={mark} onOpen={() => setFolded(true)} compact />
      </div>
      <div className="px-5 pt-2.5 text-[12.5px] text-parish-muted">
        Also kept at the top of <Link to="/admin/settings" onClick={() => setFolded(true)} className="font-semibold text-parish-blue">Parish Config</Link> until it's done.
      </div>
      <div className="flex items-center gap-3 flex-wrap px-5 pt-3 pb-4">
        <label className="flex items-center gap-2 cursor-pointer text-[13px] font-semibold text-parish-text2 select-none">
          <Checkbox checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          Don't show this again
        </label>
        <PrimaryButton type="button" onClick={close} className="ml-auto px-5 py-2 text-[13.5px]">{left ? 'Later' : 'Close'}</PrimaryButton>
      </div>
    </aside>
  );
}
