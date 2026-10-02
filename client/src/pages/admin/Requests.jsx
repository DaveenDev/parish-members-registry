import React from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { PageHeader, PageBody, Tabs, ViewOnlyNote } from '../../components/admin.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import CertificatesTab from '../../components/requests/CertificatesTab.jsx';
import PrayerTab from '../../components/requests/PrayerTab.jsx';
import BloodRequestsTab from '../../components/requests/BloodRequestsTab.jsx';
import SacramentsTab from '../../components/requests/SacramentsTab.jsx';

const TABS = [
  ['certificates', 'Certificates', CertificatesTab, (c) => c.certificates + c.ready],
  ['sacraments', 'Sacraments', SacramentsTab, (c) => c.sacraments || 0],
  ['prayers', 'Prayer Requests', PrayerTab, (c) => c.prayers],
  ['blood', 'Blood Requests', BloodRequestsTab, (c) => c.blood],
];

/** Staff queues for what parishioners ask the parish office for. */
export default function Requests() {
  const [params, setParams] = useSearchParams();
  const layout = useOutletContext();
  const counts = layout?.requestCounts;
  const current = TABS.find(([k]) => k === params.get('tab')) || TABS[0];
  const setTab = (k) => setParams(k === TABS[0][0] ? {} : { tab: k }, { replace: true });
  const Tab = current[2];
  const { user } = useAuth();

  const tabs = TABS.map(([k, label, , countOf]) => {
    const n = counts ? countOf(counts) : 0;
    return [k, n ? `${label} (${n})` : label];
  });

  return (
    <>
      <PageHeader title="Requests" subtitle="Certificates, sacraments, prayer intentions and blood calls from parishioners" />
      <PageBody>
        {!can(user, 'editRequests') && <ViewOnlyNote />}
        <Tabs tabs={tabs} value={current[0]} onChange={setTab} />
        <Tab key={current[0]} onCountsChanged={() => layout?.refreshRequestCounts?.()} />
      </PageBody>
    </>
  );
}
