import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, triggerDownload } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, Tabs, Panel, ViewOnlyNote } from '../../components/admin.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { Field, TextInput, PrimaryButton, GhostButton, Badge } from '../../components/ui.jsx';
import CensusHouseholdDrawer from '../../components/CensusHouseholdDrawer.jsx';
import CensusPrintSheet from '../../components/CensusPrintSheet.jsx';
import CensusSubmissionDrawer from '../../components/CensusSubmissionDrawer.jsx';
import LastYearList, { NotYetPrintSheet } from '../../components/LastYearList.jsx';
import { fmtDate } from '../../constants.js';
import { defaultCensusLabel, nextCensusDue, summarizeCensus, diffSubmission, householdsVsLastYear, householdsVsPreviousCensus, previousCensus } from '../../lib/census.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { useClientList, useDebounced } from '../../hooks.js';

const PROGRESS = ['Not started', 'Partly confirmed', 'Confirmed'];
const PROGRESS_TONES = { 'Not started': 'gray', 'Partly confirmed': 'gold', Confirmed: 'green' };
const INTERVALS = [[6, 'Every 6 months'], [12, 'Every year'], [24, 'Every 2 years'], [36, 'Every 3 years']];
const today = () => new Date().toISOString().slice(0, 10);

function Tile({ label, value, note, accent }) {
  return (
    <Panel className="px-[18px] py-4 min-w-0">
      <div className="flex items-center gap-2 mb-2" style={{ color: accent }}>
        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
        <span className="font-semibold text-[12px] tracking-wide uppercase text-parish-muted">{label}</span>
      </div>
      <div className="font-serif text-[32px] font-semibold leading-none text-parish-navy">{value}</div>
      {note && <div className="text-[12.5px] text-parish-muted mt-1.5">{note}</div>}
    </Panel>
  );
}

