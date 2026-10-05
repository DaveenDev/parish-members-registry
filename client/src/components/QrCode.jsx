import React from 'react';
import qrcode from 'qrcode-generator';

/**
 * A QR code drawn as one SVG path, made in the browser: crisp on paper and
 * photocopies, and the link (with a family's census code) never goes to an
 * outside QR service. `size` is the printed width in CSS units.
 */
export default function QrCode({ value, size = '25mm', title }) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2; // the white border scanners need around the code
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  const box = n + quiet * 2;
  return (
    <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label={title || 'QR code'} style={{ flex: 'none', display: 'block' }}>
      <rect width={box} height={box} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
