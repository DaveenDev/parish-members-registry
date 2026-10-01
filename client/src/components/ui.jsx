import React, { useId, useRef, useState } from 'react';
import { TRIBES, FAMILY_GROUPINGS } from '../constants.js';

/**
 * Label + control + error. The label is linked to the control so tapping it
 * focuses the field and screen readers announce it, and an error marks the
 * control aria-invalid (which the wizard also uses to find the first error).
 *
 * The control is the first element child. When that isn't the input itself
 * (e.g. a row holding an input and a button), pass `inputId` and put that id
 * on the input directly.
 */
export function Field({ label, required, error, children, inputId }) {
  const autoId = useId();
  const errorId = `${autoId}-error`;
  const items = React.Children.toArray(children);
  const target = inputId ? -1 : items.findIndex((c) => React.isValidElement(c));
  const controlId = inputId || (target >= 0 && items[target].props.id) || autoId;
  const content = target < 0 ? children : items.map((c, i) => (
    i !== target ? c : React.cloneElement(c, {
      id: controlId,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? errorId : undefined,
    })
  ));
  return (
    <div>
      {label && (
        <label htmlFor={controlId} className="block font-semibold text-[12.5px] text-parish-ink mb-1.5 tracking-wide">
          {label} {required && <span className="text-parish-gold">*</span>}
        </label>
      )}
      {content}
      {error && <div id={errorId} role="alert" className="text-parish-error text-[12px] font-medium mt-1">{error}</div>}
    </div>
  );
}

const inputBase =
  'w-full px-3.5 py-3 text-[16px] text-parish-ink bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-xl outline-none transition focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15';

export const TextInput = React.forwardRef(function TextInput(props, ref) {
  return <input ref={ref} {...props} className={`${inputBase} ${props.className || ''}`} />;
});

export function Select(props) {
  return <select {...props} className={`${inputBase} cursor-pointer ${props.className || ''}`} />;
}

export function Checkbox(props) {
  return <input type="checkbox" {...props} className={`w-[19px] h-[19px] accent-parish-blue cursor-pointer ${props.className || ''}`} />;
}

export function Card({ className = '', children }) {
  return <div className={`bg-white border border-parish-border rounded-[20px] shadow-card ${className}`}>{children}</div>;
}