export default function Census() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canEdit = can(user, 'editCensus');
  const canManage = can(user, 'manageCensus');
  // GKK leaders see and record only their GKK (0024 migration).
  const ownGkk = user?.access === 'gkk_leader' ? user.accessGkk : null;
  const [cycles, setCycles] = useState(null);
  const [cyclesError, setCyclesError] = useState('');
  const [cycleId, setCycleId] = useState(null);
  const [parish, setParish] = useState(null);
  const [starting, setStarting] = useState(false);
  // ?tab=lastYear&gkk=… (the link from Parish Config → Parish GKK) opens that GKK's list.
  const [params] = useSearchParams();
  const linkedGkk = params.get('gkk') || '';
  const [tab, setTab] = useState(params.get('tab') === 'lastYear' ? 'lastYear' : 'households');
  // Parish Config → Last year's list can turn the list off (0048); then the
  // census measures itself against the previous census instead.
  const listOn = listEnabled(parish);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  function loadCycles(selectId) {
    setCyclesError('');
    return api.listCensusCycles()
      .then((list) => {
        setCycles(list);
        const open = list.find((c) => c.status === 'Open');
        setCycleId((current) => selectId ?? (list.some((c) => c.id === current) ? current : (open || list[0])?.id ?? null));
      })
      .catch((e) => setCyclesError(e.message || 'Could not load the census list'));
  }
  useEffect(() => {
    loadCycles();
    api.getSettings().then((r) => setParish(r.settings)).catch(() => {});
  }, []);

  const cycle = cycles?.find((c) => c.id === cycleId) || null;
  const openCycle = cycles?.find((c) => c.status === 'Open') || null;
  const latest = cycles?.[0] || null;
  const interval = parish?.census_interval_months || 12;
  const due = nextCensusDue(latest?.starts_on, interval);
  const refresh = () => setRefreshKey((k) => k + 1);

  // Before the 0008 migration there are no online updates; the count stays 0.
  useEffect(() => {
    if (!cycleId) return;
    api.pendingCensusSubmissionCount(cycleId).then(setPendingCount).catch(() => setPendingCount(0));
  }, [cycleId, refreshKey]);

  async function closeCycle() {
    const ok = await confirm({
      title: `Close the ${cycle.label}?`,
      message: 'No member data changes. Members nobody confirmed will show as “not confirmed” in this census. You can reopen it later if forms are still coming in.',
      confirmLabel: 'Close census',
    });
    if (!ok) return;
    try {
      await api.closeCensusCycle(cycle.id);
      toast.success(`${cycle.label} closed`);
      loadCycles(cycle.id);
    } catch (e) {
      toast.error(e.message || 'Could not close the census');
    }
  }

  async function reopenCycle() {
    try {
      await api.reopenCensusCycle(cycle.id);
      toast.success(`${cycle.label} reopened`);
      loadCycles(cycle.id);
    } catch (e) {
      toast.error(e.message || 'Could not reopen the census');
    }
  }

  async function changeInterval(months) {
    try {
      await api.setCensusInterval(months);
      setParish((p) => ({ ...p, census_interval_months: Number(months) }));
    } catch (e) {
      toast.error(e.message || 'Could not save the census schedule');
    }
  }

  if (cyclesError) {
    return (
      <>
        <PageHeader title="Parish Census" />
        <PageBody><ErrorState message={`${cyclesError}. Has the 0007_census.sql migration been run?`} onRetry={() => loadCycles()} /></PageBody>
      </>
    );
  }
  if (!cycles) return <LoadingState label="Loading census…" />;

  return (
    <>
      <PageHeader title="Parish Census" subtitle="Re-confirm every member and their standing in the parish">
        {cycles.length > 0 && (
          <FilterSelect aria-label="Census" value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value))}>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.label}{c.status === 'Open' ? ' (open)' : ''}</option>)}
          </FilterSelect>
        )}
        {!openCycle && !starting && canManage && <PrimaryButton onClick={() => setStarting(true)} className="px-4 py-2.5 text-[14px]">Start a new census</PrimaryButton>}
      </PageHeader>
      <PageBody>
        {!canEdit && <ViewOnlyNote />}
        {ownGkk && (
          <div role="note" className="mb-4 px-4 py-3 rounded-xl bg-[var(--p-blue-tint)] text-parish-navy text-[13.5px] font-medium">
            Showing the households of <strong>{ownGkk}</strong>. Starting or closing a census is done by the parish office.
          </div>
        )}
        <Panel className="px-5 py-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[13.5px] text-parish-text2 font-semibold">Schedule</span>
            {canManage ? (
              <FilterSelect aria-label="Census schedule" value={interval} onChange={(e) => changeInterval(e.target.value)}>
                {INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </FilterSelect>
            ) : (
              <span className="text-[13.5px] text-parish-navy">{INTERVALS.find(([v]) => Number(v) === Number(interval))?.[1] || `Every ${interval} months`}</span>
            )}
          </div>
          <div className="text-[13.5px] text-parish-muted">
            {openCycle
              ? <>The <strong className="text-parish-navy">{openCycle.label}</strong> is open.</>
              : due
                ? <>Next census due around <strong className="text-parish-navy">{fmtDate(due)}</strong>{due <= today() && ' — it is time to start one.'}</>
                : 'No census has been held yet.'}
          </div>
        </Panel>

        {starting && (
          <StartCensusForm
            onCancel={() => setStarting(false)}
            onStarted={(c) => { setStarting(false); toast.success(`${c.label} started`); loadCycles(c.id); }}
          />
        )}

        {!cycle && !starting && (
          <>
            <Panel>
              <EmptyState title="No census yet" subtitle="Start a census, print the pre-filled forms by GKK, and record the answers as they come back." />
            </Panel>
            {/* The list can be typed in before the census starts. */}
            {listOn && (
              <>
                <h2 className="font-serif text-[22px] font-semibold text-parish-navy mt-8 mb-3">Last year's household list</h2>
                <LastYearList ownGkk={ownGkk} initialGkk={linkedGkk} parish={parish} canEdit={canEdit} canManage={canManage} />
              </>
            )}
          </>
        )}

        {cycle && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <h2 className="font-serif text-[24px] font-semibold text-parish-navy m-0">{cycle.label}</h2>
              <Badge tone={cycle.status === 'Open' ? 'green' : 'gray'}>{cycle.status}</Badge>
              <span className="text-[13px] text-parish-muted">
                Started {fmtDate(cycle.starts_on)}
                {cycle.ends_on && ` · target end ${fmtDate(cycle.ends_on)}`}
                {cycle.closed_at && ` · closed ${new Date(cycle.closed_at).toLocaleDateString()}`}
              </span>
              <div className="ml-auto flex gap-2">
                {canManage && cycle.status === 'Open' && <GhostButton onClick={closeCycle} className="px-4 py-2 text-[13.5px]">Close census</GhostButton>}
                {canManage && cycle.status === 'Closed' && !openCycle && <GhostButton onClick={reopenCycle} className="px-4 py-2 text-[13.5px]">Reopen</GhostButton>}
              </div>
            </div>

            <Tabs
              tabs={[['households', 'Households'], ['updates', `Online updates${pendingCount ? ` (${pendingCount})` : ''}`], ['results', 'Results by GKK'], ...(listOn ? [['lastYear', "Last year's list"]] : [])]}
              value={tab === 'lastYear' && !listOn ? 'households' : tab}
              onChange={setTab}
            />
            {(tab === 'households' || (tab === 'lastYear' && !listOn)) && <HouseholdsTab cycle={cycle} cycles={cycles} parish={parish} ownGkk={ownGkk} refreshKey={refreshKey} onChanged={refresh} />}
            {tab === 'updates' && <UpdatesTab cycle={cycle} refreshKey={refreshKey} onChanged={refresh} />}
            {tab === 'results' && <ResultsTab cycle={cycle} cycles={cycles} parish={parish} ownGkk={ownGkk} refreshKey={refreshKey} />}
            {tab === 'lastYear' && listOn && <LastYearList ownGkk={ownGkk} initialGkk={linkedGkk} parish={parish} canEdit={canEdit} canManage={canManage} />}
          </>
        )}
      </PageBody>
    </>
  );
}

