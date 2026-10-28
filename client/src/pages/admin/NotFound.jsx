import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PageBody, EmptyState } from '../../components/admin.jsx';

/** A mistyped /admin/... address: say so inside the admin, with a way back. */
export default function AdminNotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <PageBody>
        <EmptyState title="There is no admin page at this address" subtitle="Check the link, or choose a page from the menu." />
        <div className="text-center">
          <Link to="/admin" className="font-semibold text-parish-blue text-[14.5px]">← Back to the Dashboard</Link>
        </div>
      </PageBody>
    </>
  );
}
