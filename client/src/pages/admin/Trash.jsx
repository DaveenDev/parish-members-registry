import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, EmptyState, ErrorState, LoadingState, Panel } from '../../components/admin.jsx';
import { Badge } from '../../components/ui.jsx';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { fmtDateTime } from '../../constants.js';

const KEEP_DAYS = 30;

function daysLeft(deletedAt, now = Date.now()) {
  return Math.max(0, KEEP_DAYS - Math.floor((now - new Date(deletedAt).getTime()) / 86400000));
}

/** Deleted households and members, kept for 30 days so they can be put back. */
export default function Trash() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const layout = useOutletContext();
  const trash = useAsyncData(() => api.listTrash(), []);
  const [busyId, setBusyId] = useState(null);
  const rows = trash.data?.rows || [];

  async function restore(r) {
    setBusyId(r.id);
    try {
      const res = await api.restoreDeleted(r.id);
      toast.success(`${r.label} is back in the registry`, {
        action: { label: 'Open', onClick: () => navigate(res.kind === 'household' ? `/admin/households?status=All&q=${encodeURIComponent(r.label)}` : `/admin/members?q=${encodeURIComponent(r.label)}`) },
      });
      trash.reload();
      layout?.refreshNavCounts?.();
    } catch (e) {
      toast.error(e.message || 'Could not restore this');
    } finally {
      setBusyId(null);
    }
  }

  async function purge(r) {
    const ok = await confirm({
      title: `Delete ${r.label} for good?`,
      message: r.kind === 'household'
        ? 'The household and its members are removed permanently and can’t be restored.'
        : 'The member is removed permanently and can’t be restored.',
      confirmLabel: 'Delete for good',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await api.purgeDeleted(r.id);
      toast.success('Deleted for good');
      trash.reload();
    } catch (e) {
      toast.error(e.message || 'Could not delete this');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Trash" subtitle={`Deleted households and members, kept for ${KEEP_DAYS} days`} />
      <PageBody>
        <div>
          <div className="mb-[18px] px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
            Restoring puts the record back as it was, with its members, sacrament verifications and census answers, and links it again to
            certificate requests and the blood donor list. Items are removed for good after {KEEP_DAYS} days.
          </div>
          <Panel className="overflow-hidden">
            {trash.loading && !trash.data && <LoadingState label="Loading the trash…" />}
            {trash.error && <ErrorState message={trash.error} onRetry={trash.reload} />}
            {trash.data && !rows.length && <EmptyState title="The trash is empty" subtitle="Deleted households and members show up here." />}
            {!!rows.length && (
              <ul className="list-none m-0 p-0 divide-y divide-parish-line">
                {rows.map((r) => (
                  <li key={r.id} className="px-[18px] py-3.5 flex items-center gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14.5px] text-parish-navy">{r.label}</span>
                        <Badge tone={r.kind === 'household' ? 'gold' : 'blue'}>{r.kind === 'household' ? 'Household' : 'Member'}</Badge>
                      </div>
                      <div className="text-[12.5px] text-parish-muted">
                        {[r.detail, `deleted ${fmtDateTime(r.deleted_at)}`, r.deleted_by_name && `by ${r.deleted_by_name}`].filter(Boolean).join(' · ')}
                      </div>
                      <div className="text-[12px] text-parish-warn font-semibold">{daysLeft(r.deleted_at)} day(s) left</div>
                    </div>
                    <button onClick={() => restore(r)} disabled={busyId === r.id} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg disabled:opacity-60">Restore</button>
                    <button onClick={() => purge(r)} disabled={busyId === r.id} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-error bg-parish-errorBg rounded-lg disabled:opacity-60">Delete for good</button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
