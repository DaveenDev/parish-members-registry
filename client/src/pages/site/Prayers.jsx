import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, EmptyNote, ErrorNote, INNER, PageHeader, Pills, Skeleton, Skeletons, WRAP, useShare } from '../../components/site/kit.jsx';
import { PrayButton, PrayerCard, PrayerChip } from '../../components/site/prayers.jsx';
import { fmtLong } from '../../lib/site.js';
import { excerpt } from '../../lib/seo.js';
import { PRAYER_FORM, PRAYER_TYPES, PRAYER_WALL, prayerFrom, prayerTitle, prayerTypeLabel } from '../../lib/prayers.js';
import { Body } from './Details.jsx';
import { PageMeta, useSiteTitle } from './SiteLayout.jsx';
import { listState, usePrayerRequest, usePrayerWall } from './data.js';

const GRID = 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4';

/** Mga Hangyo sa Pag-ampo (/komunidad/pag-ampo): every request showing today, newest first, by kind. */
export default function PrayerWall() {
  useSiteTitle('Pag-ampo');
  const q = listState(usePrayerWall());
  const [type, setType] = useState('All');
  // Only the kinds there are, and the choice only when there's more than one.
  const kinds = PRAYER_TYPES.filter((t) => q.rows.some((r) => r.type === t));
  const shown = type === 'All' || !kinds.includes(type) ? q.rows : q.rows.filter((r) => r.type === type);

  return (
    <main className="animate-fadeUp">
      <Band as="div">
        <div className={`${WRAP} ${BAND_PAD} flow-root`}>
          <PageHeader eyebrow="Komunidad" title="Mga Hangyo sa Pag-ampo">
            <BigButton to={PRAYER_FORM} className="lg:w-auto lg:px-7 mb-1"><Icon name="heart" />Ipadala ang imong hangyo</BigButton>
          </PageHeader>
          <p className="m-0 mt-3 lg:mt-0 max-w-[720px] text-[16px] lg:text-[17px] leading-relaxed text-[#3f3b2f]">
            Mag-ampo kita alang sa usag usa. Kini ang mga hangyo nga gusto sa mga parokyano nga ipaambit. Ampoan sila sa pari ug sa parokya; i-tap ang <strong>Nag-ampo ko</strong> kung nakaampo ka na alang niini.
          </p>
        </div>
      </Band>

      <section aria-label="Mga hangyo" className={`${WRAP} pt-5 pb-7 lg:pt-9 lg:pb-12`}>
        {q.loading ? (
          <div className={GRID}>{[0, 1, 2].map((i) => <Skeleton key={i} h={210} />)}</div>
        ) : q.error ? (
          <ErrorNote onRetry={q.reload}>Wala ma-load ang mga hangyo sa pag-ampo.</ErrorNote>
        ) : q.empty ? (
          <div className="text-center py-8">
            <EmptyNote>Wala pay hangyo sa pag-ampo nga gipakita karon.</EmptyNote>
            <BigButton to={PRAYER_FORM} variant="secondary" className="max-w-[360px] mx-auto">Ipadala ang imong hangyo</BigButton>
          </div>
        ) : (
          <>
            {kinds.length > 1 && (
              <Pills
                className="mb-4"
                scroll
                options={[['All', `Tanan (${q.rows.length})`], ...kinds.map((t) => [t, prayerTypeLabel(t)])]}
                value={type}
                onChange={setType}
              />
            )}
            <div className={GRID}>{shown.map((r) => <PrayerCard key={r.id} r={r} />)}</div>
          </>
        )}
        <p className="m-0 mt-6 flex gap-2 items-start text-[13.5px] leading-[1.45] text-parish-text2 max-w-[720px]">
          <Icon name="lock" size={15} className="flex-none mt-0.5" />
          Makita lang ang usa ka hangyo kung mouyon ang nangayo ug human kini susihon sa kawani, hangtod sa petsa nga ilang gipili. Ang ngalan makita lang kung kini ilang gipili; ang mobile number dili gyud.
        </p>
      </section>
    </main>
  );
}

/** One request's own page (/komunidad/pag-ampo/:id), to share; gone once its last day has passed. */
export function PrayerDetail() {
  const { id } = useParams();
  useSiteTitle('Pag-ampo');
  const share = useShare();
  const q = usePrayerRequest(id);
  const READING = `${INNER} lg:max-w-[760px]`;

  if (q.loading) return <main className={READING}><Skeletons n={3} h={90} /></main>;
  if (q.error) return <main className={READING}><ErrorNote onRetry={q.reload}>Wala ma-load.</ErrorNote></main>;
  const r = q.data;
  if (!r) {
    return (
      <main className={READING}>
        <PageMeta noindex />
        <EmptyNote>Wala na kini nga hangyo sa website. Makita lang ang mga hangyo sa pag-ampo hangtod sa petsa nga gipili sa nangayo.</EmptyNote>
        <BigButton variant="secondary" to={PRAYER_WALL}>Tanang hangyo sa pag-ampo</BigButton>
      </main>
    );
  }

  const title = prayerTitle(r);
  return (
    <main className={READING}>
      {/* Personal, and gone after its last day: shared by link, not listed by search engines. */}
      <PageMeta title={`Hangyo sa pag-ampo: ${title}`} description={excerpt(r.intention)} noindex />
      <div className="flex gap-2 items-center mb-2 flex-wrap">
        <PrayerChip r={r} />
        <span className="text-[13.5px] lg:text-[14.5px] text-parish-text2">{prayerFrom(r)} · {fmtLong(r.date)}</span>
      </div>
      <h1 className="font-serif font-semibold text-[31px] lg:text-[46px] leading-[1.1] lg:leading-[1.06] m-0 mb-3.5 lg:mb-5 text-parish-navy [overflow-wrap:anywhere]">{title}</h1>
      <Body text={r.intention} />
      {r.offered_on && (
        <div className="flex gap-2 items-center mb-3 text-[15px] text-parish-ok font-semibold"><Icon name="church" size={18} />Giampo sa Misa niadtong {fmtLong(r.offered_on)}</div>
      )}
      <div className="my-5"><PrayButton r={r} big /></div>
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-5">
        <BigButton variant="secondary" className="lg:w-auto lg:px-6" onClick={() => share(`Hangyo sa pag-ampo: ${title}`)}><Icon name="share" size={18} />Ipaambit</BigButton>
        <Link to={PRAYER_WALL} className="min-h-[44px] inline-flex items-center justify-center font-bold text-[15px] text-parish-blue">Tanang hangyo sa pag-ampo</Link>
        <Link to={PRAYER_FORM} className="min-h-[44px] inline-flex items-center justify-center font-bold text-[15px] text-parish-blue">Ipadala ang imong hangyo</Link>
      </div>
      <p className="m-0 mt-5 text-[13.5px] text-parish-text2">Makita kini hangtod {fmtLong(r.show_until)}.</p>
    </main>
  );
}
