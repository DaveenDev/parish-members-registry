import React from 'react';
import { toNameCase, toSuffixCase } from '../lib/util.js';
import { askedForAge } from '../lib/household.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, RELIGION_LABELS, WEDDING_TYPE_LABELS } from '../lib/bisaya.js';
import { HEADS, RELATIONSHIPS, CIVIL_STATUSES, RELIGIONS, BLOOD_TYPES, WEDDING_TYPES, ageFromDob } from '../constants.js';
import { Field, TextInput, Select, Checkbox, TribeSelect } from './ui.jsx';

// A member's questions as the public registration wizard asks them (Bisaya),
// shared with the census portal's new members. `mv` is a member as the
// wizard keeps it (blankMember()) with `mi`, its position, and `err`, its
// field errors; `onField(mi, field, value)` changes one field.

const GRID = { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' };
const MEMBER_RELATIONSHIPS = RELATIONSHIPS.filter((r) => !HEADS.includes(r));

export function MemberNameFields({ mv, onField }) {
  const set = (field) => (e) => onField(mv.mi, field, e.target.value);
  // Tidy to "Dela Cruz" style when the field is left, not while typing.
  const tidy = (field, format = toNameCase) => (e) => {
    const formatted = format(e.target.value);
    if (formatted !== e.target.value) onField(mv.mi, field, formatted);
  };
  return (
    <div className="grid gap-4" style={GRID}>
      <Field label="Apelyido" required error={mv.err.lastName}><TextInput value={mv.lastName} onChange={set('lastName')} onBlur={tidy('lastName')} autoCapitalize="words" /></Field>
      <Field label="Ngalan" required error={mv.err.firstName}><TextInput value={mv.firstName} onChange={set('firstName')} onBlur={tidy('firstName')} autoCapitalize="words" /></Field>
      <Field label="Tunga nga ngalan"><TextInput placeholder="apelyido sa inahan" value={mv.middleName} onChange={set('middleName')} onBlur={tidy('middleName')} autoCapitalize="words" /></Field>
      <Field label="Suffix"><TextInput placeholder="Jr., Sr., III" value={mv.suffix || ''} onChange={set('suffix')} onBlur={tidy('suffix', toSuffixCase)} /></Field>
    </div>
  );
}

/**
 * Personal details for one member. `head` hides Relationship (the head's is
 * fixed); `bloodType={false}` leaves out the blood type (the census portal
 * doesn't ask it, 0090). `children` come first in the grid.
 */
export function MemberFieldsGrid({ mv, onField, head = false, bloodType = true, children }) {
  const set = (field) => (e) => onField(mv.mi, field, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  return (
    <div className="grid gap-4" style={GRID}>
      {children}
      {!head && (
        <Field label="Relasyon sa ulo sa pamilya" required error={mv.err.relationship}>
          <Select value={mv.relationship} onChange={set('relationship')}>
            <option value="">Pili…</option>
            {MEMBER_RELATIONSHIPS.map((r) => <option key={r} value={r}>{bis(RELATIONSHIP_LABELS, r)}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Kasarian" required error={mv.err.sex}>
        <Select value={mv.sex} onChange={set('sex')}>
          <option value="">Pili…</option>
          {Object.entries(SEX_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Birthday" required error={mv.err.dob}><TextInput type="date" value={mv.dob} onChange={set('dob')} /></Field>
      <Field label="Lugar sa pagkatawo"><TextInput placeholder="Asa gipanganak" value={mv.placeOfBirth} onChange={set('placeOfBirth')} /></Field>
      <Field label="Tribu"><TribeSelect placeholder="Pili…" value={mv.tribe} onChange={(v) => onField(mv.mi, 'tribe', v)} /></Field>
      <Field label="Kahimtang sibil (Civil status)" required error={mv.err.civilStatus}>
        <Select value={mv.civilStatus} onChange={set('civilStatus')}>
          <option value="">Pili…</option>
          {CIVIL_STATUSES.map((c) => <option key={c} value={c}>{bis(CIVIL_STATUS_LABELS, c)}</option>)}
        </Select>
      </Field>
      <Field label="Numero sa kontak"><TextInput type="tel" placeholder="0917…" value={mv.contact} onChange={set('contact')} /></Field>
      <Field label="Email" error={mv.err.email}><TextInput type="email" placeholder="opsyonal" value={mv.email} onChange={set('email')} /></Field>
      <Field label="Trabaho"><TextInput placeholder="opsyonal" value={mv.occupation} onChange={set('occupation')} /></Field>
      <Field label="Relihiyon">
        <Select value={mv.religion} onChange={set('religion')}>
          {RELIGIONS.map((r) => <option key={r} value={r}>{bis(RELIGION_LABELS, r)}</option>)}
        </Select>
      </Field>
      {bloodType && (
        <div>
          <Field label="Tipo sa dugo (Blood type)">
            <Select value={mv.bloodType} onChange={set('bloodType')}>
              <option value="">Wala mahibal-i / dili gustong isulti</option>
              {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </Field>
          <div className="text-[12.5px] text-parish-muted mt-1">Makatabang kini sa parokya sa pagpangita og mohatag og dugo kung adunay emerhensya.</div>
        </div>
      )}
    </div>
  );
}

/** Under a ticked sacrament: the tick alone is enough when the date isn't known. */
function OptionalDetailsHint() {
  return (
    <div className="text-[12.5px] text-parish-muted mt-1.5 mb-2.5">
      Kon wala mahinumdumi ang petsa o parokya, pwede ra kini biyaan nga blangko. Igo na ang pag-tsek aron matala ang sakramento.
    </div>
  );
}

function SacramentBlock({ mv, field, dateField, churchField, label, extra, onField }) {
  const checked = mv[field];
  const set = (f) => (e) => onField(mv.mi, f, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
  return (
    <div className="border border-[#eee3ce] rounded-xl px-4 py-1.5 bg-[#fdfbf6]">
      {/* The whole row is the tap target, not just the small checkbox. */}
      <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
        <Checkbox checked={checked} onChange={set(field)} />
        <span className="font-semibold text-[15px] text-parish-navy">{label}</span>
      </label>
      {checked && (
        <>
          <div className="grid gap-3 mt-1" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <input type="date" aria-label={`Petsa sa ${label}`} value={mv[dateField]} onChange={set(dateField)} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
            <input type="text" placeholder="Parokya / Simbahan" value={mv[churchField]} onChange={set(churchField)} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
            {extra && extra(set)}
          </div>
          <OptionalDetailsHint />
        </>
      )}
    </div>
  );
}

/**
 * Married members say how they were wed; only a Catholic marriage counts as
 * the sacrament. `sharedWith` names the spouse whose wedding is the same one.
 */
function WeddingBlock({ mv, sharedWith, onField }) {
  const set = (f) => (e) => onField(mv.mi, f, e.target.value);
  function choose(type) {
    onField(mv.mi, 'matType', type);
    onField(mv.mi, 'hasMatrimony', type === 'Catholic Marriage');
  }
  const catholic = mv.matType === 'Catholic Marriage';
  return (
    <div className="border border-[#eee3ce] rounded-xl px-4 py-3.5 bg-[#fdfbf6]">
      <div className="font-semibold text-[15px] text-parish-navy">Kasal (Matrimony)</div>
      <div className="text-[13px] text-parish-muted mb-3">Unsang klase sa kasal?</div>
      {sharedWith && (
        <div className="text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-lg px-3 py-2 mb-3">
          Parehas ang kasal ninyo ni <strong>{sharedWith}</strong>: ang klase, petsa ug parokya nga isulat dinhi mausab usab sa iyang rekord.
        </div>
      )}
      <div role="radiogroup" aria-label={`Klase sa kasal ni ${mv.displayName}`} className="flex flex-wrap gap-2">
        {WEDDING_TYPES.map((type) => {
          const checked = mv.matType === type;
          return (
            <label
              key={type}
              className={`cursor-pointer select-none px-3.5 py-2.5 rounded-full border-[1.5px] text-[13.5px] font-semibold transition focus-within:ring-2 focus-within:ring-parish-blue/30 ${
                checked ? 'bg-parish-blue border-parish-blue text-white' : 'bg-white border-parish-borderSoft text-parish-text2 hover:border-parish-blue'
              }`}
            >
              <input type="radio" name={`wedding-${mv.mi}`} value={type} checked={checked} onChange={() => choose(type)} className="sr-only" />
              {bis(WEDDING_TYPE_LABELS, type)}
            </label>
          );
        })}
      </div>
      {catholic && (
        <>
          <div className="grid gap-3 mt-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
            <input type="date" aria-label="Petsa sa kasal" value={mv.matDate} onChange={set('matDate')} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
            <input type="text" placeholder="Parokya / Simbahan" value={mv.matChurch} onChange={set('matChurch')} className="w-full px-3 py-2.5 text-[15px] text-parish-ink bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
          </div>
          <OptionalDetailsHint />
        </>
      )}
    </div>
  );
}

/**
 * One member's sacraments: only those they're old enough for (see
 * askedForAge), and for a married member the kind of wedding.
 */
export function MemberSacraments({ mv, onField, sharedWith = '' }) {
  const asked = askedForAge(mv.dob);
  const tooYoung = !asked.communion || !asked.confirmation || !asked.matrimony;
  return (
    <div className="flex flex-col gap-3">
      <SacramentBlock mv={mv} field="hasBaptism" dateField="baptismDate" churchField="baptismChurch" label="Bunyag (Baptism)" onField={onField} />
      {asked.communion && <SacramentBlock mv={mv} field="hasCommunion" dateField="communionDate" churchField="communionChurch" label="Unang Kumunyon (First Communion)" onField={onField} />}
      {asked.confirmation && (
        <SacramentBlock
          mv={mv} field="hasConfirmation" dateField="confDate" churchField="confChurch" label="Kumpil (Confirmation)" onField={onField}
          extra={(set) => (
            <>
              <input type="text" placeholder="Ngalan sa kumpil" value={mv.confName} onChange={set('confName')} className="w-full px-3 py-2.5 text-[15px] bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
              <input type="text" placeholder="Maninoy / Maninay" value={mv.confSponsor} onChange={set('confSponsor')} className="w-full px-3 py-2.5 text-[15px] bg-white border-[1.5px] border-parish-borderSoft rounded-lg outline-none focus:border-parish-blue" />
            </>
          )}
        />
      )}
      {asked.matrimony && (mv.civilStatus === 'Married'
        ? <WeddingBlock mv={mv} sharedWith={sharedWith} onField={onField} />
        : <SacramentBlock mv={mv} field="hasMatrimony" dateField="matDate" churchField="matChurch" label="Kasal (Matrimony)" onField={onField} />)}
      {tooYoung && (
        <div className="text-[13px] text-parish-muted">
          {ageFromDob(mv.dob)} anyos pa: ang mga sakramento nga dili pa angay sa iyang edad wala na ipakita.
        </div>
      )}
    </div>
  );
}

/** The parish's organizations as boxes to tick; `selected` are the member's. */
export function OrganizationChecks({ options, selected = [], onToggle }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      {options.map((name) => {
        const checked = selected.includes(name);
        return (
          <label key={name} className="flex items-center gap-2.5 cursor-pointer border-[1.5px] rounded-xl px-3 py-2.5" style={{ borderColor: checked ? '#9db9e0' : '#e0d6c1', background: checked ? 'var(--p-blue-tint)' : '#fdfbf6' }}>
            <Checkbox checked={checked} onChange={() => onToggle(name)} className="flex-none" />
            <span className="text-[14px] text-parish-ink">{name}</span>
          </label>
        );
      })}
    </div>
  );
}
