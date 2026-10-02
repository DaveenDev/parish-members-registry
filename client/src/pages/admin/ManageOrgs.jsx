import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, Tabs } from '../../components/admin.jsx';
import { ManageListCard } from '../../components/ManageList.jsx';

const TABS = [['ministries', 'Ministries'], ['structure', 'Parish Organization Structure'], ['lay', 'Lay Organizations']];

/** The staff-managed name lists registrants pick from, one tab each (?tab=). */
export default function ManageOrgs() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : TABS[0][0];

  return (
    <>
      <PageHeader title="Ministries & Organizations" subtitle="Parish ministries, parish positions and the lay organizations active in the parish" />
      <PageBody>
        <div className="max-w-[720px]">
          <Tabs tabs={TABS} value={tab} onChange={(k) => setParams({ tab: k }, { replace: true })} />
          {tab === 'ministries' && (
            <ManageListCard
              key="ministries"
              heading="Parish Ministries"
              description="Liturgical and service ministries offered by the parish. Registrants can tick the ones they serve in."
              itemNoun="ministry"
              listFn={api.listMinistries} addFn={api.addMinistry} renameFn={api.renameMinistry} deleteFn={api.deleteMinistry}
            />
          )}
          {tab === 'structure' && (
            <ManageListCard
              key="structure"
              heading="Parish Organization Structure"
              description="Parish-level positions (e.g. PPC President, GKK Cluster Head, FLA Coordinator). Registrants pick from this list under “Katungdanan sa Parish”. A position held by a member cannot be deleted."
              itemNoun="position" placeholder="New position (e.g. PPC Officer)"
              listFn={api.listParishPositions} addFn={api.addParishPosition} renameFn={api.renameParishPosition} deleteFn={api.deleteParishPosition}
              lockInUse
            />
          )}
          {tab === 'lay' && (
            <ManageListCard
              key="lay"
              heading="Lay Organizations"
              description="Lay organizations and movements active in the parish (e.g. CFC, Knights of Columbus). Registrants can tick the ones they belong to."
              itemNoun="organization"
              listFn={api.listOrganizations} addFn={api.addOrganization} renameFn={api.renameOrganization} deleteFn={api.deleteOrganization}
            />
          )}
        </div>
      </PageBody>
    </>
  );
}
