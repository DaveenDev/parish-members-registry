import React, { useState } from 'react';
import { GKK_ROLES } from '../../constants.js';
import { nameInitials } from '../../lib/orgChart.js';
import { Field, GhostButton, Select, TextInput } from '../ui.jsx';
import { RowButton, SectionLabel } from '../panels.jsx';
import { FilePick } from '../website/shared.jsx';
import MemberPicker, { pickedName } from './MemberPicker.jsx';

/** A round photo, or the holder's initials when there's none. */
export function HolderAvatar({ photo, name, size = 44 }) {
  if (photo) return <img src={photo} alt="" className="rounded-full object-cover flex-none border border-parish-border" style={{ width: size, height: size }} />;
  return (
    <span
      aria-hidden
      className="rounded-full flex-none flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'var(--p-navy)' }}
    >
      {nameInitials(name) || <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="currentColor"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg>}
    </span>
  );
}

/**
 * The selected position's details, beside the canvas. Changes go straight
 * into the chart (saved with Save). `scope` 'gkk' is the GKK Structure: a
 * GKK role instead of a holder, since every GKK has its own.
 */
export default function NodePanel({ node, scope, positions, canEdit, onChange, onAddChild, onDelete, photos }) {
  const [error, setError] = useState('');
  const d = node.data;
  const linked = !!d.positionName;
  const holder = d.memberName || d.holderName;

  async function pickPhoto([file]) {
    setError('');
    try {
      const url = await photos.upload(file);
      if (d.photoUrl) photos.drop(d.photoUrl);
      onChange({ photoUrl: url });
    } catch (e) {
      setError(e.message || 'Could not upload the photo');
    }
  }

  function removePhoto() {
    photos.drop(d.photoUrl);
    onChange({ photoUrl: '' });
  }

  return (
    <div className="flex flex-col gap-3.5">
      <SectionLabel>Position</SectionLabel>
      <Field label="Parish position">
        <Select
          value={d.positionName || ''} disabled={!canEdit}
          onChange={(e) => onChange(e.target.value ? { positionName: e.target.value, title: e.target.value } : { positionName: null })}
        >
          <option value="">Not linked (type a title below)</option>
          {d.positionName && !positions.includes(d.positionName) && <option value={d.positionName}>{d.positionName}</option>}
          {positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </Field>
      <Field label="Title" required>
        <TextInput
          value={d.title} disabled={!canEdit || linked} maxLength={120}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="e.g. Parish Priest, Lector Coordinator"
        />
      </Field>
      {linked && <p className="m-0 -mt-2 text-[12.5px] text-parish-muted">Linked to the Parish Organization Structure list: renaming it there renames it here too.</p>}

      {scope === 'gkk' ? (
        <>
          <SectionLabel>Officer in each GKK</SectionLabel>
          <Field label="GKK role">
            <Select value={d.gkkRole || ''} disabled={!canEdit} onChange={(e) => onChange({ gkkRole: e.target.value || null })}>
              <option value="">None: set per GKK below the chart</option>
              {GKK_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <p className="m-0 -mt-1 text-[12.5px] text-parish-muted">
            {d.gkkRole
              ? `Each GKK's page shows its member registered as ${d.gkkRole} (Katungdanan sa GKK), with no typing twice.`
              : 'Without a GKK role, each GKK\'s holder is set in "Officers per GKK" below the chart.'}
          </p>
        </>
      ) : (
        <>
          <SectionLabel>Holder</SectionLabel>
          {holder ? (
            <div className="flex items-center gap-3 border border-parish-line2 rounded-xl bg-parish-field px-3 py-2.5">
              <HolderAvatar photo={d.photoUrl} name={holder} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] text-parish-navy truncate">{holder}</div>
                <div className="text-[12px] text-parish-muted">{d.memberId ? 'From the registry' : 'Typed in'}</div>
              </div>
              {canEdit && <RowButton tone="gray" onClick={() => onChange({ memberId: null, memberName: '', holderName: '' })}>Remove</RowButton>}
            </div>
          ) : (
            <div className="text-[13px] text-parish-muted">Vacant. The website shows the position with no name.</div>
          )}
          {canEdit && (
            <>
              <MemberPicker onPick={(m) => onChange({ memberId: m.id, memberName: pickedName(m), holderName: '' })} />
              {!d.memberId && (
                <Field label="Or type a name (not in the registry)">
                  <TextInput value={d.holderName} maxLength={120} onChange={(e) => onChange({ holderName: e.target.value })} placeholder="e.g. Rev. Fr. Juan Dela Cruz" />
                </Field>
              )}
            </>
          )}

          <SectionLabel>Photo</SectionLabel>
          <div className="flex items-center gap-3 flex-wrap">
            <HolderAvatar photo={d.photoUrl} name={holder} size={56} />
            {canEdit && (
              <div className="flex flex-col gap-1.5 items-start">
                <FilePick label={photos.uploading ? 'Uploading…' : d.photoUrl ? 'Replace photo' : 'Upload photo'} onFiles={pickPhoto} disabled={photos.uploading} />
                {d.photoUrl && <button type="button" onClick={removePhoto} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error">Remove photo</button>}
              </div>
            )}
          </div>
          <p className="m-0 text-[12.5px] text-parish-muted">The photo and name show on the public website once the chart is published. With no photo, the initials show instead.</p>
        </>
      )}

      <Field label="Note">
        <TextInput value={d.note} disabled={!canEdit} maxLength={300} onChange={(e) => onChange({ note: e.target.value })} placeholder="e.g. 2025–2028" />
      </Field>
      {error && <div role="alert" className="text-parish-error text-[13px] font-medium">{error}</div>}

      {canEdit && (
        <div className="flex gap-2 flex-wrap pt-1">
          <GhostButton type="button" onClick={onAddChild} className="px-3.5 py-2 text-[13.5px]">+ Add position under</GhostButton>
          <button type="button" onClick={onDelete} className="appearance-none cursor-pointer px-3.5 py-2 rounded-xl border-[1.5px] border-parish-errorBorder bg-parish-errorBg text-parish-error font-semibold text-[13.5px]">Delete position</button>
        </div>
      )}
    </div>
  );
}
