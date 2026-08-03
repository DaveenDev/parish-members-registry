import React from 'react';
import { api } from '../../api.js';
import GroupDirectory from '../../components/GroupDirectory.jsx';

export default function Organizations() {
  return <GroupDirectory title="Organizations" subtitle="Lay organizations and movements" listFn={api.listOrganizations} />;
}
