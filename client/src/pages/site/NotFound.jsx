import React from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BigButton, INNER } from '../../components/site/kit.jsx';
import { useSiteTitle } from './SiteLayout.jsx';

/**
 * A public address that isn't a page (a mistyped or old shared link): say so,
 * instead of quietly landing on Home, and offer the usual ways on.
 */
export default function NotFound() {
  useSiteTitle('Wala makit-i');
  const { pathname } = useLocation();
  return (
    <main className={`${INNER} lg:max-w-[680px] text-center`}>
      <div className="w-[76px] h-[76px] rounded-full flex items-center justify-center mx-auto mt-4 mb-4 text-parish-blue" style={{ background: 'var(--p-blue-tint)' }}>
        <Icon name="search" size={36} />
      </div>
      <h1 className="font-serif font-semibold text-[32px] lg:text-[42px] leading-[1.1] m-0 mb-2 text-parish-navy">Wala makit-i kini nga panid</h1>
      <p className="m-0 mb-1 text-[15.5px] leading-normal text-[#4d4636]">
        Basin sayop ang pagkasulat sa link, o gikuha na kini nga panid.
      </p>
      <p className="m-0 mb-6 text-[13.5px] text-parish-text2 break-all">{pathname}</p>
      <div className="flex flex-col gap-2.5 lg:max-w-[420px] lg:mx-auto">
        <BigButton to="/">Balik sa Home</BigButton>
        <BigButton variant="secondary" to="/pahibalo">Tan-awa ang mga pahibalo</BigButton>
        <BigButton variant="secondary" to="/kontak">Kontaka ang opisina</BigButton>
      </div>
    </main>
  );
}
