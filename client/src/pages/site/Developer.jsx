import React from 'react';
import { BigButton, INNER } from '../../components/site/kit.jsx';
import { Icon } from '../../components/site/Icons.jsx';
import { useSiteTitle } from './SiteLayout.jsx';

// The developer credit ("Built For Free by DaveenDev") opens this page.
// Phones: the photo on top. Desktop: the photo on the left, the text beside it.
const SITE = 'https://daveendev.vercel.app';
const EMAIL = 'daveendev07@gmail.com';

const ext = { target: '_blank', rel: 'noopener noreferrer' };

export default function Developer() {
  useSiteTitle('Developer');
  return (
    <main className={`${INNER} md:max-w-[1000px] md:mx-auto lg:pt-10`}>
      <div className="bg-parish-card rounded-[22px] shadow-card overflow-hidden md:grid md:grid-cols-2">
        <img
          src="/developer.webp"
          alt="DaveenDev"
          width="720"
          height="720"
          className="block w-full aspect-square object-cover md:h-full"
        />
        <div className="px-6 pt-6 pb-7 text-center md:text-left md:px-9 md:py-10 lg:px-12 md:flex md:flex-col md:justify-center">
          <div className="text-[12.5px] font-bold tracking-[.14em] uppercase text-parish-gold">Web Developer</div>
          <h1 className="font-serif font-semibold text-[36px] lg:text-[48px] leading-tight m-0 mt-1 text-parish-navy">DaveenDev</h1>
          <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-1.5 mt-1.5 text-[15.5px] text-parish-blue hover:underline break-all">
            <Icon name="mail" size={18} /> {EMAIL}
          </a>

          <p className="m-0 mt-7 mb-4 font-serif text-[24px] lg:text-[28px] font-semibold text-parish-navy">Naa ka pabuhat nga website?</p>
          <div className="flex flex-col gap-2.5">
            <BigButton href={`${SITE}/contact`} {...ext}>Message me</BigButton>
            <BigButton href={SITE} variant="secondary" {...ext}>Know my other services</BigButton>
          </div>
        </div>
      </div>
    </main>
  );
}
