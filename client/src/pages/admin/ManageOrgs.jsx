import React from 'react';
import { api } from '../../api.js';
import ManageList from '../../components/ManageList.jsx';

export default function ManageOrgs() {
  return (
    <ManageList
      title="Parish Organizations" subtitle="Lay organizations and movements active in the parish" itemNoun="organization"
      listFn={api.listOrganizations} addFn={api.addOrganization} renameFn={api.renameOrganization} deleteFn={api.deleteOrganization}
    />
  );
}
