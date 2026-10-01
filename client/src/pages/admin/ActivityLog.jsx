import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, Pagination, EmptyState, ErrorState, LoadingState, Panel } from '../../components/admin.jsx';
import { ActivityEntry } from '../../components/ActivityList.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import { useAsyncData, useDebounced, useUrlState } from '../../hooks.js';

const TABLES = [['All', 'Everything'], ['households', 'Households'], ['members', 'Members'], ['sacrament_verifications', 'Sacrament verifications']];
const URL_DEFAULTS = { table: 'All', who: 'All', q: '', page: 1, size: 20 };
const URL_ALLOWED = { table: TABLES.map(([k]) => k), who: ['All', 'online'], size: [10, 20, 50] };

/** Every recorded change to households, members and sacrament verifications, newest first. */
export default function ActivityLog() {
  const navigate = useNavigate();
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const search = useDebounced(url.q);
  const [openMemberId, setOpenMemberId] = useState(null);
  const log = useAsyncData(
    () => api.listActivity({ table: url.table, actor: url.who, search, page: url.page, pageSize: url.size }),
    [url.table, url.who, search, url.page, url.size],
  );
  const rows = log.data?.rows || [];
  const filtered = url.table !== 'All' || url.who !== 'All' || !!search;

  function open(e) {
    if (e.member_id && e.action !== 'trash') setOpenMemberId(e.member_id);
    else if (e.table_name === 'households' && e.action !== 'trash') navigate(`/admin/households?q=${encodeURIComponent(e.label || '')}`);
    else navigate('/admin/settings/trash');
  }

  return (
    <>
      <PageHeader title="Activity log" subtitle="Who changed which household or member, and what changed">
        <SearchInput placeholder="Search household or member name…" aria-label="Search by name" value={url.q} onChange={(e) => setUrl({ q: e.target.value })} />
      </PageHeader>
      <PageBody>
        <div className="max-w-[920px]">
          <div className="flex flex-wrap gap-2.5 items-center mb-4">
            <FilterSelect aria-label="What changed" value={url.table} onChange={(e) => setUrl({ table: e.target.value })}>
              {TABLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </FilterSelect>
            <FilterSelect aria-label="Who changed it" value={url.who} onChange={(e) => setUrl({ who: e.target.value })}>
              <option value="All">Staff and families</option><option value="online">Families, online</option>
            </FilterSelect>
            {filtered && <button onClick={() => setUrl({ table: 'All', who: 'All', q: '' })} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1.5 py-2">Clear</button>}
            {log.data && <div className="ml-auto text-[13px] text-parish-muted">{log.data.total} change(s)</div>}
          </div>
          <Panel className="overflow-hidden">
            {log.loading && !log.data && <LoadingState label="Loading the activity log…" />}
            {log.error && <ErrorState message={log.error} onRetry={log.reload} />}
            {log.data && !rows.length && (
              filtered ? <EmptyState title="No changes match" subtitle="Try another filter or name." />
                : <EmptyState title="Nothing recorded yet" subtitle="Changes to households and members show up here from now on." />
            )}
            {!!rows.length && (
              <ul className="list-none m-0 px-[18px] py-1.5 divide-y divide-parish-line">
                {rows.map((e) => <ActivityEntry key={e.id} entry={e} showLabel onOpen={open} />)}
              </ul>
            )}
            {log.data && <Pagination page={url.page} pageSize={url.size} total={log.data.total} onPage={(p) => setUrl({ page: p })} onPageSize={(size) => setUrl({ size })} />}
          </Panel>
        </div>
      </PageBody>
      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={log.reload} />}
    </>
  );
}
