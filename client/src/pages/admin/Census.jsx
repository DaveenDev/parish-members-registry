import React, { useEffect, useState } from 'react';
import { api, triggerDownload } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, Tabs, Panel, ViewOnlyNote } from '../../components/admin.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { Field, TextInput, PrimaryButton, GhostButton, Badge } from '../../components/ui.jsx';
import CensusHouseholdDrawer from '../../components/CensusHouseholdDrawer.jsx';
import CensusPrintSheet from '../../components/CensusPrintSheet.jsx';
import CensusSubmissionDrawer from '../../components/CensusSubmissionDrawer.jsx';
import { fmtDate } from '../../constants.js';
import { defaultCensusLabel, nextCensusDue, summarizeCensus, diffSubmission } from '../../lib/census.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { useDebounced } from '../../hooks.js';

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
  const [cycles, setCycles] = useState(null);
  const [cyclesError, setCyclesError] = useState('');
  const [cycleId, setCycleId] = useState(null);
  const [parish, setParish] = useState(null);
  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState('households');
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
    api.listCensusSubmissions(cycleId).then((rows) => setPendingCount(rows.length)).catch(() => setPendingCount(0));
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
  if (!cycles) return <div className="p-8 text-parish-muted">Loading census…</div>;

  return (
    <>
      <PageHeader title="Parish Census" subtitle="Re-confirm every member and their standing in the parish">
        {cycles.length > 0 && (
          <FilterSelect aria-label="Census" value={cycleId ?? ''} onChange={(e) => setCycleId(Number(e.target.value))}>
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.label}{c.status === 'Open' ? ' (open)' : ''}</option>)}
          </FilterSelect>
        )}
        {!openCycle && !starting && canEdit && <PrimaryButton onClick={() => setStarting(true)} className="px-4 py-2.5 text-[14px]">Start a new census</PrimaryButton>}
      </PageHeader>
      <PageBody>
        {!canEdit && <ViewOnlyNote />}
        <Panel className="px-5 py-4 mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[13.5px] text-parish-text2 font-semibold">Schedule</span>
            <FilterSelect aria-label="Census schedule" value={interval} onChange={(e) => changeInterval(e.target.value)}>
              {INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </FilterSelect>
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
          <Panel>
            <EmptyState title="No census yet" subtitle="Start a census, print the pre-filled forms by GKK, and record the answers as they come back." />
          </Panel>
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
                {cycle.status === 'Open' && <GhostButton onClick={closeCycle} className="px-4 py-2 text-[13.5px]">Close census</GhostButton>}
                {cycle.status === 'Closed' && !openCycle && <GhostButton onClick={reopenCycle} className="px-4 py-2 text-[13.5px]">Reopen</GhostButton>}
              </div>
            </div>

            <Tabs
              tabs={[['households', 'Households'], ['updates', `Online updates${pendingCount ? ` (${pendingCount})` : ''}`], ['results', 'Results by GKK']]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'households' && <HouseholdsTab cycle={cycle} parish={parish} refreshKey={refreshKey} onChanged={refresh} />}
            {tab === 'updates' && <UpdatesTab cycle={cycle} refreshKey={refreshKey} onChanged={refresh} />}
            {tab === 'results' && <ResultsTab cycle={cycle} refreshKey={refreshKey} />}
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
    <div className="bg-[#f8faff] border-[1.5px] border-[#cdd7e8] rounded-2xl px-5 py-5 mb-5">
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

function HouseholdsTab({ cycle, parish, refreshKey, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gkk, setGkk] = useState('All');
  const [progress, setProgress] = useState('All');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [counts, setCounts] = useState(null);
  const [summary, setSummary] = useState(null);
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
    api.censusHouseholdProgressCounts(cycle.id).then(setCounts).catch(() => setCounts(null));
    api.censusSummary(cycle.id).then((r) => setSummary(summarizeCensus(r))).catch(() => setSummary(null));
  }

  useEffect(() => { reload(); }, [cycle.id, gkk, progress, debouncedSearch, page, pageSize, refreshKey]);
  useEffect(() => { setPage(1); }, [cycle.id, gkk, progress, debouncedSearch]);
  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, []);

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
        <Tile label="Active" value={t ? t.counts.Active : '—'} note={t ? `${t.counts.Inactive} inactive · ${t.counts['Left the Church']} left the Church` : ''} accent="#2f7a52" />
        <Tile label="Moved / deceased" value={t ? t.counts['Moved away'] + t.counts.Deceased : '—'} note={t ? `${t.counts['Moved away']} moved · ${t.counts.Deceased} deceased` : ''} accent="#7a6a3e" />
        <Tile label="Households done" value={counts ? counts.Confirmed : '—'} note={counts ? `${counts['Partly confirmed']} partly · ${counts['Not started']} not started` : ''} accent="#c39b4e" />
      </div>

      <div className="flex flex-wrap gap-2.5 items-center mb-4">
        <SearchInput placeholder="Search household, head, ref no…" aria-label="Search households" value={search} onChange={(e) => setSearch(e.target.value)} />
        <FilterSelect aria-label="GKK" value={gkk} onChange={(e) => setGkk(e.target.value)}>
          <option value="All">All GKKs</option>
          {gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          <option value="None">No GKK</option>
        </FilterSelect>
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
          <tr key={r.household_id} className="border-t border-[#f1e8d5]">
            <td className="px-4 py-3">
              <div className="font-semibold text-[14.5px] text-parish-navy">{r.household_name}</div>
              <div className="text-[12.5px] text-parish-muted">{[r.head_name, r.ref_no].filter(Boolean).join(' · ')}</div>
            </td>
            <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{r.gkk || '—'}</td>
            <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{r.members_confirmed} of {r.members_expected}</td>
            <td className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={PROGRESS_TONES[r.progress]}>{r.progress}</Badge>
                {r.pending_update && <Badge tone="blue" title="The family sent an update online — see Online updates">Online update waiting</Badge>}
              </div>
            </td>
            <td className="px-4 py-3">
              <div className="flex gap-1.5 justify-end">
                {open && (
                  <button onClick={() => print({ householdIds: [r.household_id] })} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-[#f4efe3] rounded-lg whitespace-nowrap">Print form</button>
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

function UpdatesTab({ cycle, refreshKey, onChanged }) {
  const [status, setStatus] = useState('Pending');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState(null);

  function load() {
    setError('');
    api.listCensusSubmissions(cycle.id, status).then(setRows).catch((e) => setError(e.message));
  }
  useEffect(() => { setRows(null); load(); }, [cycle.id, status, refreshKey]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <p className="text-[13px] text-parish-muted m-0 flex-1 min-w-[240px]">
          Families open their record at <strong className="text-parish-navy">{window.location.origin}/census</strong> with the reference number and
          code printed on their census form. Nothing changes in the registry until you approve their update.
        </p>
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
          </>
        }
      >
        {(rows || []).map((r) => {
          const d = diffSubmission(r);
          const answered = [...d.members, ...d.newMembers].filter((m) => m.status).length;
          return (
            <tr key={r.id} className="border-t border-[#f1e8d5]">
              <td className="px-4 py-3">
                <div className="font-semibold text-[14.5px] text-parish-navy">{r.households?.household_name}</div>
                <div className="text-[12.5px] text-parish-muted">{r.households?.ref_no}</div>
              </td>
              <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{r.households?.gkk || '—'}</td>
              <td className="px-4 py-3 text-[13.5px] text-parish-text2 whitespace-nowrap">{new Date(r.submitted_at).toLocaleString()}</td>
              <td className="px-4 py-3 text-[13.5px] text-[#3f3b2f]">
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

function ResultsTab({ cycle, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  function load() {
    setError('');
    api.censusSummary(cycle.id).then((r) => setSummary(summarizeCensus(r))).catch((e) => setError(e.message));
  }
  useEffect(() => { load(); }, [cycle.id, refreshKey]);

  async function exportCsv() {
    const columns = ['GKK', ...summary.columns, 'Total', 'Confirmed %'];
    const row = (r) => ({ cells: [r.label, ...summary.columns.map((c) => r.counts[c]), r.total, `${r.pct}%`] });
    const blob = await api.exportGenerated({ title: cycle.label, columns, rows: [...summary.rows.map(row), row(summary.total)] });
    triggerDownload(blob, `${cycle.label.toLowerCase().replace(/\s+/g, '-')}-results.csv`);
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!summary) return <LoadingState label="Loading results…" />;

  const cols = summary.columns;
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[13px] text-parish-muted m-0">
          Members per status in the {cycle.label}. “Not confirmed” are current members with no answer in this census{cycle.status === 'Open' ? ' yet' : ''}.
        </p>
        <button onClick={exportCsv} className="ml-auto appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-blue rounded-lg whitespace-nowrap">Export CSV</button>
      </div>
      <DataTable
        minWidth={820}
        columns={[{ label: 'GKK' }, ...cols.map((c) => ({ label: c, align: 'right' })), { label: 'Total', align: 'right' }, { label: 'Confirmed', align: 'right' }]}
        footer={!summary.rows.length && <EmptyState title="No members yet" />}
      >
        {[...summary.rows, summary.total].map((r, i) => (
          <tr key={r.label} className={`border-t border-[#f1e8d5] ${i === summary.rows.length ? 'bg-[#f4efe3] font-semibold' : ''}`}>
            <td className="px-4 py-3 text-[14px] text-parish-navy whitespace-nowrap">{r.label}</td>
            {cols.map((c) => <td key={c} className="px-4 py-3 text-[14px] text-right text-[#3f3b2f]">{r.counts[c]}</td>)}
            <td className="px-4 py-3 text-[14px] text-right text-[#3f3b2f]">{r.total}</td>
            <td className="px-4 py-3 text-[14px] text-right text-parish-navy">{r.pct}%</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
