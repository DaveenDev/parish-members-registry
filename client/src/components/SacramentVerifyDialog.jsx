import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api.js';
import { VERIFICATION_SOURCES, fmtDate } from '../constants.js';
import { Field, TextInput, Select, PrimaryButton, GhostButton } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

/**
 * A sacrament's status at a glance: "—" (not claimed), amber "Claimed"
 * (self-reported, awaiting staff), or green "Verified". When `onClick` is
 * given and there is a claim, it's a button that opens the verify dialog.
 */
export function SacramentChip({ claimed, verified, label, onClick }) {
  if (!claimed) return <span className="text-[#d3c8ad]" aria-label={`${label}: not claimed`}>—</span>;
  const text = verified ? 'Verified' : 'Claimed';
  const cls = verified
    ? 'bg-[#eaf4ee] text-[#2f7a52] border-[#bfe0cc]'
    : 'bg-white text-[#a1762b] border-[#e8cf9f]';
  const content = (
    <>
      {verified ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.4z" /><path d="M8.5 12l2.3 2.3 4.7-4.6" /></svg>
      ) : (
        <span aria-hidden>✓</span>
      )}
      {text}
    </>
  );
  const base = `inline-flex items-center gap-1 text-[12px] font-bold px-2.5 py-1 rounded-full border-[1.5px] whitespace-nowrap ${cls}`;
  const aria = `${label}: ${verified ? 'verified' : 'claimed, not verified'}`;
  if (!onClick) return <span className={base} aria-label={aria}>{content}</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={`${aria}. Open verification`}
      className={`${base} cursor-pointer hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue`}
    >
      {content}
    </button>
  );
}

/** What the family reported for this sacrament, for the secretary to compare against the certificate. */
function claimedDetails(member, sacrament) {
  const parts = [
    member[sacrament.date] && fmtDate(String(member[sacrament.date]).slice(0, 10)),
    member[sacrament.church],
  ];
  if (sacrament.key === 'confirmation') parts.push(member.conf_name && `Name: ${member.conf_name}`, member.conf_sponsor && `Sponsor: ${member.conf_sponsor}`);
  if (sacrament.key === 'matrimony') parts.push(member.mat_type);
  return parts.filter(Boolean).join(' · ') || 'No date or church given';
}

/**
 * Mark a self-reported sacrament as verified against proof, or review /
 * remove an existing verification. Who and when are recorded by the server.
 */
export default function SacramentVerifyDialog({ member, sacrament, verification, onClose, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const titleId = useId();
  const [editing, setEditing] = useState(!verification);
  const [source, setSource] = useState(verification?.source || sacrament.defaultSource);
  const [reference, setReference] = useState(verification?.reference || '');
  const [saving, setSaving] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const name = [member.first_name, member.last_name, member.suffix].filter(Boolean).join(' ');

  async function save() {
    setSaving(true);
    try {
      await api.verifySacrament(member.id, sacrament.key, source, reference);
      toast.success(`${sacrament.label} verified for ${name}`);
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not save the verification');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Remove ${sacrament.label.toLowerCase()} verification?`,
      message: `${name}'s ${sacrament.label.toLowerCase()} will show as "Claimed" again until it is re-verified.`,
      confirmLabel: 'Remove verification',
      tone: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.unverifySacrament(member.id, sacrament.key);
      toast.success('Verification removed');
      onChanged?.();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Could not remove the verification');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-parish-navy/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl max-w-[520px] w-full shadow-2xl p-5 sm:p-7 max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 id={titleId} className="font-serif text-[24px] font-semibold m-0 text-parish-navy leading-tight">{sacrament.label} — {name}</h3>
          <button onClick={onClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none px-1">×</button>
        </div>
        <div className="mb-5"><SacramentChip claimed verified={!!verification} label={sacrament.label} /></div>

        <div className="border border-[#eee3ce] rounded-xl px-4 py-3 bg-[#fdfbf6] mb-5">
          <div className="font-bold text-[11.5px] tracking-[.1em] uppercase text-[var(--p-gold-deep)] mb-1">Reported by the family</div>
          <div className="text-[14px] text-parish-ink">{claimedDetails(member, sacrament)}</div>
        </div>

        {verification && !editing && (
          <div className="border border-[#bfe0cc] bg-[#f3faf6] rounded-xl px-4 py-3 mb-5 text-[14px] text-[#24543a]">
            <div className="font-semibold mb-0.5">Verified by {verification.verified_by_name || 'parish staff'} on {new Date(verification.verified_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
            <div>{[verification.source, verification.reference].filter(Boolean).join(' · ')}</div>
          </div>
        )}

        {editing && (
          <div className="flex flex-col gap-4 mb-5">
            <Field label="How was this verified?" required>
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                {VERIFICATION_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Reference (optional)">
              <TextInput placeholder="e.g. Book 3, Page 12, Line 4 or certificate no." value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
        )}

        <div className="flex flex-wrap gap-2.5 justify-end">
          {verification && !editing && (
            <>
              <button onClick={remove} disabled={saving} className="mr-auto appearance-none border-none bg-parish-errorBg text-parish-error cursor-pointer font-semibold text-[13px] px-4 py-2.5 rounded-lg">Remove verification</button>
              <GhostButton onClick={() => setEditing(true)} className="px-5 py-2.5 text-[14px]">Update</GhostButton>
              <PrimaryButton onClick={onClose} className="px-6 py-2.5 text-[14px]">Done</PrimaryButton>
            </>
          )}
          {editing && (
            <>
              <GhostButton onClick={verification ? () => setEditing(false) : onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
              <PrimaryButton onClick={save} disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Mark as verified'}</PrimaryButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
