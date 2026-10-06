import React from 'react';
import { BAND_PAD, Band, PageHeader, WRAP } from '../../components/site/kit.jsx';
import DailyReadings from '../../components/site/DailyReadings.jsx';
import { useSiteTitle } from './SiteLayout.jsx';

/**
 * /simbahan/pagbasa: the day's Mass readings on a page of their own, opened
 * from the Bible verse on Ang Simbahan. The card (DailyReadings) has the
 * readings, the day switch and the Universalis notice.
 */
export default function Pagbasa() {
  useSiteTitle('Mga Pagbasa');
  return (
    <main className="animate-fadeUp">
      <Band as="div">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <PageHeader eyebrow="Mga Pagbasa sa Misa" title="Daily Readings" />
          <p className="m-0 mb-4 lg:mb-6 text-[15px] lg:text-[16.5px] leading-normal text-[#4d4636] lg:max-w-[760px]">
            Ang mga pagbasa sa Misa karong adlawa: ang Ebanghelyo, ang Unang Pagbasa, ang Salmo ug, kon Domingo o dakong kapistahan, ang Ikaduhang Pagbasa.
          </p>
          <DailyReadings />
        </div>
      </Band>
    </main>
  );
}
