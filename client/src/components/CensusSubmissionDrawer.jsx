import React, { useEffect, useId, useState } from 'react';
import { api } from '../api.js';
import { PrimaryButton, GhostButton, Badge } from './ui.jsx';
import { fmtDate, PARTICIPATION_ITEMS, PARTICIPATION_LEVELS } from '../constants.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS } from '../lib/bisaya.js';
import { STATUS_TONES, diffSubmission, suggestStatus } from '../lib/census.js';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useAuth } from '../AuthContext.jsx';
import { can } from '../lib/access.js';

const LABEL_MAPS = { relationship: RELATIONSHIP_LABELS, sex: SEX_LABELS, civil_status: CIVIL_STATUS_LABELS };

function show(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'dob') return fmtDate(value);
  return LABEL_MAPS[key] ? bis(LABEL_MAPS[key], value) : value;
}

const hasAnswers = (participation) => PARTICIPATION_ITEMS.some(([k]) => participation?.[k]);

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The family's participation answers as a checklist: a green check on the level they picked. */
function AnswerChecklist({ participation }) {
  return (
    <table className="w-full border-collapse mt-2 text-[13px]">
      <tbody>
        {PARTICIPATION_ITEMS.map(([key, label]) => {
          const picked = participation?.[key];
          return (
            <tr key={key} className="border-t border-parish-line first:border-t-0">
              <td className="py-1.5 pr-3 font-bold text-parish-ink align-middle">{label}</td>
              <td className="py-1.5">
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-end">
                  {PARTICIPATION_LEVELS.map((level) => {
                    const on = picked === level;
                    return (
                      <span key={level} className={`inline-flex items-center gap-1.5 ${on ? 'font-bold text-parish-ok' : 'text-parish-faint'}`}>
                        <span
                          className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px] border-[1.5px] ${on ? 'bg-parish-ok border-parish-ok text-white' : 'border-parish-borderSoft'}`}
                        >
                          {on && <CheckIcon />}
                        </span>
                        {level}
                        {on && <span className="sr-only"> (chosen)</span>}
                      </span>
                    );
                  })}
                  {!picked && <span className="sr-only">No answer</span>}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Changes({ rows }) {
  return (
    <table className="w-full border-collapse text-[13.5px] mt-1.5">
      <tbody>
        {rows.map((c) => (
          <tr key={c.key} className="border-t border-parish-line first:border-t-0">
            <td className="py-1.5 pr-3 text-parish-muted whitespace-nowrap align-top w-[140px]">{c.label}</td>
            <td className="py-1.5 pr-2 text-parish-muted line-through align-top">{show(c.key, c.from)}</td>
            <td className="py-1.5 font-semibold text-parish-navy align-top">→ {show(c.key, c.to)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Answer({ status, participation, notes }) {
  const a = hasAnswers(participation);
  const suggested = suggestStatus(participation);
  if (!status && !a && !notes) return <div className="text-[13px] text-parish-muted mt-1.5">No census answer.</div>;
  return (
    <div className="mt-2 text-[13px] text-parish-text3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-parish-muted">Census:</span>
        {status ? <Badge tone={STATUS_TONES[status]}>{status}</Badge> : <span className="text-parish-muted">no status chosen</span>}
        {suggested && suggested !== status && <span className="text-[12px] font-semibold text-parish-warn">(the answers suggest {suggested})</span>}
      </div>
      {a && <AnswerChecklist participation={participation} />}
      {notes && <div className="mt-1 text-parish-text2">Note: {notes}</div>}
    </div>
  );
}

/**
 * Review one family's online census update: what it would change, what the
 * family answered, and Approve / Reject. Approval only applies fields the
 * family changed, so staff edits made since it was sent are kept.
 */
export default function CensusSubmissionDrawer({ submission: s, cycle, onClose, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const d = diffSubmission(s);
  const reviewed = s.status !== 'Pending';
  const { user } = useAuth();
  // GKK leaders review their own GKK's updates; the server refuses any other (0024).
  const open = cycle.status === 'Open' && !reviewed && can(user, 'editCensus');
  const hh = s.households || {};

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('[role="alertdialog"]') && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function approve() {
    const ok = await confirm({
      title: `Approve the update from ${hh.household_name}?`,
      message: 'The changes below are saved to the registry and the census answers are recorded as coming from the family portal.',
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await api.approveCensusSubmission(s.id);
      toast.success(`Update from ${hh.household_name} approved`);
      onDone();
    } catch (e) {
      setError(e.message || 'Could not approve this update');
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError('');
    try {
      await api.rejectCensusSubmission(s.id, note);
      toast.success('Update rejected');
      onDone();
    } catch (e) {
      setError(e.message || 'Could not reject this update');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[45] flex justify-end">
      <div className="absolute inset-0 bg-parish-scrim/35 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative h-full w-full sm:w-[min(100%,620px)] lg:w-[46vw] lg:min-w-[580px] bg-parish-surface shadow-2xl flex flex-col animate-slideInRight">
        <header className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 pb-4 border-b border-parish-line2">
          <div className="min-w-0">
            <h3 id={titleId} className="font-serif text-[24px] font-semibold m-0 text-parish-navy truncate">{hh.household_name}</h3>
            <p className="text-[13px] text-parish-muted m-0">
              Online update · {[hh.ref_no, hh.gkk].filter(Boolean).join(' · ')} · sent {new Date(s.submitted_at).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none px-1">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 flex flex-col gap-5">
          {s.message && (
            <div className="px-4 py-3 rounded-xl bg-[var(--p-blue-tint)] text-[14px] text-parish-navy">
              <div className="font-semibold text-[12px] uppercase tracking-wide text-parish-blue mb-1">Message from the family</div>
              {s.message}
            </div>
          )}

          <section>
            <SectionLabel>Household details</SectionLabel>
            {d.household.length ? <Changes rows={d.household} /> : <div className="text-[13.5px] text-parish-muted">No changes.</div>}
          </section>

          <section>
            <SectionLabel>Members ({d.members.length})</SectionLabel>
            <div className="flex flex-col gap-2.5">
              {d.members.map((m) => (
                <div key={m.id} className="border border-parish-line2 rounded-xl bg-parish-field px-4 py-3">
                  <div className="font-semibold text-[14.5px] text-parish-navy">{m.name}</div>
                  {m.changes.length > 0 ? <Changes rows={m.changes} /> : <div className="text-[13px] text-parish-muted mt-1">Details unchanged.</div>}
                  <Answer {...m} />
                </div>
              ))}
            </div>
          </section>

          {d.newMembers.length > 0 && (
            <section>
              <SectionLabel>New members ({d.newMembers.length})</SectionLabel>
              <div className="flex flex-col gap-2.5">
                {d.newMembers.map((m, i) => (
                  <div key={i} className="border-[1.5px] border-parish-focusLine rounded-xl bg-parish-fillSoft px-4 py-3">
                    <div className="font-semibold text-[14.5px] text-parish-navy">{m.name}</div>
                    <div className="text-[13px] text-parish-text2 mt-0.5">
                      {[show('relationship', m.fields.relationship), m.fields.sex && show('sex', m.fields.sex), m.fields.dob && `born ${show('dob', m.fields.dob)}`, m.fields.civil_status && show('civil_status', m.fields.civil_status), m.fields.contact]
                        .filter((x) => x && x !== '—').join(' · ')}
                    </div>
                    <Answer {...m} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {rejecting && (
            <section>
              <SectionLabel>Reason for rejecting (optional)</SectionLabel>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="e.g. Please visit the office to correct the names"
                className="w-full px-3.5 py-3 text-[14.5px] text-parish-ink bg-parish-field border-[1.5px] border-parish-borderSoft rounded-xl outline-none focus:border-parish-blue"
                aria-label="Reason for rejecting"
              />
            </section>
          )}
          {error && <div className="text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
        </div>

        <footer className="flex items-center gap-2.5 justify-end px-5 sm:px-7 py-3.5 border-t border-parish-line2 bg-parish-card">
          {reviewed && (
            <span className="mr-auto text-[12.5px] font-semibold text-parish-muted">
              {s.status} by {s.reviewed_by_name || 'staff'}{s.reviewed_at ? `, ${new Date(s.reviewed_at).toLocaleDateString()}` : ''}{s.review_note ? ` — ${s.review_note}` : ''}
            </span>
          )}
          {!reviewed && !open && (
            <span className="mr-auto text-[12.5px] font-semibold text-parish-warn">
              {cycle.status === 'Open' ? 'Your account can view updates but not approve them' : 'Reopen the census to review updates'}
            </span>
          )}
          {open && !rejecting && <button onClick={() => setRejecting(true)} disabled={busy} className="mr-auto appearance-none border-none bg-parish-errorBg text-parish-error cursor-pointer font-semibold text-[13px] px-4 py-2.5 rounded-lg">Reject…</button>}
          {open && rejecting && <button onClick={reject} disabled={busy} className="mr-auto appearance-none border-none bg-parish-error text-white cursor-pointer font-semibold text-[13px] px-4 py-2.5 rounded-lg">Reject update</button>}
          <GhostButton onClick={onClose} className="px-5 py-2.5 text-[14px]">Close</GhostButton>
          {open && <PrimaryButton onClick={approve} disabled={busy} className="px-6 py-2.5 text-[14px]">{busy ? 'Saving…' : 'Approve'}</PrimaryButton>}
        </footer>
      </aside>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mb-2">
      <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{children}</span>
      <span className="flex-1 h-px bg-parish-track" />
    </div>
  );
}
