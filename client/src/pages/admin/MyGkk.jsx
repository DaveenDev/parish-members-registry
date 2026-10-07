import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Panel, ErrorState, LoadingState } from '../../components/admin.jsx';
import { FlagEmptyRequired, PrimaryButton } from '../../components/ui.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { useToast } from '../../ToastContext.jsx';
import GkkDocuments from '../../components/GkkDocuments.jsx';
import LastYearList from '../../components/LastYearList.jsx';
import {
  ChapelFields, HistoryFields, PagePhotoFields, chapelPatch, chapelProblem, gkkForm, historyPatch, photosPatch, sameHistory, samePhotos, useGkkPhotos,
} from '../../components/GkkFields.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';

const VIEWS = [['details', 'Details'], ['history', 'History'], ['documents', 'Documents'], ['names', "Last year's list"]];

/**
 * GKK Config → My GKK (0045, 0046): a GKK leader's own GKK, without the
 * list of every GKK. They keep its chapel details and the photos on its
 * website page, its history (the parish office publishes it), its
 * documents and last year's household names. Full-access staff do all of
 * this under Parish Config → Parish GKK. ?view= picks the part.
 */
export default function MyGkk() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const name = user?.access === 'gkk_leader' ? user.accessGkk : null;
  const [params, setParams] = useSearchParams();
  const [parish, setParish] = useState(null);
  // Last year's list only while the parish uses it (0048).
  const views = VIEWS.filter(([k]) => k !== 'names' || parish?.last_year_list_enabled !== false);
  const view = views.some(([k]) => k === params.get('view')) ? params.get('view') : 'details';
  const setView = (k) => setParams((p) => {
    const next = new URLSearchParams(p);
    if (k === 'details') next.delete('view'); else next.set('view', k);
    return next;
  }, { replace: true });

  const [gkk, setGkk] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [saving, setSaving] = useState(false);
  const pagePhotos = useGkkPhotos(setError);
  const historyPhotos = useGkkPhotos(setError);

  function load() {
    setLoadError('');
    api.listGkkDetails()
      .then(({ rows }) => {
        // By id since 0063, so a renamed GKK is still found.
        const g = rows.find((r) => (user.accessGkkId ? r.id === user.accessGkkId : r.name === name));
        if (!g) throw new Error(`${name} wasn't found in the GKK list. Ask the parish office.`);
        setGkk(g);
        setForm(gkkForm(g));
      })
      .catch((e) => setLoadError(e.message || 'Could not load your GKK'));
  }
  useEffect(() => {
    if (!name) return undefined;
    load();
    api.getSettings().then((r) => setParish(r.settings)).catch(() => {});
    // Leaving with unsaved photos: take them back off R2.
    return () => { pagePhotos.rollback(); historyPhotos.rollback(); };
  }, [name]);

  async function save(what) {
    setError('');
    const photos = what === 'details' ? pagePhotos : historyPhotos;
    if (what === 'details') {
      const problem = chapelProblem(form);
      if (problem) { if (!form.chapel_address.trim()) setAddressError(problem); setError(problem); return; }
    }
    if (photos.uploading) { setError('Wait for the photos to finish uploading.'); return; }
    if (what === 'history') {
      if (sameHistory(form, gkkForm(gkk))) { toast.success('No changes to save'); return; }
      // A leader's change takes a published history off the website (0045)
      // and alerts the parish office (0060): say so before saving.
      const live = !!gkk.history_published;
      const ok = await confirm({
        title: live ? 'Take the history off the website?' : 'Save the history?',
        message: live
          ? `${name}'s history is on the website now. Saving these changes takes it off the website until the parish office reviews and publishes it again. The office will be notified.`
          : 'The parish office will be notified to review it and put it on the website.',
        confirmLabel: 'Save history',
        tone: live ? 'danger' : 'default',
      });
      if (!ok) return;
    }
    // The photos only when they changed, so the details still save before the 0046 migration.
    const patch = what === 'details'
      ? { ...chapelPatch(form), ...(samePhotos(form, gkkForm(gkk)) ? {} : photosPatch(form)) }
      : historyPatch(form, { withPublished: false });
    setSaving(true);
    try {
      const saved = await api.saveGkkDetails(gkk.id, patch);
      photos.commit();
      setGkk(saved);
      // Keep unsaved edits on the other tab; take what the database saved for this one.
      const fresh = gkkForm(saved);
      const keys = what === 'details'
        ? ['chapel_address', 'puroks', 'year_established', 'meeting_schedule', 'meeting_place', 'photo_url', 'photos']
        : ['history', 'history_photos', 'history_published'];
      setForm((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, fresh[k]])) }));
      toast.success(what === 'details' ? 'Details saved' : 'History saved. The parish office has been notified to review it for the website.');
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (!name) return <Panel className="p-6 text-[14px] text-parish-text2">This tab is for GKK leader accounts.</Panel>;

  const saveBar = (label) => (
    <div className="flex items-center gap-3 justify-end flex-wrap">
      {error && <div role="alert" className="mr-auto text-parish-error text-[13.5px] font-medium">{error}</div>}
      <PrimaryButton type="submit" disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : label}</PrimaryButton>
    </div>
  );
  const onSubmit = (what) => (e) => { e.preventDefault(); if (!saving) save(what); };

  return (
    <div>
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-3">{name}</div>
      <div className="grid gap-4 md:gap-6 md:grid-cols-[200px_minmax(0,1fr)] md:items-start">
      <SideTabs tabs={views} value={view} onChange={(k) => { setView(k); setError(''); }} />
      <div className="min-w-0">
      {loadError ? <ErrorState message={loadError} onRetry={load} /> : !form ? <LoadingState label="Loading…" /> : (
        <>
          {view === 'details' && (
            <Panel className="p-6">
              <form onSubmit={onSubmit('details')} className="flex flex-col gap-4">
                <div className="text-[13.5px] text-parish-muted">Shown on the GKK's page of the website. The GKK's name is kept by the parish office.</div>
                <FlagEmptyRequired.Provider value>
                  <ChapelFields form={form} setForm={setForm} setError={setError} addressError={addressError} setAddressError={setAddressError} />
                </FlagEmptyRequired.Provider>
                <PagePhotoFields form={form} setForm={setForm} photos={pagePhotos} />
                {saveBar('Save details')}
              </form>
            </Panel>
          )}
          {view === 'history' && (
            <Panel className="p-6">
              <form onSubmit={onSubmit('history')} className="flex flex-col gap-4">
                <HistoryFields form={form} setForm={setForm} setError={setError} photos={historyPhotos} canPublish={false} />
                {saveBar('Save history')}
              </form>
            </Panel>
          )}
          {view === 'documents' && <Panel className="p-6"><GkkDocuments gkk={gkk} /></Panel>}
          {view === 'names' && (
            <Panel className="p-6">
              <div className="text-[13.5px] text-parish-muted mb-4">The names from the previous paper census, the reference for this census. Tick each family off as it registers.</div>
              <LastYearList ownGkk={name} parish={parish} canEdit={can(user, 'editCensus')} canManage={false} />
            </Panel>
          )}
        </>
      )}
      </div>
      </div>
    </div>
  );
}

/**
 * The My GKK sections as tabs down the left side; on phones they become a
 * row of pills above the content, scrolling sideways if they don't fit.
 */
function SideTabs({ tabs, value, onChange }) {
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible -mx-1 px-1 pb-1 md:pb-0 md:sticky md:top-4"
    >
      {tabs.map(([k, label]) => {
        const on = value === k;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(k)}
            className={`appearance-none flex-none md:w-full text-left whitespace-nowrap cursor-pointer px-4 py-2.5 rounded-xl border-[1.5px] font-semibold text-[14.5px] transition md:border-l-4 ${
              on
                ? 'bg-[var(--p-blue-tint)] border-[var(--p-blue-border)] md:border-l-[var(--p-blue)] text-parish-blue'
                : 'bg-transparent border-transparent text-parish-muted hover:bg-parish-field hover:text-parish-text2'
            } focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
