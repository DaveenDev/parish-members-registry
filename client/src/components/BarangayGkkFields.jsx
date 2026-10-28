import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Select, TextInput } from './ui.jsx';
import { gkksByBarangay, isListedBarangay } from '../lib/site.js';

// The household's barangay and GKK, as the public registration and the admin
// New Household panel ask for them (0089): the barangays come from the GKKs'
// own Barangay field, with a last choice for a barangay outside the parish,
// typed in; the GKK list then puts the chosen barangay's GKKs first, still
// offering the rest, since a family can belong to a GKK outside the barangay
// it lives in.

const OUTSIDE = '__outside__';

/** Each GKK's barangay (api.gkkBarangayMap()): a Map of name → barangay, empty until loaded or before 0089. */
export function useGkkBarangayMap() {
  const [map, setMap] = useState(() => new Map());
  useEffect(() => { api.gkkBarangayMap().then(setMap).catch(() => {}); }, []);
  return map;
}

/**
 * The barangay: a list of the parish's barangays (`barangays`) with a last
 * choice for one outside it (`outsideLabel`), which shows a text box for its
 * name. A barangay already set that isn't on the list counts as outside.
 * With no list (the GKKs couldn't load), just the text box. Other props
 * (id, aria-*, from Field) go to the list, or to the text box without one.
 */
export function BarangayInput({ value, onChange, barangays, labels, ...rest }) {
  const listed = isListedBarangay(value, barangays);
  // Chosen "outside" before typing a name, or a saved barangay not on the list.
  const [outsideChosen, setOutsideChosen] = useState(false);
  const outside = outsideChosen || (!!String(value || '').trim() && !listed);
  if (!barangays.length) return <TextInput placeholder={labels.typePlaceholder} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />;
  return (
    <>
      <Select
        {...rest}
        value={outside ? OUTSIDE : barangays.find((b) => b.toLowerCase() === String(value || '').trim().toLowerCase()) || ''}
        onChange={(e) => {
          const v = e.target.value;
          setOutsideChosen(v === OUTSIDE);
          // Switching to "outside" clears the barangay for a name to be typed.
          onChange(v === OUTSIDE ? (listed ? '' : value) : v);
        }}
      >
        <option value="">{labels.choose}</option>
        {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
        <option value={OUTSIDE}>{labels.outside}</option>
      </Select>
      {outside && (
        <TextInput
          className="mt-2"
          aria-label={labels.outsideName}
          placeholder={labels.outsideName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={outsideChosen && !value}
        />
      )}
    </>
  );
}

/**
 * The GKK: the chosen barangay's GKKs first (`labels.here(barangay)`), then
 * the others (`labels.others`); with no barangay chosen, or one outside the
 * parish, every GKK in one list. A GKK already set that's no longer listed
 * stays choosable.
 */
export function GkkSelect({ value, onChange, names, barangay, barangayOf, labels, ...rest }) {
  const all = value && !names.includes(value) ? [value, ...names] : names;
  const { here, others } = gkksByBarangay(all, barangay, barangayOf);
  const option = (g) => <option key={g} value={g}>{g}</option>;
  return (
    <Select {...rest} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{labels.choose}</option>
      {here.length ? (
        <>
          <optgroup label={labels.here(barangay)}>{here.map(option)}</optgroup>
          {others.length > 0 && <optgroup label={labels.others}>{others.map(option)}</optgroup>}
        </>
      ) : others.map(option)}
    </Select>
  );
}
