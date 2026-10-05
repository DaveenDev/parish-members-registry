import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput, Select, Badge } from './ui.jsx';
import { LoadingState, ErrorState } from './admin.jsx';
import { RowButton } from './panels.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useToast } from '../ToastContext.jsx';
import { fmtDateTime } from '../constants.js';
import { GKK_DOCUMENT_ACCEPT, GKK_DOCUMENT_KINDS, fmtFileSize, gkkDocumentType, titleFromFileName } from '../lib/gkkDocuments.js';

const KIND_TONES = { 'Land title': 'gold', 'Deed of donation': 'blue', 'Deed of sale': 'blue', 'Tax declaration': 'green', 'Survey plan': 'green' };

// Enter in these boxes must not submit the GKK panel's form around them.
const noSubmit = (e) => { if (e.key === 'Enter') e.preventDefault(); };

/**
 * A GKK's important documents (0044): land titles, deeds, tax declarations…
 * in a private bucket that only full-access staff and the GKK's own leader
 * can reach. Files open through links that expire after a few minutes.
 * Uploads and deletes happen at once, not with the panel's Save.
 */
export default function GkkDocuments({ gkk, canEdit = true }) {
  const confirm = useConfirm();
  const toast = useToast();
  const fileRef = useRef(null);
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null); // { file, title, kind, note } while adding one
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  function load() {
    setError('');
    api.listGkkDocuments(gkk.id).then(setDocs).catch((e) => setError(e.message || 'Could not load the documents'));
  }
  useEffect(() => { setDocs(null); load(); }, [gkk.id]);

  function pick(file) {
    if (!file) return;
    try {
      gkkDocumentType(file);
    } catch (e) {
      toast.error(e.message);
      return;
    }
    setDraft({ file, title: titleFromFileName(file.name), kind: /title|tct|oct/i.test(file.name) ? 'Land title' : 'Other', note: '' });
  }

  async function upload() {
    const title = draft.title.trim();
    if (!title) { toast.error('Give the document a title.'); return; }
    setBusy(true);
    try {
      const saved = await api.uploadGkkDocument(gkk.id, draft.file, { title, kind: draft.kind, note: draft.note.trim() });
      setDocs((d) => [saved, ...(d || [])]);
      setDraft(null);
      toast.success(`${title} uploaded`);
    } catch (e) {
      toast.error(e.message || 'Could not upload the document');
    } finally {
      setBusy(false);
    }
  }

  async function open(doc, download = false) {
    // Opened before the link is fetched, so the browser doesn't block it as a pop-up.
    const win = download ? null : window.open('', '_blank');
    setBusyId(doc.id);
    try {
      const url = await api.gkkDocumentLink(doc, { download });
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      toast.error(e.message || 'Could not open the file');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(doc) {
    const ok = await confirm({
      title: `Delete “${doc.title}”?`,
      message: `The file ${doc.file_name} is deleted for good. Keep the paper original safe, and download a copy first if you still need one.`,
      confirmLabel: 'Delete document',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(doc.id);
    try {
      await api.deleteGkkDocument(doc);
      setDocs((d) => d.filter((x) => x.id !== doc.id));
      toast.success(`${doc.title} deleted`);
    } catch (e) {
      toast.error(e.message || 'Could not delete the document');
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] text-parish-muted">
        Land titles, deeds, tax declarations and other important papers of {gkk.name}, as PDFs, photos or scans (up to 20 MB each). Private: only full-access staff and this GKK's leader can open them.
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !docs ? <LoadingState label="Loading…" /> : !docs.length && !draft ? (
        <div className="text-[13.5px] text-parish-muted border border-dashed border-parish-borderStrong rounded-xl px-4 py-5 text-center">No documents yet.</div>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-start gap-3 flex-wrap border border-parish-line2 rounded-xl px-3.5 py-2.5 bg-parish-field">
              <div className="flex-1 min-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={KIND_TONES[d.kind] || 'gray'}>{d.kind}</Badge>
                  <span className="font-semibold text-[14.5px] text-parish-navy break-words">{d.title}</span>
                </div>
                {d.note && <div className="text-[13px] text-parish-text2 mt-0.5 break-words">{d.note}</div>}
                <div className="text-[12px] text-parish-muted mt-0.5 break-words">
                  {[d.file_name, d.size_bytes != null && fmtFileSize(d.size_bytes), d.uploaded_by_name && `by ${d.uploaded_by_name}`, fmtDateTime(d.created_at, { time: false })].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex gap-1.5">
                <RowButton disabled={busyId === d.id} onClick={() => open(d)}>Open</RowButton>
                <RowButton tone="gray" disabled={busyId === d.id} onClick={() => open(d, true)}>Download</RowButton>
                {canEdit && <RowButton tone="red" disabled={busyId === d.id} onClick={() => remove(d)}>Delete</RowButton>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit && draft && (
        <div className="border border-parish-borderStrong rounded-xl p-3.5 bg-parish-card flex flex-col gap-3">
          <div className="text-[13px] text-parish-text2 break-words">
            <span className="font-semibold text-parish-navy">{draft.file.name}</span> · {fmtFileSize(draft.file.size)}
          </div>
          <Field label="Title" required>
            <TextInput value={draft.title} maxLength={200} onKeyDown={noSubmit} placeholder="e.g. TCT No. T-12345, chapel lot" onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Field label="Kind">
              <Select value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
                {GKK_DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Field label="Note">
              <TextInput value={draft.note} maxLength={500} onKeyDown={noSubmit} placeholder="e.g. Original kept at the parish office" onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <RowButton tone="gray" disabled={busy} onClick={() => setDraft(null)} className="px-4 py-2">Cancel</RowButton>
            <RowButton disabled={busy} onClick={upload} className="px-4 py-2">{busy ? 'Uploading…' : 'Upload document'}</RowButton>
          </div>
        </div>
      )}

      {canEdit && !draft && (
        <div>
          <button type="button" onClick={() => fileRef.current?.click()} className="appearance-none border-none cursor-pointer px-4 py-2 font-semibold text-[13.5px] text-white bg-parish-fill rounded-xl">
            + Add document
          </button>
          <input ref={fileRef} type="file" accept={GKK_DOCUMENT_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
        </div>
      )}
    </div>
  );
}
