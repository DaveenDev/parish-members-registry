import React from 'react';
import { api } from '../../api.js';
import ManageList from '../../components/ManageList.jsx';

export default function ManageMinistries() {
  return (
    <ManageList
      title="Parish Ministries" subtitle="Liturgical and service ministries offered by the parish" itemNoun="ministry"
      listFn={api.listMinistries} addFn={api.addMinistry} renameFn={api.renameMinistry} deleteFn={api.deleteMinistry}
    />
  );
}
