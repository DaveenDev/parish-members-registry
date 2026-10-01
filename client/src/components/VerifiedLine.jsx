import React from 'react';
import { fmtDateTime } from '../constants.js';

/** "Verified by {name}, {when}" text for a household, or '' when it isn't verified. */
export function verifiedText(h) {
  if (h?.status !== 'Verified') return '';
  // Households verified before the 0010 migration have no record of who or when.
  if (!h.verified_at) return 'Verified before tracking began';
  return `Verified by ${h.verified_by_name || 'a staff member'}, ${fmtDateTime(h.verified_at)}`;
}

/** Who verified a household and when, under its status. Renders nothing for Pending households. */
export function VerifiedLine({ household, className = '' }) {
  const text = verifiedText(household);
  return text ? <div className={className}>{text}</div> : null;
}
