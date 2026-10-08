import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { useAuth } from '../../AuthContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { ErrorState, LoadingState, Modal, PageBody, PageHeader, Panel, ViewOnlyNote } from '../../components/admin.jsx';
import { Field, GhostButton, PrimaryButton, TextInput } from '../../components/ui.jsx';
import ChartEditor from '../../components/orgchart/ChartEditor.jsx';
import { can } from '../../lib/access.js';
import { useToast } from '../../ToastContext.jsx';

const DISCARD = { title: 'Leave without saving?', message: 'Your changes to this chart haven’t been saved.', tone: 'danger', confirmLabel: 'Leave', cancelLabel: 'Stay' };

/**
 * Parish life → Organization Structure: one tab per org chart (Church
 * Structure first, then the GKK Structure and any added), each with its
 * editor. Loaded on its own (React.lazy), so React Flow stays out of the
 * rest of the app. Full access edits; other staff look.
 */
export default function OrgStructure() {
  const { user } = useAuth();
  const canEdit = can(user, 'manageLists');
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const dirty = useRef(false);

  const load = useCallback(() => {
    setError('');
    api.listOrgCharts().then(setCharts).catch((e) => setError(e.message || 'Could not load the charts'));
  }, []);
  useEffect(load, [load]);

  // Closing or reloading the tab with unsaved changes: the browser asks first.
  useEffect(() => {
    const warn = (e) => { if (dirty.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const onDirtyChange = useCallback((d) => { dirty.current = d; }, []);

  const current = charts?.find((c) => String(c.id) === params.get('chart')) || charts?.[0] || null;
  const open = (id) => setParams(id === charts?.[0]?.id ? {} : { chart: String(id) }, { replace: true });

  async function switchTo(id) {
    if (id === current?.id) return;
    if (dirty.current && !(await confirm(DISCARD))) return;
    dirty.current = false;
    open(id);
  }

  async function startNew() {
    if (dirty.current && !(await confirm(DISCARD))) return;
    setAdding(true);
  }

  const replace = (row) => setCharts((cs) => cs.map((c) => (c.id === row.id ? row : c)));

  return (
    <>
      <PageHeader title="Organization Structure" subtitle="The parish's org charts, shown on the website under Ang Simbahan → Organisasyon once published" />
      <PageBody>
        {!canEdit && <ViewOnlyNote>Your account can view these charts but not change them.</ViewOnlyNote>}
        {error && <Panel><ErrorState message={error} onRetry={load} /></Panel>}
        {!error && !charts && <Panel><LoadingState label="Loading the charts…" /></Panel>}
        {charts && (
          <>
            <div role="tablist" aria-label="Org charts" className="flex items-end gap-1 mb-[18px] border-b border-parish-border overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {charts.map((c) => (
                <button
                  key={c.id} type="button" role="tab" aria-selected={current?.id === c.id} onClick={() => switchTo(c.id)}
                  className="appearance-none border-none bg-none cursor-pointer px-3 sm:px-4 py-2.5 -mb-px font-semibold text-[14.5px] sm:text-[15px] flex items-center gap-2 whitespace-nowrap shrink-0"
                  style={{ color: current?.id === c.id ? 'var(--p-blue)' : 'rgb(var(--c-muted))', borderBottom: `2.5px solid ${current?.id === c.id ? 'var(--p-blue)' : 'transparent'}` }}
                >
                  {c.title}
                  {c.published && <span title="On the website" className="w-2 h-2 rounded-full bg-[#2f7a52]" aria-label="published" />}
                </button>
              ))}
              {canEdit && (
                <button type="button" onClick={startNew} className="appearance-none border-none bg-transparent cursor-pointer px-3 py-2.5 -mb-px font-semibold text-[14px] text-parish-blue hover:underline whitespace-nowrap shrink-0">
                  + New chart
                </button>
              )}
            </div>
            {current && (
              <ChartEditor
                key={current.id} chart={current} canEdit={canEdit}
                onChartUpdated={replace}
                onDeleted={() => { dirty.current = false; setCharts((cs) => cs.filter((c) => c.id !== current.id)); setParams({}, { replace: true }); }}
                onDirtyChange={onDirtyChange}
              />
            )}
          </>
        )}
      </PageBody>
      {adding && (
        <NewChart
          onClose={() => setAdding(false)}
          onCreated={(row) => { setAdding(false); dirty.current = false; setCharts((cs) => [...cs, row]); setParams({ chart: String(row.id) }, { replace: true }); }}
        />
      )}
    </>
  );
}

function NewChart({ onClose, onCreated }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Give the chart a title'); return; }
    setBusy(true);
    try {
      const row = await api.createOrgChart(title.trim());
      toast.success(`${row.title} added`);
      onCreated(row);
    } catch (err) {
      setError(err.message || 'Could not add the chart');
      setBusy(false);
    }
  }

  return (
    <Modal title="New chart" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="m-0 text-[13.5px] text-parish-muted">A chart of its own, e.g. a commission, the Parish Finance Council or the GKK clusters. It stays off the website until you publish it.</p>
        <Field label="Title" required error={error}>
          <TextInput autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Parish Finance Council" />
        </Field>
        <div className="flex gap-2.5 justify-end">
          <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={busy} className="px-6 py-2.5 text-[14px]">{busy ? 'Adding…' : 'Add chart'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
