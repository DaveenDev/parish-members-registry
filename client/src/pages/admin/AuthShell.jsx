import React from 'react';
import CreditFooter from '../../components/CreditFooter.jsx';

/**
 * The signed-out page frame — crest, parish name, and a card. Shared by sign
 * in, forgot password and reset password so the three cannot drift apart.
 */
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 font-sans"
      style={{ background: 'radial-gradient(130% 100% at 50% -20%,var(--p-sidebar-a) 0%,var(--p-sidebar-a) 45%,var(--p-sidebar-b) 100%)' }}
    >
      <div className="w-full max-w-[400px] animate-fadeUp">
        <div className="text-center mb-[26px] text-[var(--p-gold-light)]" style={{ marginBottom: '26px' }}>
          <svg viewBox="0 0 80 80" width="66" height="66" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" className="mx-auto mb-2">
            <circle cx="40" cy="38" r="30" stroke="rgba(228,192,106,.4)" />
            <path d="M40 14l3.2 9.6h10.1l-8.2 5.9 3.1 9.6-8.2-5.9-8.2 5.9 3.1-9.6-8.2-5.9h10.1z" />
            <path d="M40 46v18M31 55h18" />
          </svg>
          <div className="font-serif text-[25px] font-semibold text-white leading-tight">Our Lady of Guadalupe</div>
          <div className="text-[13px] tracking-[.14em] uppercase text-[var(--p-gold-light)]/90 mt-1.5">Members Registry · Admin</div>
        </div>
        <div className="bg-[#fffdf8] rounded-[20px] shadow-2xl px-7 py-[30px]" style={{ padding: '30px 28px' }}>
          <h1 className="font-serif text-[26px] font-semibold m-0 mb-1 text-parish-navy">{title}</h1>
          {subtitle && (
            <p className="text-[14px] text-parish-muted m-0 mb-[22px]" style={{ marginBottom: '22px' }}>{subtitle}</p>
          )}
          {children}
        </div>
      </div>
      <CreditFooter dark />
    </div>
  );
}
