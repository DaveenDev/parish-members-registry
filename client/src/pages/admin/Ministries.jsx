import React from 'react';
import { api } from '../../api.js';
import GroupDirectory from '../../components/GroupDirectory.jsx';

export default function Ministries() {
  return <GroupDirectory title="Ministries" subtitle="Liturgical and service ministries" listFn={api.listMinistries} memberKey="ministries" />;
}
