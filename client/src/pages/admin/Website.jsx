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

// Ordered by how often the secretary updates each: weekly items first, the
// office details (which almost never change) last. The first tab is also the
// one the page opens on.
const TABS = [
  ['announcements', 'Announcements', AnnouncementsTab],
  ['bulletin', 'Bulletin', BulletinTab],
  ['events', 'Events', EventsTab],
  ['articles', 'Blog Articles', ArticlesTab],
  ['mass', 'Mass Schedule', MassScheduleTab],
  ['sacraments', 'Sacraments', SacramentGuidesTab],
  ['office', 'Office & Contact', OfficeTab],
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
      <PageHeader title="Parish Website" subtitle="Schedules, guides, news and contact details for parishioners" />
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
