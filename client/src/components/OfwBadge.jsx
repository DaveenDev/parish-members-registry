import React from 'react';
import { Badge } from './ui.jsx';

/**
 * The OFW household badge (0121): a household with a current member abroad
 * now, with how many when 2 or more ("OFW ×2"). Nothing for a household with
 * none abroad (a former OFW household isn't badged).
 */
export default function OfwBadge({ count }) {
  const n = Number(count) || 0;
  if (!n) return null;
  return (
    <Badge tone="blue" title={n === 1 ? 'A member works abroad (OFW)' : `${n} members work abroad (OFW)`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden className="mr-1">
        <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      OFW{n > 1 ? ` ×${n}` : ''}
    </Badge>
  );
}
