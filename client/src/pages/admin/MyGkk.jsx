import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, Panel, Tabs, ErrorState, LoadingState } from '../../components/admin.jsx';
import { FlagEmptyRequired, PrimaryButton } from '../../components/ui.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { useToast } from '../../ToastContext.jsx';
import GkkDocuments from '../../components/GkkDocuments.jsx';
import LastYearList from '../../components/LastYearList.jsx';
import { ChapelFields, HistoryFields, chapelPatch, chapelProblem, gkkForm, historyPatch, useHistoryPhotos } from '../../components/GkkFields.jsx';

const TABS = [['details', 'Details'], ['history', 'History'], ['documents', 'Documents'], ['names', "Last year's list"]];

/**
 * My GKK (0045): a GKK leader's page for their own GKK, without the list of
 * every GKK. They keep its chapel details and history (the parish office
 * publishes the history on the website), its documents, and last year's
 * household names. Full-access staff do all of this under Parish Config →
 * Parish GKK.
 */
export default function MyGkk() {
  const { user } = useAuth();
  const toast = useToast();
  const name = user?.access === 'gkk_leader' ? user.accessGkk : null;
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'details';
  const setTab = (k) => setParams(k === 'details' ? {} : { tab: k }, { replace: true });

  const [gkk, setGkk] = useState(null);
  const [form, setForm] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [saving, setSaving] = useState(false);
  const [parish, setParish] = useState(null);
  const photos = useHistoryPhotos(setForm, setError);

  function load() {
    setLoadError('');
    api.listGkkDetails()
      .then(({ rows }) => {
        const g = rows.find((r) => r.name === name);
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
    return () => photos.rollback();
  }, [name]);

  async function save(what) {
    setError('');
    if (what === 'details') {
      const problem = chapelProblem(form);
      if (problem) { if (!form.chapel_address.trim()) setAddressError(problem); setError(problem); return; }
    }
    if (what === 'history' && photos.uploading) { setError('Wait for the photos to finish uploading.'); return; }
    setSaving(true);
    try {
      const saved = await api.saveGkkDetails(gkk.id, what === 'details' ? chapelPatch(form) : historyPatch(form, { withPublished: false }));
      if (what === 'history') photos.commit();
      setGkk(saved);
      // Keep unsaved edits on the other tab; take what the database saved for this one.
      const fresh = gkkForm(saved);
      setForm((f) => (what === 'details'
        ? { ...f, chapel_address: fresh.chapel_address, puroks: fresh.puroks, year_established: fresh.year_established, meeting_schedule: fresh.meeting_schedule, meeting_place: fresh.meeting_place }
        : { ...f, history: fresh.history, history_photos: fresh.history_photos, history_published: fresh.history_published }));
      toast.success(what === 'details' ? 'Details saved' : 'History saved. The parish office will review it for the website.');
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  if (!name) {
    return (
      <>
        <PageHeader title="My GKK" />
        <PageBody>
          <Panel className="p-6 text-[14px] text-parish-text2">
            This page is for GKK leader accounts. The GKKs are kept under <Link to="/admin/settings?tab=gkk" className="font-semibold text-parish-blue">Parish Config → Parish GKK</Link>.
          </Panel>
        </PageBody>
      </>
    );
  }

  const saveBar = (what, label) => (
    <div className="flex items-center gap-3 justify-end flex-wrap">
      {error && <div role="alert" className="mr-auto text-parish-error text-[13.5px] font-medium">{error}</div>}
      <PrimaryButton type="submit" disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : label}</PrimaryButton>
    </div>
  );
  const onSubmit = (what) => (e) => { e.preventDefault(); if (!saving) save(what); };

  return (
    <>
      <PageHeader title="My GKK" subtitle={name} />
      <PageBody>
        <div className="max-w-[900px]">
          <Tabs tabs={TABS} value={tab} onChange={(k) => { setTab(k); setError(''); }} />
          {loadError ? <ErrorState message={loadError} onRetry={load} /> : !form ? <LoadingState label="Loading…" /> : (
            <>
              {tab === 'details' && (
                <Panel className="p-6">
                  <form onSubmit={onSubmit('details')} className="flex flex-col gap-4">
                    <div className="text-[13.5px] text-parish-muted">Shown in the website's GKK directory. The GKK's name is kept by the parish office.</div>
                    <FlagEmptyRequired.Provider value>
                      <ChapelFields form={form} setForm={setForm} setError={setError} addressError={addressError} setAddressError={setAddressError} />
                    </FlagEmptyRequired.Provider>
                    {saveBar('details', 'Save details')}
                  </form>
                </Panel>
              )}
              {tab === 'history' && (
                <Panel className="p-6">
                  <form onSubmit={onSubmit('history')} className="flex flex-col gap-4">
                    <HistoryFields form={form} setForm={setForm} setError={setError} photos={photos} canPublish={false} />
                    {saveBar('history', 'Save history')}
                  </form>
                </Panel>
              )}
              {tab === 'documents' && (
                <Panel className="p-6"><GkkDocuments gkk={gkk} /></Panel>
              )}
              {tab === 'names' && (
                <Panel className="p-6">
                  <div className="text-[13.5px] text-parish-muted mb-4">The names from the previous paper census, the reference for this census. Tick each family off as it registers.</div>
                  <LastYearList ownGkk={name} parish={parish} canEdit={can(user, 'editCensus')} canManage={false} />
                </Panel>
              )}
            </>
          )}
        </div>
      </PageBody>
    </>
  );
}
