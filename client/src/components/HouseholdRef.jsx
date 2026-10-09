import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import HouseholdViewDrawer from './HouseholdViewDrawer.jsx';

// Keys that activate a clickable row (rowActivationProps); kept from reaching it.
const ACTIVATE_KEYS = ['Enter', ' '];

/**
 * A household's reference number as a link: it opens the household's
 * read-only record (members, sacraments, census answers) in a side panel,
 * without leaving the page. Safe inside a clickable row: its clicks, and
 * the panel's, don't reach the row. Nothing without a reference number.
 */
export default function HouseholdRef({ id, refNo, name, className = '' }) {
  const [open, setOpen] = useState(false);
  if (!refNo) return null;
  return (
    // React events from the panel bubble through the portal to here: stop them at the link.
    <span
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (ACTIVATE_KEYS.includes(e.key)) e.stopPropagation(); }}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${name || 'household'} (${refNo})`}
        className={`appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue ${className}`}
      >
        {refNo}
      </button>
      {/* At the page's root, so the row's own text styles don't reach the panel. */}
      {open && createPortal(<HouseholdViewDrawer household={{ id, household_name: name, ref_no: refNo }} readOnly onClose={() => setOpen(false)} />, document.body)}
    </span>
  );
}
