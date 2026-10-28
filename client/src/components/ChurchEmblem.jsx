/**
 * The parish emblem: a church with a cross on its roof. Shows wherever the
 * parish hasn't uploaded a logo yet (sign-in, sidebar, registration portal).
 * Keep in step with the `pi-cross` symbol in site/Icons.jsx, favicon.svg and
 * the PNGs in public/icons.
 */
export default function ChurchEmblem({ size = 26, strokeWidth = 1.8, className }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden>
      <path d="M20 3v9M16.5 6.5h7" />
      <path d="M8 21.5L20 12l12 9.5" />
      <path d="M11 19.5V35h18V19.5" />
      <path d="M16.5 35v-6a3.5 3.5 0 0 1 7 0v6" />
      <path d="M6 35h28" />
    </svg>
  );
}
