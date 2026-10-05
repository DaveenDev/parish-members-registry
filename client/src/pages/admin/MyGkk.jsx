import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { Panel, Tabs, ErrorState, LoadingState } from '../../components/admin.jsx';
import { FlagEmptyRequired, PrimaryButton } from '../../components/ui.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { useToast } from '../../ToastContext.jsx';
import GkkDocuments from '../../components/GkkDocuments.jsx';
import LastYearList from '../../components/LastYearList.jsx';
import {
  ChapelFields, HistoryFields, PagePhotoFields, chapelPatch, chapelProblem, gkkForm, historyPatch, photosPatch, samePhotos, useGkkPhotos,
} from '../../components/GkkFields.jsx';

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
  const name = user?.access === 'gkk_leader' ? user.accessGkk : null;
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some(([k]) => k === params.get('view')) ? params.get('view') : 'details';
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
  const [parish, setParish] = useState(null);
  const pagePhotos = useGkkPhotos(setError);
  const historyPhotos = useGkkPhotos(setError);

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
      toast.success(what === 'details' ? 'Details saved' : 'History saved. The parish office will review it for the website.');
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
    <div className="max-w-[900px]">
      <div className="font-serif text-[22px] font-semibold text-parish-navy mb-3">{name}</div>
      <Tabs tabs={VIEWS} value={view} onChange={(k) => { setView(k); setError(''); }} />
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
  );
}
