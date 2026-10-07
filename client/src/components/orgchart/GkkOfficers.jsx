import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { Modal, Panel } from '../admin.jsx';
import { Field, GhostButton, PrimaryButton, TextInput } from '../ui.jsx';
import { RowButton } from '../panels.jsx';
import { FilePick, UploadOverlay } from '../website/shared.jsx';
import MemberPicker, { pickedName } from './MemberPicker.jsx';
import { HolderAvatar } from './NodePanel.jsx';
import { usePhotoUploads } from './usePhotoUploads.js';

const SOURCE_LABEL = { set: 'Set here', registry: 'From the registry' };

/**
 * "Officers per GKK" under the GKK Structure: who holds each position in
 * one GKK. Positions with a GKK role take the member registered with it;
 * any position can be given another name, a photo or a note for this GKK.
 */
export default function GkkOfficers({ gkk, positions, preview, canEdit, dirty, onChanged }) {
  const [editing, setEditing] = useState(null);
  return (
    <Panel className="mt-4 overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-parish-line flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="m-0 font-serif text-[20px] font-semibold text-parish-navy">Officers in {gkk}</h3>
        <span className="text-[12.5px] text-parish-muted">Shown on the GKK's page under “Mga Opisyal” once the GKK Structure is published.</span>
      </div>
      {dirty && <div className="px-4 sm:px-5 py-2.5 text-[13px] bg-parish-warnBg text-parish-warnStrong">Save the structure first: this list shows the saved positions.</div>}
      <ul className="list-none m-0 p-0 divide-y divide-parish-line">
        {positions.map((p) => {
          const r = preview?.[p.id];
          const names = r?.holders || [];
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 flex-wrap sm:flex-nowrap">
              <HolderAvatar photo={r?.photo} name={names[0]} size={36} />
              <div className="flex-1 min-w-[160px]">
                <div className="font-semibold text-[14px] text-parish-navy">{p.title}</div>
                <div className="text-[12.5px] text-parish-muted">{p.gkkRole ? `GKK role: ${p.gkkRole}` : 'No GKK role'}{r?.note ? ` · ${r.note}` : ''}</div>
              </div>
              <div className="min-w-[160px] sm:text-right">
                <div className={`text-[14px] ${names.length ? 'text-parish-ink font-semibold' : 'text-parish-muted italic'}`}>{names.length ? names.join(', ') : 'Vacant (Bakante)'}</div>
                {r?.source && <div className="text-[12px] text-parish-muted">{SOURCE_LABEL[r.source]}</div>}
              </div>
              {canEdit && <RowButton onClick={() => setEditing(p)}>Edit</RowButton>}
            </li>
          );
        })}
        {!positions.length && <li className="px-5 py-6 text-[13.5px] text-parish-muted">No positions saved yet.</li>}
      </ul>
      {editing && (
        <OfficerEditor
          gkk={gkk} position={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
        />
      )}
    </Panel>
  );
}

function OfficerEditor({ gkk, position, onClose, onSaved }) {
  const toast = useToast();
  const photos = usePhotoUploads();
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.listOrgGkkHolders(gkk)
      .then((rows) => {
        if (!live) return;
        const row = rows.find((r) => r.node_id === position.id);
        const f = {
          memberId: row?.member_id || null,
          memberName: row?.member ? pickedName(row.member) : '',
          holderName: row?.holder_name || '',
          photoUrl: row?.photo_url || '',
          note: row?.note || '',
        };
        setForm(f);
        setSaved(row ? f : null);
      })
      .catch((e) => live && setError(e.message || 'Could not load'));
    return () => { live = false; };
  }, [gkk, position.id]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  function close() {
    photos.forget();
    onClose();
  }

  async function pickPhoto([file]) {
    setError('');
    try {
      const url = await photos.upload(file);
      photos.drop(form.photoUrl);
      set({ photoUrl: url });
    } catch (e) {
      setError(e.message || 'Could not upload the photo');
    }
  }

  async function save(values) {
    setBusy(true);
    setError('');
    try {
      await api.saveOrgGkkHolder({ nodeId: position.id, gkk, ...values });
      photos.forget([values.photoUrl]);
      // The photo it had before, if it was replaced or removed.
      if (saved?.photoUrl && saved.photoUrl !== values.photoUrl) api.deleteImage(saved.photoUrl).catch(() => {});
      toast.success(`${position.title} in ${gkk} saved`);
      onSaved();
    } catch (e) {
      setError(e.message || 'Could not save');
      setBusy(false);
    }
  }

  const holder = form?.memberName || form?.holderName;
  return (
    <Modal title={`${position.title} · ${gkk}`} onClose={close} maxWidth={520}>
      {!form ? (
        error ? <div role="alert" className="text-parish-error text-[13.5px]">{error}</div> : <div className="text-[13.5px] text-parish-muted">Loading…</div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <p className="m-0 text-[13px] text-parish-muted">
            {position.gkkRole
              ? `Leave the holder empty to show ${gkk}'s member registered as ${position.gkkRole}. Pick or type someone to show them instead.`
              : `Pick a member of ${gkk}, or type a name.`}
          </p>
          {holder ? (
            <div className="flex items-center gap-3 border border-parish-line2 rounded-xl bg-parish-field px-3 py-2.5">
              <HolderAvatar photo={form.photoUrl} name={holder} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] text-parish-navy truncate">{holder}</div>
                <div className="text-[12px] text-parish-muted">{form.memberId ? 'From the registry' : 'Typed in'}</div>
              </div>
              <RowButton tone="gray" onClick={() => set({ memberId: null, memberName: '', holderName: '' })}>Remove</RowButton>
            </div>
          ) : null}
          <MemberPicker gkk={gkk} onPick={(m) => set({ memberId: m.id, memberName: pickedName(m), holderName: '' })} />
          {!form.memberId && (
            <Field label="Or type a name">
              <TextInput value={form.holderName} maxLength={120} onChange={(e) => set({ holderName: e.target.value })} />
            </Field>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-none">
              <HolderAvatar photo={form.photoUrl} name={holder} size={52} />
              <UploadOverlay busy={photos.uploading} round />
            </div>
            <FilePick label={form.photoUrl ? 'Replace photo' : 'Upload photo'} onFiles={pickPhoto} busy={photos.uploading} />
            {form.photoUrl && !photos.uploading && <button type="button" onClick={() => { photos.drop(form.photoUrl); set({ photoUrl: '' }); }} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error">Remove photo</button>}
          </div>
          <Field label="Note">
            <TextInput value={form.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. 2025–2028" />
          </Field>
          {error && <div role="alert" className="text-parish-error text-[13px] font-medium">{error}</div>}
          <div className="flex gap-2.5 justify-end flex-wrap pt-1">
            {saved && (
              <GhostButton type="button" disabled={busy} onClick={() => save({ memberId: null, holderName: '', photoUrl: '', note: '' })} className="px-4 py-2.5 text-[14px] mr-auto">
                {position.gkkRole ? 'Use the registry' : 'Clear'}
              </GhostButton>
            )}
            <GhostButton type="button" onClick={close} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
            <PrimaryButton type="button" disabled={busy || photos.uploading} onClick={() => save(form)} className="px-6 py-2.5 text-[14px]">{busy ? 'Saving…' : 'Save'}</PrimaryButton>
          </div>
        </div>
      )}
    </Modal>
  );
}
