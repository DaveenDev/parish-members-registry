import React, { Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataState, EmptyNote, ErrorNote, Pills, Skeleton } from './kit.jsx';
import { listState, useOrgChart, useOrgCharts, useParishOrgCharts } from '../../pages/site/data.js';
import { isKaabagChart } from '../../lib/kaabag.js';

// d3 is heavy: the chart loads only when one is shown.
const OrgChartView = React.lazy(() => import('./OrgChartView.jsx'));

// The built-in charts' names in Bisaya. Church Structure keeps a name staff
// gave it in Rename; only the default English title is translated.
export function chartLabel(c) {
  if (c.scope === 'gkk') return 'Estruktura sa GKK';
  if (c.title === 'Church Structure') return 'Estruktura sa Parokya';
  if (isKaabagChart(c) && c.title === 'Kaabag Structure') return 'Estruktura sa Kaabag';
  return c.title;
}

/**
 * The published org charts (Ang Simbahan → Organisasyon), one pill each;
 * the GKK Structure without names. `slug` is the chart asked for (else the
 * first), `onPick` changes it. The Kaabag Structure is on the Kaabag page.
 */
export function Organisasyon({ slug, onPick }) {
  const list = listState(useParishOrgCharts());
  const current = list.rows.find((c) => c.slug === slug) || list.rows[0];
  return (
    <DataState
      state={list}
      skeleton={<Skeleton h={480} />}
      errorText="Wala ma-load ang estruktura sa organisasyon."
      empty={list.empty}
      emptyText="Wala pay gi-publish nga estruktura sa organisasyon. Pangutana sa opisina sa parokya."
    >
      {list.rows.length > 1 && <Pills scroll options={list.rows.map((c) => [c.slug, chartLabel(c)])} value={current?.slug} onChange={onPick} className="mb-4" />}
      {current && <OrgChartBlock key={current.slug} chart={current} />}
    </DataState>
  );
}

/** The published Kaabag Structure ({ title, slug, scope }), or null while it isn't. */
export const useKaabagChart = () => (useOrgCharts().data || []).find(isKaabagChart) || null;

/** The Kaabag Structure on the Kaabag page, with its officers' names and photos. */
export function KaabagChart({ chart }) {
  const q = useOrgChart(chart.slug);
  if (q.loading) return <Skeleton h={460} />;
  if (q.error) return <ErrorNote onRetry={q.reload}>Wala ma-load ang estruktura.</ErrorNote>;
  if (!q.data?.nodes?.length) return <EmptyNote>Wala pay sulod kini nga estruktura.</EmptyNote>;
  return (
    <Suspense fallback={<Skeleton h={460} />}>
      <OrgChartView nodes={q.data.nodes} height={460} fileName={chart.slug} />
    </Suspense>
  );
}

function OrgChartBlock({ chart }) {
  const q = useOrgChart(chart.slug);
  const gkk = chart.scope === 'gkk';
  return (
    <Card className="p-3.5 lg:p-5 lg:rounded-[20px]">
      <h3 className="font-serif font-semibold text-[24px] lg:text-[30px] leading-tight m-0 mb-2 text-parish-navy">{chartLabel(chart)}</h3>
      {gkk && (
        <p className="m-0 mb-3 text-[14.5px] text-[#4d4636]">
          Pareho kini nga estruktura sa matag GKK. Ang mga opisyal makita sa panid sa matag GKK.{' '}
          <Link to="/komunidad?view=gkk" className="font-semibold text-parish-blueDeep hover:underline">Tan-awa ang mga GKK →</Link>
        </p>
      )}
      {q.loading ? <Skeleton h={480} />
        : q.error ? <ErrorNote onRetry={q.reload}>Wala ma-load ang estruktura.</ErrorNote>
          : !q.data?.nodes?.length ? <EmptyNote>Wala pay sulod kini nga estruktura.</EmptyNote>
            : (
              <Suspense fallback={<Skeleton h={480} />}>
                <OrgChartView nodes={q.data.nodes} showHolders={!gkk} fileName={chart.slug} />
              </Suspense>
            )}
    </Card>
  );
}

/** "Mga Opisyal" on a GKK's page: the GKK Structure with this GKK's officers, once it's published. */
export function GkkOfficers({ gkk }) {
  const structure = (useOrgCharts().data || []).find((c) => c.scope === 'gkk');
  const q = useOrgChart(structure?.slug, gkk);
  if (!structure || !q.data?.nodes?.length) return null;
  return (
    <section aria-labelledby="gkk-officers-title" className="mt-9 lg:mt-12">
      <h2 id="gkk-officers-title" className="font-serif font-semibold text-[26px] lg:text-[34px] m-0 mb-3 lg:mb-4 text-parish-navy">Mga Opisyal</h2>
      <Suspense fallback={<Skeleton h={400} />}>
        <OrgChartView nodes={q.data.nodes} height={420} fileName={`opisyal-${gkk}`} />
      </Suspense>
    </section>
  );
}