export function PrimaryButton({ className = '', children, ...rest }) {
  return (
    <button
      {...rest}
      className={`appearance-none border-none cursor-pointer font-bold text-white bg-parish-blue rounded-xl shadow-btn transition hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export const GoldButton = React.forwardRef(function GoldButton({ className = '', children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className={`appearance-none border-none cursor-pointer font-bold text-white bg-parish-gold rounded-xl shadow-[0_10px_22px_-10px_rgba(195,155,78,.6)] transition hover:-translate-y-px ${className}`}
    >
      {children}
    </button>
  );
});

export const GhostButton = React.forwardRef(function GhostButton({ className = '', children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      {...rest}
      className={`appearance-none cursor-pointer font-semibold text-parish-text2 bg-transparent border-[1.5px] border-[#dcd0b7] rounded-xl transition hover:bg-[#efe7d6] ${className}`}
    >
      {children}
    </button>
  );
});

export function Spinner({ className = '' }) {
  return <span className={`inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spinSlow ${className}`} />;
}

export function StatusPill({ status }) {
  const verified = status === 'Verified';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
        verified ? 'bg-[#eaf4ee] text-[#2f7a52]' : 'bg-[#fdf1de] text-[#a1762b]'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${verified ? 'bg-[#2f7a52]' : 'bg-[#a1762b]'}`} />
      {status}
    </span>
  );
}

/**
 * Family Grouping picker (FG 1 – FG 10). `onChange` receives the value. An
 * older free-text value that isn't on the list stays selectable so editing a
 * household doesn't silently drop it.
 */
export function FamilyGroupingSelect({ value, onChange, placeholder = 'Select…', ...rest }) {
  const current = value || '';
  const options = current && !FAMILY_GROUPINGS.includes(current) ? [current, ...FAMILY_GROUPINGS] : FAMILY_GROUPINGS;
  return (
    <Select {...rest} value={current} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((g) => <option key={g} value={g}>{g}</option>)}
    </Select>
  );
}

const OTHER_TRIBE = '__other__';

/**
 * Tribe picker: the TRIBES list plus "Other…", which reveals a text box.
 * `onChange` receives the tribe string. A saved value that isn't on the list
 * opens straight into "Other…" so older free-text entries still show.
 */
export function TribeSelect({ value, onChange, placeholder = 'Tribu', otherLabel = 'Other…', ...rest }) {
  const current = value || '';
  const known = TRIBES.includes(current);
  const [otherChosen, setOtherChosen] = useState(false);
  const showOther = otherChosen || (!!current && !known);

  function pick(e) {
    const v = e.target.value;
    if (v === OTHER_TRIBE) {
      setOtherChosen(true);
      if (known) onChange('');
    } else {
      setOtherChosen(false);
      onChange(v);
    }
  }

  return (
    <>
      <Select {...rest} value={showOther ? OTHER_TRIBE : current} onChange={pick}>
        <option value="">{placeholder}</option>
        {TRIBES.map((t) => <option key={t} value={t}>{t}</option>)}
        <option value={OTHER_TRIBE}>{otherLabel}</option>
      </Select>
      {showOther && (
        <TextInput
          className="mt-2"
          placeholder="Isulat ang tribu"
          aria-label="Other tribe"
          value={current}
          autoFocus={otherChosen}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}

/**
 * Text box with a suggestion list: pick one of `options` or type anything
 * else. `onChange` receives the string. The list filters as you type, and
 * shows everything again once the box holds one of the options so the
 * choice is easy to switch.
 */
export function ComboInput({ options, value, onChange, id, className = '', toggleLabel = 'Show options', ...rest }) {
  const autoId = useId();
  const inputId = id || autoId;
  const listId = `${inputId}-list`;
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const current = value || '';
  const q = current.trim().toLowerCase();
  const exact = options.some((o) => o.toLowerCase() === q);
  const shown = !q || exact ? options : options.filter((o) => o.toLowerCase().includes(q));
  const expanded = open && shown.length > 0;

  function pick(option) {
    onChange(option);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!expanded) { setOpen(true); setActive(e.key === 'ArrowDown' ? 0 : shown.length - 1); return; }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + shown.length) % shown.length);
    } else if (e.key === 'Enter' && expanded && active >= 0) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === 'Escape' && expanded) {
      e.stopPropagation(); // close the list, not the dialog around it
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        {...rest}
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        value={current}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className={`${inputBase} pr-10 ${className}`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={toggleLabel}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { setOpen((o) => !o); inputRef.current?.focus(); }}
        className="absolute right-1 top-1/2 -translate-y-1/2 appearance-none border-none bg-transparent cursor-pointer text-parish-muted w-8 h-8 flex items-center justify-center"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {expanded && (
        <ul id={listId} role="listbox" className="absolute z-30 left-0 right-0 top-full mt-1 m-0 p-1 list-none bg-white border border-parish-border rounded-xl shadow-card max-h-60 overflow-auto">
          {shown.map((o, i) => {
            const selected = o.toLowerCase() === q;
            return (
              <li
                key={o}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={() => setActive(i)}
                className={`px-3 py-2.5 rounded-lg cursor-pointer text-[15px] ${i === active ? 'bg-[var(--p-blue-tint)] text-parish-blue' : 'text-parish-ink'} ${selected ? 'font-semibold' : ''}`}
              >
                {o}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Picker for a staff-managed list (e.g. parish positions). `onChange`
 * receives the value. A saved value that's no longer on the list stays
 * selectable so editing a record doesn't silently drop it.
 */
export function OptionSelect({ options, value, onChange, placeholder = 'Select…', ...rest }) {
  const current = value || '';
  const list = current && !options.includes(current) ? [current, ...options] : options;
  return (
    <Select {...rest} value={current} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {list.map((o) => <option key={o} value={o}>{o}</option>)}
    </Select>
  );
}

/** Non-blocking note under the admin household-name fields. */
export function HouseholdNameTakenNote({ show }) {
  if (!show) return null;
  return (
    <div className="text-[12.5px] font-semibold text-[#a1762b] mt-1.5">
      ⚠ Another household already uses this name. You can still save, but consider making it distinct.
    </div>
  );
}

const BADGE_TONES = {
  gold: 'bg-[var(--p-gold-tint)] text-[var(--p-gold-deep)]',
  blue: 'bg-[var(--p-blue-tint)] text-parish-blue',
  green: 'bg-parish-okBg text-parish-ok',
};

export function Badge({ tone = 'blue', title, children }) {
  return (
    <span title={title} className={`inline-flex items-center text-[11.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${BADGE_TONES[tone] || BADGE_TONES.blue}`}>
      {children}
    </span>
  );
}
