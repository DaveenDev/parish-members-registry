import React from 'react';
import { PARTICIPATION_ITEMS, PARTICIPATION_LEVELS, HELP_WAYS } from '../constants.js';
import { Checkbox } from './ui.jsx';

/**
 * Household participation survey, shared by the public wizard (Step 1) and
 * the admin household panels. `participation` is { [itemKey]: level },
 * `helpWays` is an array of HELP_WAYS keys. Registration asks each member
 * the participation questions instead (0055, MemberCensusCards), so it shows
 * only the household's "how can you help" (`withParticipation={false}`).
 */
export default function ParticipationSurvey({ participation = {}, helpWays = [], onParticipation, onToggleHelpWay, compact = false, english = false, withParticipation = true }) {
  const legendSize = compact ? 'text-[14px]' : 'text-[15.5px]';
  // Admin shows the questions in English; the answer choices stay Bisaya everywhere.
  const t = english
    ? { active: 'Is the household active in the parish or GKK in the following?', help: 'How can the household help develop the church / GKK?', all: 'Check all that apply.' }
    : { active: 'Aktibo ba kamo nagapartisipar sa inyong Parokya o GKK sa mga musunod?', help: 'Sa unsang paagi kamo makatabang sa pagpalambo pa gayud sa simbahan / GKK?', all: 'I-tsek ang tanan nga angay.' };
  return (
    <div className="flex flex-col gap-6">
      {withParticipation && (
      <fieldset className="border-none p-0 m-0 min-w-0">
        <legend className={`font-semibold text-parish-navy mb-3 ${legendSize}`}>{t.active}</legend>
        <div className="flex flex-col divide-y divide-parish-line2 border border-parish-edge rounded-xl bg-parish-field">
          {PARTICIPATION_ITEMS.map(([key, label]) => (
            <div key={key} role="radiogroup" aria-label={label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <span className="font-bold text-[14.5px] text-parish-ink">{label}</span>
              <div className="flex gap-1.5">
                {PARTICIPATION_LEVELS.map((level) => {
                  const checked = participation[key] === level;
                  return (
                    <label
                      key={level}
                      className={`cursor-pointer select-none px-3.5 py-2.5 rounded-full border-[1.5px] text-[13px] font-semibold transition focus-within:ring-2 focus-within:ring-parish-blue/30 ${
                        checked ? 'bg-parish-fill border-parish-blue text-white' : 'bg-parish-surface border-parish-borderSoft text-parish-text2 hover:border-parish-blue'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`participation-${key}`}
                        value={level}
                        checked={checked}
                        onChange={() => onParticipation(key, level)}
                        className="sr-only"
                      />
                      {level}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      )}

      <fieldset className="border-none p-0 m-0 min-w-0">
        <legend className={`font-semibold text-parish-navy mb-1 ${legendSize}`}>{t.help}</legend>
        <div className="text-[12.5px] text-parish-muted mb-3">{t.all}</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {HELP_WAYS.map(([key, label]) => {
            const checked = helpWays.includes(key);
            return (
              <label key={key} className="flex items-start gap-2.5 cursor-pointer border-[1.5px] rounded-xl px-3 py-2.5" style={{ borderColor: checked ? 'rgb(var(--c-focus-line))' : 'rgb(var(--c-border-soft))', background: checked ? 'var(--p-blue-tint)' : 'rgb(var(--c-field))' }}>
                <Checkbox checked={checked} onChange={() => onToggleHelpWay(key)} className="mt-0.5 flex-none" />
                <span className="text-[14px] leading-snug text-parish-ink">{label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/**
 * Read-only copy of the survey answers for the wizard's review step: every
 * choice shown as a disabled checkbox, ticked where it was picked.
 */
export function ParticipationReview({ participation = {}, helpWays = [], english = false, withParticipation = true }) {
  const box = 'w-[17px] h-[17px] accent-parish-blue flex-none disabled:cursor-default disabled:opacity-100';
  // Browsers grey out disabled boxes, so the picked answers are also set in bold.
  const picked = 'text-parish-ink font-semibold';
  return (
    <div className="flex flex-col gap-4">
      {withParticipation && (
      <div>
        <div className="text-parish-muted font-semibold text-[13px] sm:text-[15px] mb-2">{english ? 'Participation' : 'Partisipasyon'}</div>
        <div className="flex flex-col divide-y divide-parish-line2 border border-parish-edge rounded-xl bg-parish-field">
          {PARTICIPATION_ITEMS.map(([key, label]) => (
            <div key={key} role="group" aria-label={label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-2.5">
              <span className="font-bold text-[14px] text-parish-ink">{label}</span>
              <div className="flex gap-2">
                {PARTICIPATION_LEVELS.map((level) => (
                  <label key={level} className={`flex items-center gap-1.5 w-[78px] text-[13px] ${participation[key] === level ? picked : 'text-parish-text2'}`}>
                    <input type="checkbox" disabled checked={participation[key] === level} readOnly className={box} />
                    {level}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
      <div>
        <div className="text-parish-muted font-semibold text-[13px] sm:text-[15px] mb-2">{english ? 'Ways to help' : 'Paagi sa pagtabang'}</div>
        <div className="grid gap-x-4 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {HELP_WAYS.map(([key, label]) => (
            <label key={key} className="flex items-start gap-2.5">
              <input type="checkbox" disabled checked={helpWays.includes(key)} readOnly className={`${box} mt-0.5`} />
              <span className={`text-[14px] leading-snug ${helpWays.includes(key) ? picked : 'text-parish-text2'}`}>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
