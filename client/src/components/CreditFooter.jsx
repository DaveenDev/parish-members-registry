import React from 'react';

export default function CreditFooter({ dark = false }) {
  return (
    <a
      href="https://github.com/DaveenDev"
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed bottom-3 right-3 z-40 text-[11.5px] font-medium px-2.5 py-1.5 rounded-full backdrop-blur transition ${
        dark ? 'bg-white/10 text-white/70 hover:text-white' : 'bg-black/5 text-parish-muted hover:text-parish-blue'
      }`}
    >
      Built by DaveenDev
    </a>
  );
}
