import React from 'react';

/**
 * Star Border, from React Bits (https://reactbits.dev/animations/star-border),
 * reworked for a button the site already styles: two soft gold lights run
 * slowly along the top and bottom edges of what it wraps, on a thin darker
 * rim. Licence in reactBits.js.
 *
 * The lights are clipped in their own layer, not by the wrapper, so the
 * button's shadow and focus ring still show. `className` sizes the wrapper
 * (it is the flex item or block in place of the button); `radius` matches
 * the button's corners. With "reduce motion" and in print, the lights are
 * left out and the rim stays.
 */
export default function StarBorder({ children, className = '', radius = '14px', speed = '6s' }) {
  return (
    <span className={`site-star-border ${className}`} style={{ borderRadius: radius, '--star-speed': speed }}>
      <span aria-hidden="true" className="site-star-border__track">
        <span className="site-star-border__star site-star-border__star--bottom" />
        <span className="site-star-border__star site-star-border__star--top" />
      </span>
      {children}
    </span>
  );
}
