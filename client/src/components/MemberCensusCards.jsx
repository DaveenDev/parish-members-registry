import React from 'react';
import { PARTICIPATION_ITEMS, PARTICIPATION_LEVELS } from '../constants.js';
import { Field, Select } from './ui.jsx';
import { bis, RELATIONSHIP_LABELS } from '../lib/bisaya.js';
import {
  MEMBERSHIP_STATUS_LABELS, REGISTRATION_STATUSES, YOUNG_CHILD_MAX_AGE, asksParticipation, isYoungChild, registrationAnswers, suggestStatus,
} from '../lib/census.js';

/**
 * Each member's census answers at registration (0055), the same card as the
 * census portal's: their status now and Aktibo / Panagsa / Wala for each
 * kind of participation. Used by the public wizard (Bisaya) and the admin
 * New Household panel (`english` questions; the answer choices stay Bisaya).
 * `memberViews` carry { mi, displayName, relationship, dob, censusStatus,
 * statusPicked, participation, err, note }; `onChange(mi, patch)` takes
 * censusCardPatch()-style patches. `statuses` are the ones to offer
 * (registration: no Moved away or Deceased; Edit Household: all of them).
 */
export default function MemberCensusCards({ memberViews, onChange, english = false, statuses = REGISTRATION_STATUSES }) {
  const t = english
    ? {
      status: 'Status now', choose: 'Choose…', suggested: 'Suggested from the answers.',
      child: (age) => <><strong className="text-parish-navy">Active</strong>: a child ({age} or younger), so there's nothing to answer.</>,
      none: (s) => <>Nothing to answer, since <strong className="text-parish-navy">{s}</strong> was chosen.</>,
      statusLabel: (s) => s, relation: (r) => r || '—',
    }
    : {
      status: 'Kahimtang karon', choose: 'Pili…', suggested: 'Gisugyot gikan sa inyong mga tubag.',
      child: (age) => <><strong className="text-parish-navy">Aktibo</strong>: bata pa ({age} anyos o ubos), busa dili na kinahanglan tubagon ang mga pangutana.</>,
      none: (s) => <>Dili na kinahanglan tubagon ang mga pangutana kay <strong className="text-parish-navy">{s}</strong> ang napili.</>,
      statusLabel: (s) => MEMBERSHIP_STATUS_LABELS[s], relation: (r) => bis(RELATIONSHIP_LABELS, r) || '—',
    };

  return (
    <div className="flex flex-col gap-3.5">
      {memberViews.map((mv) => {
        const child = isYoungChild(mv.dob);
        const { censusStatus } = registrationAnswers(mv);
        const noSurvey = mv.statusPicked && !asksParticipation(mv.censusStatus);
        const suggestion = !mv.statusPicked && suggestStatus(mv.participation);
        return (
          <div key={mv.mi} className="border border-parish-edge rounded-xl bg-parish-field p-4">
            <div className="font-semibold text-[15.5px] text-parish-navy mb-3">
              {mv.displayName} <span className="font-medium text-[12.5px] text-parish-muted">· {t.relation(mv.relationship)}</span>
            </div>

            {mv.note && <div className="-mt-1.5 mb-3 text-[12.5px] text-parish-muted">{mv.note}</div>}
            {child && !statuses.includes('Moved away') ? (
              <div className="px-3.5 py-3 rounded-xl bg-parish-surface border border-parish-line2 text-[13.5px] text-parish-text2">{t.child(YOUNG_CHILD_MAX_AGE)}</div>
            ) : (
              <>
                <div className="max-w-[320px]">
                  <Field label={t.status} required error={mv.err?.censusStatus}>
                    <Select data-census-status value={censusStatus} onChange={(e) => onChange(mv.mi, { censusStatus: e.target.value })}>
                      <option value="">{t.choose}</option>
                      {[...new Set([...statuses, ...(censusStatus ? [censusStatus] : [])])].map((s) => <option key={s} value={s}>{t.statusLabel(s)}</option>)}
                    </Select>
                  </Field>
                  {suggestion && <div className="text-[12.5px] text-parish-muted mt-1">{t.suggested}</div>}
                </div>

                {child ? (
                  <div className="mt-3 px-3.5 py-3 rounded-xl bg-parish-surface border border-parish-line2 text-[13.5px] text-parish-text2">{t.child(YOUNG_CHILD_MAX_AGE)}</div>
                ) : noSurvey ? (
                  // Hidden rather than greyed out, so phones don't scroll past questions nobody answers.
                  <div className="mt-3 px-3.5 py-3 rounded-xl bg-parish-surface border border-parish-line2 text-[13.5px] text-parish-text2">{t.none(t.statusLabel(mv.censusStatus))}</div>
                ) : (
                  <div className="mt-3 flex flex-col divide-y divide-parish-line2 border border-parish-line2 rounded-xl bg-parish-surface">
                    {PARTICIPATION_ITEMS.map(([key, label]) => (
                      <div key={key} role="radiogroup" aria-label={`${mv.displayName}: ${label}`} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
                        <span className="font-medium text-[14px] text-parish-ink">{label}</span>
                        <div className="flex gap-1.5">
                          {PARTICIPATION_LEVELS.map((level) => {
                            const on = mv.participation?.[key] === level;
                            return (
                              <button
                                key={level} type="button" role="radio" aria-checked={on}
                                onClick={() => onChange(mv.mi, { participation: { ...(mv.participation || {}), [key]: on ? undefined : level } })}
                                className={`appearance-none px-3 py-2 rounded-full border-[1.5px] text-[13px] font-semibold cursor-pointer ${
                                  on ? 'bg-parish-fill border-parish-blue text-white' : 'bg-parish-surface border-parish-borderSoft text-parish-text2 hover:border-parish-blue'
                                }`}
                              >
                                {level}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Each member's census answers for the review step: their status, then a
 * checklist with a tick under Aktibo, Panagsa or Wala for each activity.
 */
export function MemberCensusReview({ memberViews, english = false }) {
  const t = english
    ? {
      statusLabel: (s) => s, noStatus: 'no status yet', picked: 'selected', activity: 'Activity',
      child: 'A child: nothing to answer.', none: 'Nothing to answer for this status.', noAnswers: 'No answers yet.',
    }
    : {
      statusLabel: (s) => MEMBERSHIP_STATUS_LABELS[s], noStatus: 'wala pay kahimtang', picked: 'napili', activity: 'Kalihokan',
      child: 'Bata pa: walay pangutana nga tubagon.', none: 'Walay pangutana para niini nga kahimtang.', noAnswers: 'Wala pay tubag.',
    };
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-3">
      {memberViews.map((mv) => {
        const { censusStatus, participation } = registrationAnswers(mv);
        const answered = PARTICIPATION_ITEMS.some(([k]) => participation[k]);
        const note = isYoungChild(mv.dob) ? t.child : !asksParticipation(censusStatus) ? t.none : !answered ? t.noAnswers : '';
        return (
          <li key={mv.mi} className="border border-parish-line2 rounded-xl bg-parish-surface px-3.5 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[14px]">
              <span className="font-semibold text-parish-navy">{mv.displayName}</span>
              {censusStatus
                ? <span className="font-semibold text-[13px] text-parish-blue">{t.statusLabel(censusStatus)}</span>
                : <span className="text-[13px] text-parish-error">{t.noStatus}</span>}
            </div>
            {note ? (
              <div className="mt-1.5 text-[12.5px] text-parish-muted">{note}</div>
            ) : (
              <ParticipationChecklist participation={participation} activityLabel={t.activity} pickedLabel={t.picked} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The six activities, each with a tick under the Aktibo, Panagsa or Wala answered. Read-only. */
export function ParticipationChecklist({ participation = {}, activityLabel = 'Activity', pickedLabel = 'selected', className = 'mt-2' }) {
  return (
    <table className={`w-full border-collapse text-[13px] ${className}`}>
      <thead>
        <tr className="text-parish-muted">
          <th scope="col" className="text-left font-semibold py-1 pr-2"><span className="sr-only">{activityLabel}</span></th>
          {PARTICIPATION_LEVELS.map((level) => <th key={level} scope="col" className="w-[62px] font-semibold py-1 text-center">{level}</th>)}
        </tr>
      </thead>
      <tbody>
        {PARTICIPATION_ITEMS.map(([key, label]) => (
          <tr key={key} className="border-t border-parish-line2">
            <th scope="row" className="text-left font-medium text-parish-ink py-1.5 pr-2">{label}</th>
            {PARTICIPATION_LEVELS.map((level) => (
              <td key={level} className="text-center py-1.5"><CheckMark on={participation[key] === level} label={pickedLabel} /></td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A read-only checkbox: ticked, or an empty box. */
function CheckMark({ on, label }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-[5px] border-[1.5px] align-middle ${on ? 'bg-parish-fill border-parish-blue text-white' : 'border-parish-borderSoft'}`}
    >
      {on && (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
          <span className="sr-only">{label}</span>
        </>
      )}
    </span>
  );
}
