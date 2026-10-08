import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, triggerDownload } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, Tabs, Panel, ViewOnlyNote, rowActivationProps } from '../../components/admin.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { Field, TextInput, PrimaryButton, GhostButton, Badge } from '../../components/ui.jsx';
import CensusHouseholdDrawer from '../../components/CensusHouseholdDrawer.jsx';
import CensusPrintSheet from '../../components/CensusPrintSheet.jsx';
import CensusSubmissionDrawer from '../../components/CensusSubmissionDrawer.jsx';
import LastYearList, { NotYetPrintSheet } from '../../components/LastYearList.jsx';
import { fmtDate } from '../../constants.js';
import { defaultCensusLabel, nextCensusDue, summarizeCensus, diffSubmission, vsLastYearTable, unnamedNotYet } from '../../lib/census.js';
import { groupRuns, groupHeading } from '../../lib/household.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { useClientList, useDebounced, useUrlState } from '../../hooks.js';

const PROGRESS = ['Not started', 'Partly confirmed', 'Confirmed'];
const PROGRESS_TONES = { 'Not started': 'gray', 'Partly confirmed': 'gold', Confirmed: 'green' };
const INTERVALS = [[6, 'Every 6 months'], [12, 'Every year'], [24, 'Every 2 years'], [36, 'Every 3 years']];
const today = () => new Date().toISOString().slice(0, 10);
const CENSUS_TABS = ['households', 'updates', 'results', 'lastYear'];
const HOUSEHOLDS_URL_DEFAULTS = { gkk: 'All', progress: 'All', q: '', page: 1, size: 20 };
const HOUSEHOLDS_URL_ALLOWED = { progress: ['All', ...PROGRESS], size: [10, 20, 50] };

