import React from 'react';
import { BigButton, INNER } from '../../components/site/kit.jsx';
import { Icon } from '../../components/site/Icons.jsx';
import { useSiteTitle } from './SiteLayout.jsx';

// The developer credit ("Built For Free by DaveenDev") opens this page.
const SITE = 'https://daveendev.vercel.app';
const EMAIL = 'daveendev07@gmail.com';

const ext = { target: '_blank', rel: 'noopener noreferrer' };

export default function Developer() {
  useSiteTitle('Developer');
  return (
    <main className={`${INNER} lg:max-w-[480px]`}>
      <div className="bg-parish-card rounded-[22px] shadow-card overflow-hidden text-center">
        <div className="h-[120px]" style={{ background: 'linear-gradient(135deg,var(--p-sidebar-a),var(--p-sidebar-b))' }} />
        <img
          src="/developer.webp"
          alt="DaveenDev"
          width="220"
          height="220"
          className="w-[200px] h-[200px] lg:w-[220px] lg:h-[220px] rounded-full object-cover mx-auto -mt-[100px] lg:-mt-[110px] border-[6px] border-parish-card bg-parish-card shadow-cardSm"
        />
        <div className="px-6 pt-4 pb-7">
          <div className="text-[12px] font-bold tracking-[.14em] uppercase text-parish-gold">Web Developer</div>
          <h1 className="font-serif font-semibold text-[34px] leading-tight m-0 mt-1 text-parish-navy">DaveenDev</h1>
          <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-1.5 mt-1.5 text-[15px] text-parish-blue hover:underline break-all">
            <Icon name="mail" size={17} /> {EMAIL}
          </a>

          <p className="m-0 mt-6 mb-3.5 font-serif text-[23px] font-semibold text-parish-navy">Naa ka pabuhat nga website?</p>
          <div className="flex flex-col gap-2.5">
            <BigButton href={`${SITE}/contact`} {...ext}>Message me</BigButton>
            <BigButton href={SITE} variant="secondary" {...ext}>Know my other services</BigButton>
          </div>
        </div>
      </div>
    </main>
  );
}
