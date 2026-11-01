import React, { useState } from 'react';
import { api } from '../../api.js';
import { useLiveRefresh, useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { trashNote } from '../../lib/trash.js';
import { Badge } from '../ui.jsx';
import { SearchInput, Pagination, EmptyState, LoadingState, ErrorState, NewItemsNote } from '../admin.jsx';
import { RowButton, Panel, TabIntro } from '../panels.jsx';
import { useRows, StatusBadge, ContactLinks, FilterChips, receivedText, SourceNote } from './common.jsx';
import { GROUP_INTEREST_OPEN } from '../../lib/requests.js';

const URL_DEFAULTS = { view: 'Open', q: '', page: 1, size: 20 };
const URL_ALLOWED = { view: ['Open', 'Joined', 'Closed', 'All'], size: [10, 20, 50] };

const inView = (r, view) => (view === 'All' ? true : view === 'Open' ? GROUP_INTEREST_OPEN.includes(r.status) : r.status === view);

/**
 * People who tapped "Interesado ko" on a ministry or organization of the
 * website (0111). Call or text them, then mark them Joined, or Closed when
 * it didn't go further. Oldest first while open (who has waited longest).
 */
export default function InterestsTab({ onCountsChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useRows(api.listGroupInterests);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { view } = url;
  const [busy, setBusy] = useState(false);
  const live = useLiveRefresh(list.reload, { kinds: ['group_interest'], busy });

  const filtered = list.rows
    .filter((r) => inView(r, view))
    .sort((a, b) => (view === 'Open' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)));
  const page = urlListPage(filtered, (r) => `${r.ref_no} ${r.full_name} ${r.group_name} ${r.gkk || ''}`, url, setUrl);
  const openCount = list.rows.filter((r) => GROUP_INTEREST_OPEN.includes(r.status)).length;

  async function patch(r, fields, message) {
    setBusy(true);
    try {
      const saved = await api.saveGroupInterest({ id: r.id, ...fields });
      list.upsert(saved);
      onCountsChanged();
      if (message) toast.success(message);
    } catch (e) {
      toast.error(e.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function addNote(r) {
    const text = window.prompt(`Note about ${r.full_name} (only staff see it)`, r.staff_notes || '');
    if (text === null) return;
    await patch(r, { staff_notes: text }, 'Note saved');
  }

  async function remove(r) {
    const ok = await confirm({ title: `Delete ${r.ref_no}?`, message: `Only for spam or duplicates. ${trashNote()}`, confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await api.deleteRequest('group_interests', r.id); list.drop(r.id); onCountsChanged(); toast.success('Deleted'); } catch (e) { toast.error(e.message || 'Could not delete'); }
  }

  return (
    <>
      <TabIntro text="People who tapped “Interesado ko” on a ministry or organization on the website. Call or text them, then mark them Joined, or Closed if it did not go further. Which groups show on the website is set in Settings → Ministries & Organizations → Website." />
      <NewItemsNote count={live.waiting} noun="sign-up" onShow={live.showNow} />

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <FilterChips label="Which sign-ups" options={[['Open', 'Open', openCount], ['Joined', 'Joined'], ['Closed', 'Closed'], ['All', 'All']]} value={view} onChange={(v) => setUrl({ view: v })} />
        <div className="flex gap-2.5 flex-wrap ml-auto">
          <SearchInput placeholder="Search sign-ups…" aria-label="Search sign-ups" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
        </div>
      </div>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !page.total ? (
          <EmptyState title={list.rows.length ? 'Nothing here' : 'No sign-ups yet'} subtitle={view === 'Open' && list.rows.length ? 'Everyone has been followed up.' : undefined} />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-3.5 border-b border-parish-line last:border-b-0 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge tone={r.group_kind === 'ministry' ? 'blue' : 'gold'}>{r.group_kind === 'ministry' ? 'Ministry' : 'Organization'}</Badge>
                  <StatusBadge status={r.status} />
                  <SourceNote source={r.source} />
                </div>
                <div className="font-semibold text-[15px] text-parish-navy">{r.full_name} <span className="font-normal text-parish-text3">· {r.group_name}</span></div>
                {r.gkk && <div className="text-[13.5px] text-parish-text3">{r.gkk}</div>}
                {r.message && <div className="text-[13.5px] text-parish-text3 whitespace-pre-line mt-1">{r.message}</div>}
                {r.staff_notes && <div className="text-[12.5px] text-parish-muted italic mt-1">Note: {r.staff_notes}</div>}
                <div className="text-[12.5px] text-parish-muted mt-1">
                  {[r.ref_no, receivedText(r.created_at), r.handled_by_name && `by ${r.handled_by_name}`].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-1.5"><ContactLinks mobile={r.mobile} /></div>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end max-w-[300px]">
                {r.status === 'New' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'Contacted' }, 'Marked contacted')}>Contacted</RowButton>}
                {GROUP_INTEREST_OPEN.includes(r.status) && <RowButton tone="green" disabled={busy} onClick={() => patch(r, { status: 'Joined' }, 'Marked joined')}>Joined</RowButton>}
                {GROUP_INTEREST_OPEN.includes(r.status) && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'Closed' }, 'Closed')}>Close</RowButton>}
                {!GROUP_INTEREST_OPEN.includes(r.status) && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'New' }, 'Reopened')}>Reopen</RowButton>}
                <RowButton tone="gray" disabled={busy} onClick={() => addNote(r)}>Note</RowButton>
                <RowButton tone="red" disabled={busy} onClick={() => remove(r)}>Delete</RowButton>
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>
    </>
  );
}