function StartCensusForm({ onCancel, onStarted }) {
  const [label, setLabel] = useState(defaultCensusLabel());
  const [startsOn, setStartsOn] = useState(today());
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setError('');
    if (!label.trim()) { setError('Give the census a name.'); return; }
    setSaving(true);
    try {
      onStarted(await api.openCensusCycle({ label: label.trim(), startsOn, endsOn }));
    } catch (e) {
      setError(e.message || 'Could not start the census');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-parish-fillSoft border-[1.5px] border-parish-focusLine rounded-2xl px-5 py-5 mb-5">
      <div className="font-serif text-[20px] font-semibold text-parish-navy mb-1">Start a new census</div>
      <p className="text-[13px] text-parish-muted mt-0 mb-4">
        Every current member starts as “not confirmed”. Nothing changes in the records until staff save a household's answers.
      </p>
      {error && <div className="mb-3 text-parish-error text-[13.5px]" role="alert">{error}</div>}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <Field label="Name" required><TextInput value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field label="Starts on"><TextInput type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
        <Field label="Target end (optional)"><TextInput type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2.5 justify-end mt-4">
        <GhostButton onClick={onCancel} className="px-4 py-2 text-[13.5px]">Cancel</GhostButton>
        <PrimaryButton onClick={start} disabled={saving} className="px-5 py-2 text-[13.5px]">{saving ? 'Starting…' : 'Start census'}</PrimaryButton>
      </div>
    </div>
  );
}

