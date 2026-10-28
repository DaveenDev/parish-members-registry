import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, PageBody, Tabs, ViewOnlyNote } from '../../components/admin.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { ViewOnlyProvider } from '../../components/panels.jsx';
import MassScheduleTab from '../../components/website/MassScheduleTab.jsx';
import SacramentGuidesTab from '../../components/website/SacramentGuidesTab.jsx';
import AnnouncementsTab from '../../components/website/AnnouncementsTab.jsx';
import ArticlesTab from '../../components/website/ArticlesTab.jsx';
import BulletinTab from '../../components/website/BulletinTab.jsx';
import EventsTab from '../../components/website/EventsTab.jsx';
import OfficeTab from '../../components/website/OfficeTab.jsx';
import HistoryTab from '../../components/website/HistoryTab.jsx';
import DownloadsTab from '../../components/website/DownloadsTab.jsx';

// Ordered by how often the secretary updates each: weekly items first, the
// office details (which almost never change) last. The first tab is also the
// one the page opens on. The last item is the website page that shows it, for
// "Visit website".
const TABS = [
  ['announcements', 'Announcements', AnnouncementsTab, '/pahibalo'],
  ['bulletin', 'Bulletin', BulletinTab, '/pahibalo'],
  ['events', 'Events', EventsTab, '/pahibalo'],
  ['articles', 'Blog Articles', ArticlesTab, '/komunidad/artikulo'],
  ['mass', 'Mass Schedule', MassScheduleTab, '/simbahan'],
  ['sacraments', 'Sacraments', SacramentGuidesTab, '/simbahan'],
  ['history', 'History', HistoryTab, '/simbahan/kasaysayan'],
  ['downloads', 'Downloads', DownloadsTab, '/downloads'],
  ['office', 'Office & Contact', OfficeTab, '/kontak'],
];

/** Everything the parish secretary keeps up to date for the public website, one tab per kind. */
export default function Website() {
  const [params, setParams] = useSearchParams();
  const current = TABS.find(([k]) => k === params.get('tab')) || TABS[0];
  const setTab = (k) => setParams(k === TABS[0][0] ? {} : { tab: k }, { replace: true });
  const Tab = current[2];
  const { user } = useAuth();

  return (
    <>
      <PageHeader title="Parish Website" subtitle="Schedules, guides, news, downloads and contact details for parishioners">
        {/* The website is this same site, so this opens the one being edited (the demo site's on the demo site). */}
        <a
          href={current[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-parish-fill text-white font-bold text-[14px] shadow-btn no-underline transition hover:-translate-y-px"
        >
          Visit website<span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
        </a>
      </PageHeader>
      <PageBody>
        {!can(user, 'editWebsite') && <ViewOnlyNote />}
        <Tabs tabs={TABS.map(([k, label]) => [k, label])} value={current[0]} onChange={setTab} />
        <ViewOnlyProvider value={!can(user, 'editWebsite')}>
          <Tab key={current[0]} />
        </ViewOnlyProvider>
      </PageBody>
    </>
  );
}
