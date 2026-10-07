import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Developer credit. By default it floats in the bottom-right corner; `inline`
 * renders it in the normal page flow instead, for screens with their own
 * fixed bottom bar (the registration wizard) where a floating badge would sit
 * on top of the main button on phones.
 */
export default function CreditFooter({ dark = false, inline = false }) {
  const link = (
    <Link
      to="/developer"
      target="_blank"
      rel="noopener"
      className={`text-[11.5px] font-medium px-2.5 py-1.5 rounded-full backdrop-blur transition ${
        inline ? 'inline-block' : 'fixed bottom-3 right-3 z-40'
      } ${dark ? 'bg-white/10 text-white/70 hover:text-white' : 'bg-black/5 text-parish-muted hover:text-parish-blue'}`}
    >
      Built For Free by DaveenDev
    </Link>
  );
  return inline ? <div className="text-center pt-6">{link}</div> : link;
}
