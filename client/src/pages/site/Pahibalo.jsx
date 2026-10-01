import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DataState, EmptyNote, Eyebrow, PageTitle, Pills, Segmented, Skeleton, Skeletons } from '../../components/site/kit.jsx';
import { AnnouncementCard } from '../../components/site/cards.jsx';
import { ANNOUNCEMENT_LABELS, fmtLong } from '../../lib/site.js';
import { listState, useAnnouncements, useBulletins } from './data.js';

const CATEGORY_FILTERS = [['all', 'Tanan'], ['Parish', 'Parokya'], ['GKK', 'GKK'], ['Ministry', 'Ministry'], ['Schedule change', ANNOUNCEMENT_LABELS['Schedule change']], ['urgent', 'Urgent']];

/** Mga Pahibalo: announcements by category, and the weekly bulletin archive. */
export default function Pahibalo() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'bulletin' ? 'bulletin' : 'list';
  const setView = (v) => setParams(v === 'bulletin' ? { view: 'bulletin' } : {}, { replace: true });

  return (
    <main className="px-3.5 pt-4 pb-7 animate-fadeUp">
      <Eyebrow>Mga Pahibalo</Eyebrow>
      <PageTitle>Balita sa parokya</PageTitle>
      <Segmented label="Pahibalo" options={[['list', 'Mga Pahibalo'], ['bulletin', 'Bulletin']]} value={view} onChange={setView} />
      {view === 'list' ? <Announcements /> : <Bulletins />}
    </main>
  );
}

function Announcements() {
  const ann = listState(useAnnouncements());
  const [cat, setCat] = useState('all');
  const shown = ann.rows.filter((a) => cat === 'all' || (cat === 'urgent' ? a.urgent : a.category === cat));
  // Only offer the categories that have something in them.
  const filters = CATEGORY_FILTERS.filter(([v]) => v === 'all' || ann.rows.some((a) => (v === 'urgent' ? a.urgent : a.category === v)));

  return (
    <>
      {filters.length > 2 && <Pills scroll className="mb-3.5" options={filters} value={cat} onChange={setCat} />}
      <DataState
        state={ann}
        skeleton={<Skeletons n={2} h={120} />}
        errorText="Wala ma-load ang mga pahibalo."
        empty={ann.empty}
        emptyText="Wala pay pahibalo. Balik lang sunod semana."
      >
        <div className="flex flex-col gap-2.5">{shown.map((a) => <AnnouncementCard key={a.id} a={a} full />)}</div>
      </DataState>
    </>
  );
}

function Bulletins() {
  const bul = listState(useBulletins());
  return (
    <>
      <p className="m-0 mb-3 text-[15px] leading-normal text-[#4d4636]">Ang semanal nga bulletin sa parokya. Basaha diri.</p>
      <DataState state={bul} skeleton={<Skeleton h={220} />} errorText="Wala ma-load ang bulletin." empty={bul.empty} emptyText="Wala pay bulletin nga gi-publish.">
        {!bul.rows.length ? <EmptyNote /> : (
          <div className="bg-parish-card border border-parish-border rounded-2xl overflow-hidden">
            {bul.rows.map((b) => (
              <div key={b.id} className="flex items-center gap-2.5 py-3 pr-3 pl-3.5 border-b border-[#f0e8d6] last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="font-serif text-[20px] font-bold text-parish-navy leading-tight">{b.title}</div>
                  <div className="text-[13.5px] text-parish-text2">{fmtLong(b.week_of)}</div>
                </div>
                <Link to={`/pahibalo/bulletin/${b.id}`} className="min-h-[44px] px-3 inline-flex items-center rounded-[10px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[14px]">
                  Basaha
                </Link>
              </div>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}
