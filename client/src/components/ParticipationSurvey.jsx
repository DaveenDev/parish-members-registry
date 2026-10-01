import React from 'react';
import { PARTICIPATION_ITEMS, PARTICIPATION_LEVELS, HELP_WAYS } from '../constants.js';
import { Checkbox } from './ui.jsx';

/**
 * Household participation survey, shared by the public wizard (Step 1) and
 * the admin household edit modal. `participation` is { [itemKey]: level },
 * `helpWays` is an array of HELP_WAYS keys.
 */
export default function ParticipationSurvey({ participation = {}, helpWays = [], onParticipation, onToggleHelpWay, compact = false }) {
  const legendSize = compact ? 'text-[14px]' : 'text-[15.5px]';
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="border-none p-0 m-0 min-w-0">
        <legend className={`font-semibold text-parish-navy mb-3 ${legendSize}`}>
          Aktibo ba kamo nagapartisipar sa inyong Parokya o GKK sa mga musunod?
        </legend>
        <div className="flex flex-col divide-y divide-[#f0e8d6] border border-[#eee3ce] rounded-xl bg-[#fdfbf6]">
          {PARTICIPATION_ITEMS.map(([key, label]) => (
            <div key={key} role="radiogroup" aria-label={label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
              <span className="font-medium text-[14.5px] text-parish-ink">{label}</span>
              <div className="flex gap-1.5">
                {PARTICIPATION_LEVELS.map((level) => {
                  const checked = participation[key] === level;
                  return (
                    <label
                      key={level}
                      className={`cursor-pointer select-none px-3.5 py-2.5 rounded-full border-[1.5px] text-[13px] font-semibold transition focus-within:ring-2 focus-within:ring-parish-blue/30 ${
                        checked ? 'bg-parish-blue border-parish-blue text-white' : 'bg-white border-parish-borderSoft text-parish-text2 hover:border-parish-blue'
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

      <fieldset className="border-none p-0 m-0 min-w-0">
        <legend className={`font-semibold text-parish-navy mb-1 ${legendSize}`}>
          Sa unsang paagi kamo makatabang sa pagpalambo pa gayud sa simbahan / GKK?
        </legend>
        <div className="text-[12.5px] text-parish-muted mb-3">I-tsek ang tanan nga angay.</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {HELP_WAYS.map(([key, label]) => {
            const checked = helpWays.includes(key);
            return (
              <label key={key} className="flex items-start gap-2.5 cursor-pointer border-[1.5px] rounded-xl px-3 py-2.5" style={{ borderColor: checked ? '#9db9e0' : '#e0d6c1', background: checked ? 'var(--p-blue-tint)' : '#fdfbf6' }}>
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
