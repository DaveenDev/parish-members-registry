import React, { useState } from 'react';

/**
 * A module's screenshot from the PRO demo (client/public/pro/<id>.webp, lazy
 * loaded). Until the picture is there, a quiet tile with the module's number
 * stands in, so nothing looks broken.
 */
export default function ModuleShot({ module: m, className = '' }) {
  const [missing, setMissing] = useState(false);
  return (
    <div className={`relative overflow-hidden rounded-xl border border-parish-border bg-parish-sunk aspect-[16/10] ${className}`}>
      {missing ? (
        <div className="absolute inset-0 flex items-center justify-center font-serif text-[34px] font-semibold text-parish-muted/60" aria-hidden>{m.no}</div>
      ) : (
        <img
          src={`/pro/${m.id}.webp`} alt={`${m.name}, from the PRO demo`} loading="lazy" decoding="async"
          onError={() => setMissing(true)} className="w-full h-full object-cover object-top"
        />
      )}
    </div>
  );
}
