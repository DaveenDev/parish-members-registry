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

/** Each member's census answers for the review step: status, then the answers given. */
export function MemberCensusReview({ memberViews, english = false }) {
  const label = (s) => (english ? s : MEMBERSHIP_STATUS_LABELS[s]);
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-2">
      {memberViews.map((mv) => {
        const { censusStatus, participation } = registrationAnswers(mv);
        const answers = PARTICIPATION_ITEMS.filter(([k]) => participation[k]).map(([k, l]) => `${l}: ${participation[k]}`);
        return (
          <li key={mv.mi} className="text-[14px] text-parish-ink">
            <span className="font-semibold">{mv.displayName}</span>
            {' · '}
            {censusStatus ? <span className="font-semibold text-parish-navy">{label(censusStatus)}</span> : <span className="text-parish-error">{english ? 'no status yet' : 'wala pay kahimtang'}</span>}
            {answers.length > 0 && <div className="text-[12.5px] text-parish-text2">{answers.join(' · ')}</div>}
          </li>
        );
      })}
    </ul>
  );
}