function Tile({ label, value, note, accent }) {
  return (
    <Panel className="px-3.5 py-3.5 sm:px-[18px] sm:py-4 min-w-0">
      <div className="flex items-center gap-2 mb-2" style={{ color: accent }}>
        <span className="w-2 h-2 rounded-full flex-none" style={{ background: accent }} />
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
  const [editing, setEditing] = useState(false);
  // The tab is in the address bar: ?tab=lastYear&gkk=… (the link from Parish
  // Config → Parish GKK) opens that GKK's list, and ?tab=updates&q=<ref no>
  // (the Dashboard and census update notifications) that household's update.
  const [params, setParams] = useSearchParams();
  const linkedGkk = params.get('gkk') || '';
  const linkedQuery = params.get('q') || '';
  const tab = CENSUS_TABS.includes(params.get('tab')) ? params.get('tab') : 'households';
  const setTab = (k) => setParams(k === 'households' ? {} : { tab: k, ...(k === 'lastYear' && linkedGkk ? { gkk: linkedGkk } : {}) }, { replace: true });
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

  /** Delete a census started by mistake, saying first what goes with it. */
  async function deleteCycle() {
    let usage = { answers: 0, updates: 0 };
    try { usage = await api.censusCycleUsage(cycle.id); } catch { /* the confirm still warns in general terms */ }
    const parts = [
      usage.answers && `${usage.answers} member answer(s)`,
      usage.updates && `${usage.updates} online update(s) from families`,
    ].filter(Boolean);
    const ok = await confirm({
      title: `Delete the ${cycle.label}?`,
      message: `${parts.length ? `Its ${parts.join(' and ')} are deleted with it. ` : 'Nothing has been recorded in it yet. '}`
        + "Members' records keep what was saved to them. This can't be undone; to stop a census that is going ahead, close it instead.",
      confirmLabel: 'Delete census',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteCensusCycle(cycle.id);
      toast.success(`${cycle.label} deleted`);
      setEditing(false);
      loadCycles();
      refresh();
    } catch (e) {
      toast.error(e.message || 'Could not delete the census');
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
          <FilterSelect aria-label="Census" value={cycleId ?? ''} onChange={(e) => { setCycleId(Number(e.target.value)); setEditing(false); }}>
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
          <CensusCycleForm
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
                {canManage && !editing && <GhostButton onClick={() => setEditing(true)} className="px-4 py-2 text-[13.5px]">Edit</GhostButton>}
                {canManage && cycle.status === 'Open' && <GhostButton onClick={closeCycle} className="px-4 py-2 text-[13.5px]">Close census</GhostButton>}
                {canManage && cycle.status === 'Closed' && !openCycle && <GhostButton onClick={reopenCycle} className="px-4 py-2 text-[13.5px]">Reopen</GhostButton>}
              </div>
            </div>

            {editing && (
              <CensusCycleForm
                key={cycle.id}
                cycle={cycle}
                onCancel={() => setEditing(false)}
                onSaved={(c) => { setEditing(false); toast.success(`${c.label} saved`); loadCycles(c.id); }}
                onDelete={deleteCycle}
              />
            )}

            <Tabs
              tabs={[['households', 'Households'], ['updates', `Online updates${pendingCount ? ` (${pendingCount})` : ''}`], ['results', 'Results by GKK'], ...(listOn ? [['lastYear', "Last year's list"]] : [])]}
              value={tab === 'lastYear' && !listOn ? 'households' : tab}
              onChange={setTab}
            />
            {(tab === 'households' || (tab === 'lastYear' && !listOn)) && <HouseholdsTab cycle={cycle} cycles={cycles} parish={parish} ownGkk={ownGkk} refreshKey={refreshKey} onChanged={refresh} />}
            {tab === 'updates' && <UpdatesTab cycle={cycle} refreshKey={refreshKey} onChanged={refresh} initialQuery={linkedQuery} />}
            {tab === 'results' && <ResultsTab key={cycle.id} cycle={cycle} cycles={cycles} parish={parish} ownGkk={ownGkk} refreshKey={refreshKey} canOpenGkk={!ownGkk && can(user, 'censusGkkView')} />}
            {tab === 'lastYear' && listOn && <LastYearList ownGkk={ownGkk} initialGkk={linkedGkk} parish={parish} canEdit={canEdit} canManage={canManage} />}
          </>
        )}
      </PageBody>
    </>
  );
}

/**
 * Start a new census, or with `cycle` change one's name and dates (and
 * delete it, through `onDelete`).
 */
function CensusCycleForm({ cycle = null, onCancel, onStarted, onSaved, onDelete }) {
  const [label, setLabel] = useState(cycle?.label || defaultCensusLabel());
  const [startsOn, setStartsOn] = useState(cycle?.starts_on || today());
  const [endsOn, setEndsOn] = useState(cycle?.ends_on || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setError('');
    if (!label.trim()) { setError('Give the census a name.'); return; }
    setSaving(true);
    try {
      if (cycle) onSaved(await api.updateCensusCycle(cycle.id, { label: label.trim(), startsOn, endsOn }));
      else onStarted(await api.openCensusCycle({ label: label.trim(), startsOn, endsOn }));
    } catch (e) {
      setError(e.message || (cycle ? 'Could not save the census' : 'Could not start the census'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-parish-fillSoft border-[1.5px] border-parish-focusLine rounded-2xl px-5 py-5 mb-5">
      <div className="font-serif text-[20px] font-semibold text-parish-navy mb-1">{cycle ? `Edit the ${cycle.label}` : 'Start a new census'}</div>
      <p className="text-[13px] text-parish-muted mt-0 mb-4">
        {cycle
          ? 'Change its name or dates. Recorded answers stay as they are.'
          : 'Every current member starts as “not confirmed”. Nothing changes in the records until staff save a household\'s answers.'}
      </p>
      {error && <div className="mb-3 text-parish-error text-[13.5px]" role="alert">{error}</div>}
      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <Field label="Name" required><TextInput value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field label="Starts on"><TextInput type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
        <Field label="Target end (optional)"><TextInput type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
      </div>
      <div className="flex gap-2.5 justify-end items-center flex-wrap mt-4">
        {cycle && onDelete && (
          <button type="button" onClick={onDelete} disabled={saving} className="mr-auto appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error disabled:opacity-60">
            Delete this census…
          </button>
        )}
        <GhostButton onClick={onCancel} className="px-4 py-2 text-[13.5px]">Cancel</GhostButton>
        <PrimaryButton onClick={start} disabled={saving} className="px-5 py-2 text-[13.5px]">
          {cycle ? (saving ? 'Saving…' : 'Save') : (saving ? 'Starting…' : 'Start census')}
        </PrimaryButton>
      </div>
    </div>
  );
}

function HouseholdsTab({ cycle, cycles, parish, ownGkk, refreshKey, onChanged }) {
  const toast = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Filters, search and page live in the address bar (see useUrlState), so a
  // refresh or a shared link keeps them. A GKK leader always has their own
  // GKK, so "Print forms" works at once.
  const [url, setUrl] = useUrlState(HOUSEHOLDS_URL_DEFAULTS, HOUSEHOLDS_URL_ALLOWED);
  const gkk = ownGkk || url.gkk;
  const { progress, q: search, page, size: pageSize } = url;
  const setGkk = (v) => setUrl({ gkk: v });
  const setProgress = (v) => setUrl({ progress: v });
  const setSearch = (v) => setUrl({ q: v });
  const setPage = (p) => setUrl({ page: p });
  const setPageSize = (size) => setUrl({ size });
  const debouncedSearch = useDebounced(search);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [counts, setCounts] = useState(null);
  const [summary, setSummary] = useState(null);
  const [vsLastYear, setVsLastYear] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [printForms, setPrintForms] = useState(null);
  const [printing, setPrinting] = useState(false);

  // Only the latest load fills the list (an earlier, slower answer would otherwise land last).
  const loadSeq = useRef(0);
  function reload() {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');
    api.listCensusHouseholds(cycle.id, { gkk, progress, search: debouncedSearch, page, pageSize })
      .then((res) => { if (seq === loadSeq.current) { setRows(res.rows); setTotal(res.total); } })
      .catch((e) => { if (seq === loadSeq.current) setError(e.message); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }
  // The tiles cover the whole census, so paging and searching don't reload them.
  function reloadTiles() {
    api.censusHouseholdProgressCounts(cycle.id).then(setCounts).catch(() => setCounts(null));
    api.censusSummary(cycle.id).then((r) => setSummary(summarizeCensus(r))).catch(() => setSummary(null));
    api.censusVsLastYear(cycle, cycles, ownGkk).then(setVsLastYear).catch(() => setVsLastYear(null));
  }

  useEffect(() => { reload(); }, [cycle.id, gkk, progress, debouncedSearch, page, pageSize, refreshKey]);
  useEffect(() => { reloadTiles(); }, [cycle.id, refreshKey, listEnabled(parish)]);
  useEffect(() => { if (!ownGkk) api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, [ownGkk]);

  async function print(args) {
    setPrinting(true);
    try {
      // Only accounts that may hand out census codes get them on the forms.
      const forms = await api.censusPrintData({ ...args, withCodes: can(user, 'censusCodes') });
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
  // All GKKs: grouped by GKK. One GKK (or "No GKK"): grouped by Family Grouping.
  const groupKey = gkk === 'All' ? 'gkk' : 'family_grouping';

  return (
    <>
      <div className="grid gap-2.5 sm:gap-3.5 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(150px,100%),1fr))' }}>
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
            className="px-4 py-2.5 text-[13.5px] ml-auto max-sm:w-full"
          >
            {printing ? 'Preparing…' : gkk === 'All' ? 'Choose a GKK to print its forms' : `Print forms for ${gkk === 'None' ? 'households without a GKK' : gkk}`}
          </GhostButton>
        )}
      </div>

      <DataTable
        minWidth={720}
        columns={[{ label: 'Household' }, { label: 'Family Grouping' }, { label: 'Members confirmed' }, { label: 'Progress' }, { label: '', key: 'actions' }]}
        mobile={!loading && (
          <ul className="list-none m-0 p-0 divide-y divide-parish-line" aria-label="Census households">
            {groupRuns(rows, groupKey).map((g) => (
              <React.Fragment key={g.key ?? 'none'}>
                <li className="px-4 py-2 bg-parish-sunk font-serif text-[16.5px] font-semibold text-parish-navy">{groupHeading(g.key, groupKey)}</li>
                {g.rows.map((r) => (
                  <li key={r.household_id} className="px-4 py-3">
                    <div className="font-semibold text-[14.5px] text-parish-navy">{r.household_name}</div>
                    <div className="text-[12.5px] text-parish-muted">{[r.head_name, r.ref_no, r.family_grouping].filter(Boolean).join(' · ')}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {!(r.pending_update && r.progress === 'Not started') && <Badge tone={PROGRESS_TONES[r.progress]}>{r.progress}</Badge>}
                      {r.pending_update && <Badge tone="blue">Sent online · to review</Badge>}
                      <span className="text-[12.5px] text-parish-text2">{r.members_confirmed} of {r.members_expected} confirmed</span>
                    </div>
                    <div className="flex gap-2 mt-2.5">
                      <button onClick={() => setOpenId(r.household_id)} className="flex-1 appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg">
                        {open ? 'Record census' : 'View'}
                      </button>
                      {open && (
                        <button onClick={() => print({ householdIds: [r.household_id] })} className="flex-1 appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg">Print form</button>
                      )}
                    </div>
                  </li>
                ))}
              </React.Fragment>
            ))}
          </ul>
        )}
        footer={
          <>
            {loading && <LoadingState label="Loading households…" />}
            {!loading && error && <ErrorState message={error} onRetry={reload} />}
            {!loading && !error && !rows.length && <EmptyState title="No households found" subtitle="Try adjusting your search or filters." />}
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
          </>
        }
      >
        {!loading && groupRuns(rows, groupKey).map((g, gi) => (
          <React.Fragment key={g.key ?? 'none'}>
            <tr className={`bg-parish-sunk ${gi ? 'border-t-2 border-parish-borderStrong' : ''}`}>
              <th scope="colgroup" colSpan={5} className="text-left px-4 py-2 font-serif text-[16.5px] font-semibold text-parish-navy">
                {groupHeading(g.key, groupKey)}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.household_id} className="border-t border-parish-line">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[14.5px] text-parish-navy">{r.household_name}</div>
                  <div className="text-[12.5px] text-parish-muted">{[r.head_name, r.ref_no].filter(Boolean).join(' · ')}</div>
                </td>
                <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{r.family_grouping || '—'}</td>
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
          </React.Fragment>
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

function UpdatesTab({ cycle, refreshKey, onChanged, initialQuery = '' }) {
  const [status, setStatus] = useState('Pending');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState(null);
  // All of a cycle's updates in one status are loaded, then searched and paged here.
  const list = useClientList(rows, updateSearchText, 20);
  // A notification's link names the household: show its update.
  useEffect(() => { if (initialQuery) list.setQuery(initialQuery); }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

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
        mobile={(
          <ul className="list-none m-0 p-0 divide-y divide-parish-line" aria-label="Online updates">
            {list.rows.map((r) => {
              const d = diffSubmission(r);
              const answered = [...d.members, ...d.newMembers].filter((m) => m.status).length;
              return (
                <li key={r.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14.5px] text-parish-navy">{r.households?.household_name}</div>
                    <div className="text-[12.5px] text-parish-muted">{[r.households?.ref_no, r.households?.gkk, new Date(r.submitted_at).toLocaleString()].filter(Boolean).join(' · ')}</div>
                    <div className="text-[13px] text-parish-text3 mt-1">{d.changeCount} change(s) · {answered} census answer(s){r.message ? ' · message' : ''}</div>
                    {r.status !== 'Pending' && <div className="text-[12px] text-parish-muted">{r.status} by {r.reviewed_by_name || 'staff'}{r.review_note ? ` — ${r.review_note}` : ''}</div>}
                  </div>
                  <button onClick={() => setOpenRow(r)} className="flex-none appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap">
                    {r.status === 'Pending' ? 'Review' : 'View'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
 * The families still to visit: last year's names not found in the registry
 * (list on) or the previous census's households with nobody confirmed yet
 * (list off). Staff can narrow it to a GKK; a GKK leader sees their own.
 * GKKs measured by their household count have no names, so only how many
 * of them are left is noted.
 */
function NotYetList({ res, cycle, ownGkk, onPrint }) {
  const [gkk, setGkk] = useState('All');
  const [open, setOpen] = useState(false);
  const gkks = [...new Set(res.notYet.map((n) => n.gkk || 'No GKK'))];
  const list = res.notYet.filter((n) => gkk === 'All' || (n.gkk || 'No GKK') === gkk);
  const shown = open ? list : list.slice(0, 15);
  const what = res.mode === 'census'
    ? `took part in the ${res.previous.label}, nobody confirmed yet in this one`
    : "on last year's list and not yet found in the registry (on the queue or verified) or ticked off";
  const unnamed = unnamedNotYet(res);
  const unnamedNote = unnamed > 0 && (
    <p className="text-[13px] text-parish-muted mt-2 mb-0">
      {unnamed} more household(s) not yet registered in {res.mode === 'count' ? 'the GKKs' : 'GKKs with no names on the list,'} counted by the households last year set in Parish GKK. That count has no names, so they can't be listed here.
    </p>
  );

  async function exportCsv() {
    const blob = await api.exportGenerated({
      title: `${cycle.label}: not yet registered${gkk === 'All' ? '' : ` (${gkk})`}`,
      columns: res.mode !== 'census' ? ['GKK', 'Head of household', 'Purok', 'Note'] : ['GKK', 'Household', 'Head of household · ref no'],
      rows: list.map((n) => ({ cells: res.mode !== 'census' ? [n.gkk, n.title, n.purok, n.note] : [n.gkk || 'No GKK', n.title, n.detail] })),
    });
    triggerDownload(blob, `${cycle.label.toLowerCase().replace(/\s+/g, '-')}-not-yet-registered.csv`);
  }

  if (!res.notYet.length) {
    if (unnamed > 0) return <div className="mb-8 -mt-2">{unnamedNote}</div>;
    const all = res.mode === 'census' ? `from the ${res.previous.label}` : res.mode === 'count' ? 'counted last year' : "on last year's list";
    return <p className="mb-8 px-4 py-3 rounded-xl border border-parish-border bg-parish-field text-[13.5px] text-parish-ok font-semibold">Every household {all} has registered.</p>;
  }
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2.5 flex-wrap mb-1">
        <h3 className="m-0 font-serif text-[20px] font-semibold text-parish-navy">Not yet registered ({list.length})</h3>
        <div className="ml-auto flex gap-2 flex-wrap">
          {!ownGkk && gkks.length > 1 && (
            <FilterSelect aria-label="GKK" value={gkk} onChange={(e) => { setGkk(e.target.value); setOpen(false); }}>
              <option value="All">All GKKs</option>
              {gkks.map((g) => <option key={g} value={g}>{g}</option>)}
            </FilterSelect>
          )}
          <GhostButton type="button" onClick={() => onPrint(list, gkk === 'All' ? ownGkk || 'All GKKs' : gkk)} className="px-3.5 py-2 text-[13px]">Print visit list</GhostButton>
          <button onClick={exportCsv} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg whitespace-nowrap">Export CSV</button>
        </div>
      </div>
      <p className="text-[13px] text-parish-muted mt-0 mb-3">Families {what}.</p>
      <DataTable
        minWidth={560}
        mobile={(
          <ul className="list-none m-0 p-0 divide-y divide-parish-line">
            {shown.map((n) => (
              <li key={n.key} className="px-4 py-2.5">
                <div className="text-[14px] text-parish-navy font-semibold">{n.title}</div>
                <div className="text-[12.5px] text-parish-muted">{[n.detail, !ownGkk && (n.gkk || 'No GKK')].filter(Boolean).join(' · ') || '—'}</div>
              </li>
            ))}
          </ul>
        )}
        columns={res.mode !== 'census' ? [{ label: 'Head of household' }, { label: 'Purok · note' }, ...(ownGkk ? [] : [{ label: 'GKK' }])] : [{ label: 'Household' }, { label: 'Head · ref no' }, ...(ownGkk ? [] : [{ label: 'GKK' }])]}>
        {shown.map((n) => (
          <tr key={n.key} className="border-t border-parish-line">
            <td className="px-4 py-2.5 text-[14px] text-parish-navy font-semibold">{n.title}</td>
            <td className="px-4 py-2.5 text-[13.5px] text-parish-text3">{n.detail || '—'}</td>
            {!ownGkk && <td className="px-4 py-2.5 text-[13.5px] text-parish-text3">{n.gkk || 'No GKK'}</td>}
          </tr>
        ))}
      </DataTable>
      {list.length > 15 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-blue">
          {open ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
      {gkk === 'All' && unnamedNote}
    </div>
  );
}

/**
 * Results by GKK. Full-access staff can open a GKK's row to see that GKK's
 * results as its GKK leader does: its registered households, the families
 * not yet registered (with the visit list to print) and its members by
 * status, so the office needn't ask the leader for them.
 */
function ResultsTab({ canOpenGkk, ...props }) {
  const [gkk, setGkk] = useState(null);
  const open = (g) => { setGkk(g); window.scrollTo({ top: 0 }); };
  if (!gkk) return <Results {...props} onOpenGkk={canOpenGkk ? open : null} />;
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-5 px-4 py-3 rounded-xl bg-[var(--p-blue-tint)]">
        <button type="button" onClick={() => setGkk(null)} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13.5px] text-parish-blue">← All GKKs</button>
        <span className="text-[13.5px] text-parish-navy">Showing <strong>{gkk}</strong> as its GKK leader sees it.</span>
      </div>
      <Results key={gkk} {...props} ownGkk={gkk} staffView />
    </>
  );
}

/**
 * The results of one census: everyone's for staff, one GKK's for its leader
 * (`ownGkk`), or one GKK's opened by staff (`staffView`). `onOpenGkk(name)`,
 * when given, makes each GKK's row open it.
 */
function Results({ cycle, cycles, parish, ownGkk, refreshKey, staffView = false, onOpenGkk = null }) {
  const [summary, setSummary] = useState(null);
  const [vsLastYear, setVsLastYear] = useState(null);
  const [error, setError] = useState('');
  const [print, setPrint] = useState(null); // { rows, gkk } for the visit sheet

  function load() {
    setError('');
    // A leader's members are already only their GKK's; staff opening a GKK narrow theirs here.
    api.censusSummary(cycle.id).then((r) => setSummary(summarizeCensus(staffView ? r.filter((x) => x.gkk === ownGkk) : r))).catch((e) => setError(e.message));
    // Optional: with no baseline (no list, count or earlier census) the table just doesn't show.
    api.censusVsLastYear(cycle, cycles, ownGkk).then(setVsLastYear).catch(() => setVsLastYear(null));
  }
  useEffect(() => { load(); }, [cycle.id, refreshKey, parish?.last_year_list_enabled]);

  async function exportCsv() {
    const columns = ['GKK', ...summary.columns, 'Total', 'Confirmed %'];
    const row = (r) => ({ cells: [r.label, ...summary.columns.map((c) => r.counts[c]), r.total, `${r.pct}%`] });
    const blob = await api.exportGenerated({ title: cycle.label, columns, rows: [...summary.rows.map(row), row(summary.total)] });
    triggerDownload(blob, `${cycle.label.toLowerCase().replace(/\s+/g, '-')}-results.csv`);
  }

  async function exportVsLastYear() {
    const { title, columns, rows } = vsLastYearTable(vsLastYear, cycle);
    const blob = await api.exportGenerated({ title, columns, rows: rows.map((cells) => ({ cells })) });
    triggerDownload(blob, `${cycle.label.toLowerCase().replace(/\s+/g, '-')}-households-vs-last-year.csv`);
  }

  function printNotYet(list, gkk) {
    setPrint({ gkk, rows: list.map((n) => ({ id: n.key, head_name: n.title, purok: vsLastYear.mode !== 'census' ? n.purok : n.gkk || 'No GKK', note: n.note })) });
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!summary) return <LoadingState label="Loading results…" />;

  const cols = summary.columns;
  const dash = <span className="text-parish-faint">—</span>;
  // A GKK's row opens it; not the total, nor members with no GKK (no leader to see them).
  const opens = (label, total) => !!onOpenGkk && !total && label !== 'No GKK';
  const rowProps = (label, total) => (opens(label, total) ? rowActivationProps(() => onOpenGkk(label), `Open ${label} as its GKK leader sees it`) : {});
  const rowLook = (label, total) => (opens(label, total) ? 'cursor-pointer hover:bg-[var(--p-blue-tint)] focus-visible:outline-2 focus-visible:outline-parish-blue' : '');
  const gkkCell = (label, total) => (opens(label, total) ? <span className="text-parish-blue font-semibold">{label} <span aria-hidden>›</span></span> : label);
  const openHint = onOpenGkk && <p className="text-[12.5px] text-parish-muted mt-0 mb-2">Click a GKK to see its results as its GKK leader does, with the families not yet registered.</p>;
  return (
    <>
      {vsLastYear?.hasBaseline && (
        <>
          <div className="flex items-start gap-3 mb-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <h3 className="m-0 mb-1 font-serif text-[20px] font-semibold text-parish-navy">
                {ownGkk ? `${ownGkk}: registered households` : 'Registered households by GKK'}
                <span className="ml-2 align-middle text-[14px] font-sans font-semibold text-parish-blue">{vsLastYear.total.pct}%</span>
              </h3>
              <p className="text-[13px] text-parish-muted m-0">
                {vsLastYear.mode === 'census'
                  ? <>Households registered in the {cycle.label} (at least one member confirmed) against the {vsLastYear.previous.label}. “Last year” is the households that took part in the {vsLastYear.previous.label}; “not yet” is those of them with nobody confirmed in this census yet.</>
                  : vsLastYear.mode === 'count'
                    ? <>Households in the registry (on the verification queue or verified) against each GKK's households last year, set in Parish GKK. Last year's list is off and there's no earlier census in the registry yet; from the next census on, it's compared with this one.</>
                    : <>Households in the registry (on the verification queue or verified) against last year's list. A GKK marked “list” counts its names, and a name is registered once it's found in the registry or ticked off; the others use the household count set in Parish GKK.</>}
              </p>
            </div>
            <button onClick={exportVsLastYear} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg whitespace-nowrap">Export CSV</button>
          </div>
          <div className="mb-6">
            {openHint}
            <DataTable
              minWidth={760}
              stickyFirst
              columns={[
                { label: 'GKK' }, { label: 'Last year', align: 'right' }, { label: 'Registered', align: 'right' },
                ...(vsLastYear.mode === 'census' ? [{ label: 'Fully confirmed', align: 'right' }] : [{ label: 'Verified', align: 'right' }, { label: 'On the queue', align: 'right' }]),
                { label: 'Not yet', align: 'right' }, { label: 'Registered %', align: 'right' },
              ]}
            >
              {[...vsLastYear.rows, vsLastYear.total].map((r, i) => (
                <tr key={r.label} {...rowProps(r.label, i === vsLastYear.rows.length)} className={`border-t border-parish-line ${i === vsLastYear.rows.length ? 'bg-parish-sunk font-semibold' : ''} ${rowLook(r.label, i === vsLastYear.rows.length)}`}>
                  <td className="px-4 py-3 text-[14px] text-parish-navy whitespace-nowrap">
                    {gkkCell(r.label, i === vsLastYear.rows.length)}
                    {r.fromList && <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-parish-muted">list</span>}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.lastYear ?? dash}</td>
                  <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.registered}</td>
                  {vsLastYear.mode === 'census'
                    ? <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.confirmed}</td>
                    : <><td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.verified}</td><td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.pending}</td></>}
                  <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.notYet ?? dash}</td>
                  <td className="px-4 py-3 text-[14px] text-right">
                    {r.pct == null ? dash : (
                      <span className="inline-flex items-center gap-2 justify-end">
                        <span className="hidden sm:inline-block w-16 h-1.5 rounded-full bg-parish-sunk overflow-hidden"><span className="block h-full bg-parish-fill" style={{ width: `${r.pct}%` }} /></span>
                        <span className="text-parish-navy font-semibold">{r.pct}%</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
            {vsLastYear.rows.some((r) => r.lastYear == null) && (
              <p className="text-[12.5px] text-parish-muted mt-2 mb-0">
                {vsLastYear.mode === 'census' ? `The total leaves out GKKs with nobody in the ${vsLastYear.previous.label}.`
                  : vsLastYear.mode === 'count' ? 'The total leaves out GKKs with no households last year set in Parish GKK.'
                    : "The total leaves out GKKs with no names on last year's list and no household count."}
              </p>
            )}
          </div>
          <NotYetList res={vsLastYear} cycle={cycle} ownGkk={ownGkk} onPrint={printNotYet} />
        </>
      )}
      {vsLastYear?.noPrevious && (
        <p className="mb-6 px-4 py-3 rounded-xl border border-parish-border bg-parish-field text-[13px] text-parish-text2">
          Last year's list is turned off, there's no earlier census in the registry to compare with, and {ownGkk ? `${ownGkk} has no` : 'no GKK has a'} household count for last year in Parish GKK, so this census can't show who hasn't registered yet. Set the households last year in Parish Config → Parish GKK, turn the list on in Parish Config → Last year's list, or compare from the next census on.
        </p>
      )}
      {vsLastYear && !vsLastYear.hasBaseline && !vsLastYear.noPrevious && vsLastYear.mode === 'list' && (
        <p className="mb-6 px-4 py-3 rounded-xl border border-parish-border bg-parish-field text-[13px] text-parish-text2">
          {ownGkk
            ? <>{ownGkk} has no names on last year's list and no household count yet, so the census can't show who hasn't registered. Add the names on the Last year's list tab.</>
            : <>No GKK has names on last year's list or a household count yet, so the census can't show who hasn't registered. Add them in Parish Config → Last year's list.</>}
        </p>
      )}
      <NotYetPrintSheet rows={print?.rows} gkk={print?.gkk} parish={parish} placeLabel={vsLastYear?.mode === 'census' ? 'GKK' : 'Purok'} />
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <p className="text-[13px] text-parish-muted m-0 flex-1 min-w-[220px]">
          Members per status in the {cycle.label}. “Not confirmed” are current members with no answer in this census{cycle.status === 'Open' ? ' yet' : ''}.
        </p>
        <button onClick={exportCsv} className="ml-auto appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg whitespace-nowrap">Export CSV</button>
      </div>
      {!vsLastYear?.hasBaseline && openHint}
      <DataTable
        minWidth={820}
        stickyFirst
        columns={[{ label: 'GKK' }, ...cols.map((c) => ({ label: c, align: 'right' })), { label: 'Total', align: 'right' }, { label: 'Confirmed', align: 'right' }]}
        footer={!summary.rows.length && <EmptyState title="No members yet" />}
      >
        {[...summary.rows, summary.total].map((r, i) => (
          <tr key={r.label} {...rowProps(r.label, i === summary.rows.length)} className={`border-t border-parish-line ${i === summary.rows.length ? 'bg-parish-sunk font-semibold' : ''} ${rowLook(r.label, i === summary.rows.length)}`}>
            <td className="px-4 py-3 text-[14px] text-parish-navy whitespace-nowrap">{gkkCell(r.label, i === summary.rows.length)}</td>
            {cols.map((c) => <td key={c} className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.counts[c]}</td>)}
            <td className="px-4 py-3 text-[14px] text-right text-parish-text3">{r.total}</td>
            <td className="px-4 py-3 text-[14px] text-right text-parish-navy">{r.pct}%</td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
