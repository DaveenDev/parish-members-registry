import React from 'react';

// Line icons for the sacrament guides, keyed by sacrament_guides.key (0011,
// 0019). Shared by the website's Mga Sakramento tabs and the admin
// Sacraments page. Drawn inline (not from the website's icon sprite) so they
// work on admin pages too.
const PATHS = {
  // A water drop over waves
  baptism: (
    <>
      <path d="M12 3s4.5 5 4.5 8.2a4.5 4.5 0 0 1-9 0C7.5 8 12 3 12 3z" />
      <path d="M3 20c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" />
    </>
  ),
  // A chalice with the host
  first_communion: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <path d="M6.5 9.5h11c0 3.3-2.5 5.5-5.5 5.5s-5.5-2.2-5.5-5.5z" />
      <path d="M12 15v4M8.5 21h7" />
    </>
  ),
  // The flame of the Holy Spirit
  confirmation: <path d="M12 3c3 3.5 5 6 5 9.5a5 5 0 0 1-10 0c0-2 1-3.5 2.5-5 .3 1.6 1 2.6 2 3 0-2.5-.2-5 .5-7.5z" />,
  // Two rings
  wedding: (
    <>
      <circle cx="9" cy="14" r="5" />
      <circle cx="15" cy="14" r="5" />
      <path d="M10.5 6.5L12 4l1.5 2.5" />
    </>
  ),
  // A cross on a hill
  funeral: (
    <>
      <path d="M12 3v11M8.5 6.5h7" />
      <path d="M4 21c2-3.5 5-5 8-5s6 1.5 8 5" />
    </>
  ),
  // Light
  blessing: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
    </>
  ),
  // A person with a cross
  ocia: (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M18.5 3.5v6M16 6h5" />
    </>
  ),
};

// A guide the office adds later gets a church.
const CHURCH = (
  <>
    <path d="M12 2v5M10 4h4" />
    <path d="M6 21V11l6-4 6 4v10" />
    <path d="M10 21v-4a2 2 0 0 1 4 0v4" />
    <path d="M3 21h18" />
  </>
);

export default function SacramentIcon({ sacrament, size = 20, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className}`} aria-hidden="true" focusable="false"
    >
      {PATHS[sacrament] || CHURCH}
    </svg>
  );
}