function HouseholdsTab({ cycle, cycles, parish, ownGkk, refreshKey, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // A GKK leader starts on (and can only pick) their own GKK, so "Print forms" works at once.
  const [gkk, setGkk] = useState(ownGkk || 'All');
  const [progress, setProgress] = useState('All');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [counts, setCounts] = useState(null);
  const [summary, setSummary] = useState(null);
  const [vsLastYear, setVsLastYear] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [printForms, setPrintForms] = useState(null);
  const [printing, setPrinting] = useState(false);

  function reload() {
    setLoading(true);
    setError('');
    api.listCensusHouseholds(cycle.id, { gkk, progress, search: debouncedSearch, page, pageSize })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  // The tiles cover the whole census, so paging and searching don't reload them.
  function reloadTiles() {
    api.censusHouseholdProgressCounts(cycle.id).then(setCounts).catch(() => setCounts(null));
    api.censusSummary(cycle.id).then((r) => setSummary(summarizeCensus(r))).catch(() => setSummary(null));
    loadVsLastYear(cycle, cycles, ownGkk, listEnabled(parish)).then(setVsLastYear).catch(() => setVsLastYear(null));
  }

  useEffect(() => { reload(); }, [cycle.id, gkk, progress, debouncedSearch, page, pageSize, refreshKey]);
  useEffect(() => { reloadTiles(); }, [cycle.id, refreshKey, listEnabled(parish)]);
  useEffect(() => { setPage(1); }, [cycle.id, gkk, progress, debouncedSearch]);
  useEffect(() => { if (!ownGkk) api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, [ownGkk]);

  async function print(args) {
    setPrinting(true);
    try {
      const forms = await api.censusPrintData(args);
      if (!forms.length) { toast.error('No households to print'); return; }
      setPrintForms(forms);
      // Let the sheet render before opening the print dialog.
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    } catch (e) {
      toast.error(e.message || 'Could not prepare the census forms');
    } finally {
      setPrinting(false);
    }
  }

  const t = summary?.total;
  const open = cycle.status === 'Open';

  return (
    <>
      <div className="grid gap-3.5 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(170px,100%),1fr))' }}>
        <Tile label="Members confirmed" value={t ? `${t.pct}%` : '—'} note={t ? `${t.confirmed} of ${t.total} members` : ''} accent="#34589c" />
        <Tile label="Active" value={t ? t.counts.Active : '—'} note={t ? `${t.counts.Inactive} inactive · ${t.counts['Left the Church']} left the Church` : ''} accent="rgb(var(--c-ok-text))" />
        <Tile label="Moved / deceased" value={t ? t.counts['Moved away'] + t.counts.Deceased : '—'} note={t ? `${t.counts['Moved away']} moved · ${t.counts.Deceased} deceased` : ''} accent="rgb(var(--c-chip))" />
        <Tile label="Households done" value={counts ? counts.Confirmed : '—'} note={counts ? `${counts['Partly confirmed']} partly · ${counts['Not started']} not started` : ''} accent="#c39b4e" />
        {vsLastYear?.hasBaseline && (
          <Tile
            label={vsLastYear.previous ? `Registered vs ${vsLastYear.previous.label}` : 'Registered vs last year'}
            value={`${vsLastYear.total.pct}%`}
            note={`${vsLastYear.total.notYet} of ${vsLastYear.previous ? 'its' : "last year's"} ${vsLastYear.total.lastYear} not yet registered`}
            accent="rgb(var(--c-ok-text))"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2.5 items-center mb-4">
        <SearchInput placeholder="Search household, head, ref no…" aria-label="Search households" value={search} onChange={(e) => setSearch(e.target.value)} />
        {ownGkk ? (
          <span className="text-[13.5px] font-semibold text-parish-navy px-1">{ownGkk}</span>
        ) : (
          <FilterSelect aria-label="GKK" value={gkk} onChange={(e) => setGkk(e.target.value)}>
            <option value="All">All GKKs</option>
            {gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="None">No GKK</option>
          </FilterSelect>
        )}
        <FilterSelect aria-label="Progress" value={progress} onChange={(e) => setProgress(e.target.value)}>
          <option value="All">Any progress</option>
          {PROGRESS.map((p) => <option key={p} value={p}>{p}</option>)}
        </FilterSelect>
        {open && (
          <GhostButton
            onClick={() => print({ gkk })}
            disabled={gkk === 'All' || printing}
            title={gkk === 'All' ? 'Choose a GKK first' : undefined}
            className="px-4 py-2.5 text-[13.5px] ml-auto"
          >
            {printing ? 'Preparing…' : gkk === 'All' ? 'Choose a GKK to print its forms' : `Print forms for ${gkk === 'None' ? 'households without a GKK' : gkk}`}
          </GhostButton>
        )}
      </div>

      <DataTable
        minWidth={720}
        columns={[{ label: 'Household' }, { label: 'GKK' }, { label: 'Members confirmed' }, { label: 'Progress' }, { label: '', key: 'actions' }]}
        footer={
          <>
            {loading && <LoadingState label="Loading households…" />}
            {!loading && error && <ErrorState message={error} onRetry={reload} />}
            {!loading && !error && !rows.length && <EmptyState title="No households found" subtitle="Try adjusting your search or filters." />}
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
          </>
        }
      >
        {!loading && rows.map((r) => (
          <tr key={r.household_id} className="border-t border-parish-line">
            <td className="px-4 py-3">
              <div className="font-semibold text-[14.5px] text-parish-navy">{r.household_name}</div>
              <div className="text-[12.5px] text-parish-muted">{[r.head_name, r.ref_no].filter(Boolean).join(' · ')}</div>
            </td>
            <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{r.gkk || '—'}</td>
            <td className="px-4 py-3 text-[14px] text-parish-text3">{r.members_confirmed} of {r.members_expected}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                {/* "Not started" next to a waiting online update read as if the family's answers were lost. */}
                {!(r.pending_update && r.progress === 'Not started') && <Badge tone={PROGRESS_TONES[r.progress]}>{r.progress}</Badge>}
                {r.pending_update && <Badge tone="blue" title="The family sent their answers online. Approve them under Online updates to confirm the members.">Sent online · to review</Badge>}
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex gap-1.5 justify-end">
                {open && (
                  <button onClick={() => print({ householdIds: [r.household_id] })} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg whitespace-nowrap">Print form</button>
                )}
                <button onClick={() => setOpenId(r.household_id)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap">
                  {open ? 'Record census' : 'View'}
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      {openId && (
        <CensusHouseholdDrawer
          cycle={cycle}
          householdId={openId}
          pendingUpdate={!!rows.find((r) => r.household_id === openId)?.pending_update}
          onClose={() => setOpenId(null)}
          onSaved={onChanged}
        />
      )}
      <CensusPrintSheet forms={printForms} cycle={cycle} parish={parish} />
    </>
  );
}

/** What the Online updates search looks in. */
const updateSearchText = (r) => [r.households?.household_name, r.households?.ref_no, r.households?.gkk, r.reviewed_by_name, r.review_note, r.message].filter(Boolean).join(' ');

function UpdatesTab({ cycle, refreshKey, onChanged }) {
  const [status, setStatus] = useState('Pending');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState(null);
  // All of a cycle's updates in one status are loaded, then searched and paged here.
  const list = useClientList(rows, updateSearchText, 20);

  function load() {
    setError('');
    api.listCensusSubmissions(cycle.id, status).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(() => { setRows(null); load(); }, [cycle.id, status, refreshKey]);
  useEffect(() => { list.setPage(1); }, [cycle.id, status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-[13px] text-parish-muted m-0 flex-1 min-w-[240px]">
          Families open their record at <strong className="text-parish-navy">{window.location.origin}/census</strong> with the reference number and
          code printed on their census form. Nothing changes in the registry until you approve their update.
        </p>
        <SearchInput placeholder="Search household, ref no, GKK…" aria-label="Search online updates" value={list.query} onChange={(e) => list.setQuery(e.target.value)} />
        <FilterSelect aria-label="Update status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="Pending">Waiting for review</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option>
        </FilterSelect>
      </div>
      <DataTable
        minWidth={680}
        columns={[{ label: 'Household' }, { label: 'GKK' }, { label: 'Sent' }, { label: 'Changes' }, { label: '', key: 'actions' }]}
        footer={
          <>
            {!rows && !error && <LoadingState label="Loading online updates…" />}
            {error && <ErrorState message={error} onRetry={load} />}
            {rows && !rows.length && <EmptyState title={status === 'Pending' ? 'No updates waiting' : `No ${status.toLowerCase()} updates`} />}
            {rows && !!rows.length && !list.total && <EmptyState title="No updates found" subtitle="Try another name, reference number or GKK." />}
            {rows && <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} />}
          </>
        }
      >
        {list.rows.map((r) => {
          const d = diffSubmission(r);
          const answered = [...d.members, ...d.newMembers].filter((m) => m.status).length;
          return (
            <tr key={r.id} className="border-t border-parish-line">
              <td className="px-4 py-3">
                <div className="font-semibold text-[14.5px] text-parish-navy">{r.households?.household_name}</div>
                <div className="text-[12.5px] text-parish-muted">{r.households?.ref_no}</div>
              </td>
              <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{r.households?.gkk || '—'}</td>
              <td className="px-4 py-3 text-[13.5px] text-parish-text2 whitespace-nowrap">{new Date(r.submitted_at).toLocaleString()}</td>
              <td className="px-4 py-3 text-[13.5px] text-parish-text3">
                {d.changeCount} change(s) · {answered} census answer(s){r.message ? ' · message' : ''}
                {r.status !== 'Pending' && <div className="text-[12px] text-parish-muted">{r.status} by {r.reviewed_by_name || 'staff'}{r.review_note ? ` — ${r.review_note}` : ''}</div>}
              </td>
              <td className="px-4 py-3 text-right">
                <button onClick={() => setOpenRow(r)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap">
                  {r.status === 'Pending' ? 'Review' : 'View'}
                </button>
              </td>
            </tr>
          );
        })}
      </DataTable>
      {openRow && (
        <CensusSubmissionDrawer
          submission={openRow}
          cycle={cycle}
          onClose={() => setOpenRow(null)}
          onDone={() => { setOpenRow(null); onChanged(); }}
        />
      )}
    </>
  );
}

/** Whether the parish uses last year's household list (on unless turned off, 0048). */
const listEnabled = (parish) => parish?.last_year_list_enabled !== false;

/**
 * Households registered in this census per GKK against last year. With last
 * year's list on: the GKK's names on the list when it has some, else the
 * count typed in Parish Config → Parish GKK. With it off: the households
 * that took part in the previous census (`previous` is that census, null
 * when there is none, and `notYetHouseholds` the ones to visit).
 */
async function loadVsLastYear(cycle, cycles, ownGkk, listOn) {
  if (listOn) {
    const [details, counts, lists] = await Promise.all([api.listGkkDetails(), api.censusGkkHouseholdCounts(cycle.id), api.lastYearCounts()]);
    return { ...householdsVsLastYear(details.rows, counts, ownGkk, lists), previous: null };
  }
  const previous = previousCensus(cycles, cycle);
  if (!previous) return { rows: [], total: null, hasBaseline: false, previous: null, noPrevious: true, notYetHouseholds: [] };
  const [before, now] = await Promise.all([api.censusHouseholdProgressRows(previous.id), api.censusHouseholdProgressRows(cycle.id)]);
  return { ...householdsVsPreviousCensus(before, now, ownGkk), previous };
}

/** With last year's list off: the households from the previous census not yet registered in this one, to visit. */
function NotYetHouseholds({ list, previous, onExport, onPrint }) {
  const [open, setOpen] = useState(false);
  const shown = open ? list : list.slice(0, 10);
  if (!list.length) return <p className="mb-6 text-[13px] text-parish-ok font-semibold">Every household from the {previous.label} has registered.</p>;
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <h3 className="m-0 font-serif text-[19px] font-semibold text-parish-navy">Not yet registered ({list.length})</h3>
        <span className="text-[13px] text-parish-muted">took part in the {previous.label}, nobody confirmed yet in this one</span>
        <div className="ml-auto flex gap-2">
          <GhostButton type="button" onClick={onPrint} className="px-3.5 py-2 text-[13px]">Print visit list</GhostButton>
          <button onClick={onExport} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg whitespace-nowrap">Export CSV</button>
        </div>
      </div>
      <DataTable minWidth={620} columns={[{ label: 'Household' }, { label: 'Head of household' }, { label: 'GKK' }, { label: 'Ref no' }]}>
        {shown.map((h) => (
          <tr key={h.household_id} className="border-t border-parish-line">
            <td className="px-4 py-2.5 text-[14px] text-parish-navy font-semibold">{h.household_name}</td>
            <td className="px-4 py-2.5 text-[14px] text-parish-text3">{h.head_name || '—'}</td>
            <td className="px-4 py-2.5 text-[14px] text-parish-text3">{h.gkk || 'No GKK'}</td>
            <td className="px-4 py-2.5 text-[13px] text-parish-muted">{h.ref_no || '—'}</td>
          </tr>
        ))}
      </DataTable>
      {list.length > 10 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-blue">
          {open ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </div>
  );
}

function ResultsTab({ cycle, cycles, parish, ownGkk, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [vsLastYear, setVsLastYear] = useState(null);
  const [error, setError] = useState('');
  const [printRows, setPrintRows] = useState(null);

  function load() {
    setError('');
    api.censusSummary(cycle.id).then((r) => setSummary(summarizeCensus(r))).catch((e) => setError(e.message));
    // Optional: before 0040 (or with no counts entered) the table just doesn't show.
    loadVsLastYear(cycle, cycles, ownGkk, listEnabled(parish)).then(setVsLastYear).catch(() => setVsLastYear(null));
  }
  useEffect(() => { load(); }, [cycle.id, refreshKey, listEnabled(parish)]);

  async function exportCsv() {
    const columns = ['GKK', ...summary.columns, 'Total', 'Confirmed %'];
    const row = (r) => ({ cells: [r.label, ...summary.columns.map((c) => r.counts[c]), r.total, `${r.pct}%`] });
    const blob = await api.exportGenerated({ title: cycle.label, columns, rows: [...summary.rows.map(row), row(summary.total)] });
    triggerDownload(blob, `${cycle.label.toLowerCase().replace(/\s+/g, '-')}-results.csv`);
  }

  async function exportVsLastYear() {
    const columns = ['GKK', 'Last year from', 'Last year', 'Registered', 'Fully confirmed', 'Not yet', 'Registered %'];
    const from = (r) => (r.lastYear == null ? '' : vsLastYear.previous ? vsLastYear.previous.label : r.fromList ? 'List' : 'Count');
    const row = (r) => ({ cells: [r.label, from(r), r.lastYear ?? '', r.registered, r.confirmed, r.notYet ?? '', r.pct == null ? '' : `${r.pct}%`] });
    const blob = await api.exportGenerated({ title: `${cycle.label} households vs last year`, columns, rows: [...vsLastYear.rows.map(row), row(vsLastYear.total)] });
    triggerDownload(blob, `${cycle.label.toLowerCase().replace(/\s+/g, '-')}-households-vs-last-year.csv`);
  }

  async function exportNotYet() {
    const columns = ['GKK', 'Household', 'Head of household', 'Ref no'];
    const rows = vsLastYear.notYetHouseholds.map((h) => ({ cells: [h.gkk || 'No GKK', h.household_name, h.head_name || '', h.ref_no || ''] }));
    const blob = await api.exportGenerated({ title: `Took part in the ${vsLastYear.previous.label}, not yet in the ${cycle.label}`, columns, rows });
    triggerDownload(blob, `${cycle.label.toLowerCase().replace(/\s+/g, '-')}-not-yet-registered.csv`);
  }

  function printNotYet() {
    // The same visit sheet as last year's list, one GKK at a time is what leaders carry; all of them for the office.
    setPrintRows(vsLastYear.notYetHouseholds.map((h) => ({ id: h.household_id, head_name: h.head_name || h.household_name, purok: h.gkk || 'No GKK', note: [h.household_name, h.ref_no].filter(Boolean).join(' · ') })));
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!summary) return <LoadingState label="Loading results…" />;

  const cols = summary.columns;
  const dash = <span className="text-parish-faint">—</span>;
  return (
    <>
      {vsLastYear?.hasBaseline && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[13px] text-parish-muted m-0">
              {vsLastYear.previous
                ? <>Households registered in the {cycle.label} (at least one member confirmed) against the {vsLastYear.previous.label}. “Last year” is the households that took part in the {vsLastYear.previous.label}; “not yet” is those of them with nobody confirmed in this census yet.</>
                : <>Households registered in the {cycle.label} (at least one member confirmed) against last year. A GKK marked “list” counts its names on the Last year's list tab, where “not yet” is the names not yet ticked off; the others use the count set in Parish Config → Parish GKK.</>}
            </p>
            <button onClick={exportVsLastYear} className="ml-auto appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg whitespace-nowrap">Export CSV</button>
          </div>
          <div className="mb-6">
            <DataTable
              minWidth={720}
              columns={[{ label: 'GKK' }, { label: 'Last year', align: 'right' }, { label: 'Registered', align: 'right' }, { label: 'Fully confirmed', align: 'right' }, { label: 'Not yet', align: 'right' }, { label: 'Registered %', align: 'right' }]}
            >
              {[...vsLastYear.rows, vsLastYear.total].map((r, i) => (
                <tr key={r.label} className={`border-t border-parish-line ${i === vsLastYear.rows.length ? 'bg-parish-sunk font-semibold' : ''}`}>
                  <td className="px-4 py-3 text-[14px] text-parish-navy whitespace-nowrap">
                    {r.label}
                    {r.fromList && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-parish-muted">list</span>}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.lastYear ?? dash}</td>
                  <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.registered}</td>
                  <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.confirmed}</td>
                  <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.notYet ?? dash}</td>
                  <td className="px-4 py-3 text-[14px] text-right text-parish-navy">{r.pct == null ? dash : `${r.pct}%`}</td>
                </tr>
              ))}
            </DataTable>
            {vsLastYear.rows.some((r) => r.lastYear == null) && (
              <p className="text-[12.5px] text-parish-muted mt-2 mb-0">
                {vsLastYear.previous ? `The total leaves out GKKs with nobody in the ${vsLastYear.previous.label}.` : 'The total leaves out GKKs with no count for last year.'}
              </p>
            )}
          </div>
          {vsLastYear.previous && <NotYetHouseholds list={vsLastYear.notYetHouseholds} previous={vsLastYear.previous} onExport={exportNotYet} onPrint={printNotYet} />}
        </>
      )}
      {vsLastYear?.noPrevious && (
        <p className="mb-6 px-4 py-3 rounded-xl border border-parish-border bg-parish-field text-[13px] text-parish-text2">
          Last year's list is turned off and there's no earlier census in the registry to compare with, so this census can't show who hasn't registered yet. Turn the list on in Parish Config → Last year's list, or compare from the next census on.
        </p>
      )}
      <NotYetPrintSheet rows={printRows} gkk={ownGkk || 'All GKKs'} parish={parish} placeLabel="GKK" />
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[13px] text-parish-muted m-0">
          Members per status in the {cycle.label}. “Not confirmed” are current members with no answer in this census{cycle.status === 'Open' ? ' yet' : ''}.
        </p>
        <button onClick={exportCsv} className="ml-auto appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg whitespace-nowrap">Export CSV</button>
      </div>
      <DataTable
        minWidth={820}
        columns={[{ label: 'GKK' }, ...cols.map((c) => ({ label: c, align: 'right' })), { label: 'Total', align: 'right' }, { label: 'Confirmed', align: 'right' }]}
        footer={!summary.rows.length && <EmptyState title="No members yet" />}
      >
        {[...summary.rows, summary.total].map((r, i) => (
          <tr key={r.label} className={`border-t border-parish-line ${i === summary.rows.length ? 'bg-parish-sunk font-semibold' : ''}`}>
            <td className="px-4 py-3 text-[14px] text-parish-navy whitespace-nowrap">{r.label}</td>
            {cols.map((c) => <td key={c} className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.counts[c]}</td>)}
            <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.total}</td>
            <td className="px-4 py-3 text-[14px] text-right text-parish-navy">{r.pct}%</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
