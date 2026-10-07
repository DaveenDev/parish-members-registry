import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BigButton } from '../components/site/kit.jsx';

// The developer credit ("Built For Free by DaveenDev") opens this page. It
// stands on its own, outside the public site and the admin, so it reads the
// same from either and still opens while the site is under maintenance.
const SITE = 'https://daveendev.vercel.app';
const EMAIL = 'daveendev07@gmail.com';

const ext = { target: '_blank', rel: 'noopener noreferrer' };

export default function Developer() {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a link in the app: go back to it. Opened directly: go Home.
  const canGoBack = location.key !== 'default';

  useEffect(() => {
    const prev = document.title;
    document.title = 'DaveenDev · Developer';
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="min-h-screen bg-parish-bg flex flex-col">
      <div className="px-4 pt-4 lg:px-6">
        {canGoBack ? (
          <button type="button" onClick={() => navigate(-1)} className={BACK}>
            <Chevron /> Balik
          </button>
        ) : (
          <Link to="/" className={BACK}><Chevron /> Balik sa Home</Link>
        )}
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-8 animate-fadeUp">
        <div className="w-full max-w-[420px] bg-parish-card rounded-[22px] shadow-card overflow-hidden text-center">
          <div className="h-[92px]" style={{ background: 'linear-gradient(135deg,var(--p-sidebar-a),var(--p-sidebar-b))' }} />
          <img
            src="/developer.webp"
            alt="DaveenDev"
            width="148"
            height="148"
            className="w-[148px] h-[148px] rounded-full object-cover mx-auto -mt-[74px] border-[5px] border-parish-card bg-parish-card shadow-cardSm"
          />
          <div className="px-6 pt-4 pb-7">
            <div className="text-[12px] font-bold tracking-[.14em] uppercase text-parish-gold">Web Developer</div>
            <h1 className="font-serif font-semibold text-[32px] leading-tight m-0 mt-1 text-parish-navy">DaveenDev</h1>
            <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-1.5 mt-1.5 text-[14.5px] text-parish-blue hover:underline break-all">
              <MailIcon /> {EMAIL}
            </a>

            <p className="m-0 mt-6 mb-3.5 font-serif text-[22px] font-semibold text-parish-navy">Naa ka pabuhat nga website?</p>
            <div className="flex flex-col gap-2.5">
              <BigButton href={`${SITE}/contact`} {...ext}>Message me</BigButton>
              <BigButton href={SITE} variant="secondary" {...ext}>Know my other services</BigButton>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const BACK = 'inline-flex items-center gap-1 text-[14px] font-semibold text-parish-blueDeep hover:underline';

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden className="flex-none">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
