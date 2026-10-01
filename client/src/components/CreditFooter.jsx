import React from 'react';

/**
 * Developer credit. By default it floats in the bottom-right corner; `inline`
 * renders it in the normal page flow instead, for screens with their own
 * fixed bottom bar (the registration wizard) where a floating badge would sit
 * on top of the main button on phones.
 */
export default function CreditFooter({ dark = false, inline = false }) {
  const link = (
    <a
      href="https://github.com/DaveenDev"
      target="_blank"
      rel="noopener noreferrer"
      className={`text-[11.5px] font-medium px-2.5 py-1.5 rounded-full backdrop-blur transition ${
        inline ? 'inline-block' : 'fixed bottom-3 right-3 z-40'
      } ${dark ? 'bg-white/10 text-white/70 hover:text-white' : 'bg-black/5 text-parish-muted hover:text-parish-blue'}`}
    >
      Built by DaveenDev
    </a>
  );
  return inline ? <div className="text-center pt-6">{link}</div> : link;
}
