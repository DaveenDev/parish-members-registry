import React, { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, EmptyState, ErrorState, LoadingState, Modal } from '../../components/admin.jsx';
import { StatusPill, Badge, Checkbox, PrimaryButton, GhostButton } from '../../components/ui.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { fmtDate, fmtDateTime } from '../../constants.js';
import { useAuth } from '../../AuthContext.jsx';
import { can, leaderGkk } from '../../lib/access.js';
import { bis, RELATIONSHIP_LABELS } from '../../lib/bisaya.js';

const fullName = (m) => [m.first_name, m.middle_name, m.last_name, m.suffix].filter(Boolean).join(' ');

/**
 * Members who look like the same person entered twice: same first name,
 * last name and date of birth (ignoring case and spacing). Families register
 * anonymously, so a second registration is the usual cause. Staff open each
 * record, then merge the records into one, or mark the group "not
 * duplicates" (which can be taken back below the list).
 */
export default function Duplicates() {
  const toast = useToast();
  const confirm = useConfirm();
  const layout = useOutletContext();
  const { data: groups, loading, error, reload: reloadGroups } = useAsyncData(() => api.findDuplicateMembers(), []);
  // Before 0074 there's no undo, but the list still loads.
  const dismissed = useAsyncData(() => api.listDismissedDuplicates().catch(() => []), []);
  const [openMemberId, setOpenMemberId] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [merging, setMerging] = useState(null); // a group while its merge window is open
  const { user } = useAuth();
  // Marking "Not duplicates": full access and GKK leaders (their GKK, 0050). Merging deletes a record: full access.
  const canReview = can(user, 'editRegistry');
  const canMerge = can(user, 'deleteRecords');
  function reload() {
    reloadGroups();
    dismissed.reload();
    layout?.refreshNavCounts?.();
  }

  async function undismiss(d) {
    setBusyKey(`d-${d.member_ids.join('-')}`);
    try {
      await api.undismissDuplicateGroup(d.member_ids);
      toast.success('Back on the list of possible duplicates');
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not change this group');
    } finally {
      setBusyKey(null);
    }
  }

  async function dismiss(group) {
    const first = group.members[0];
    const ok = await confirm({
      title: `Not duplicates?`,
      message: `${group.members.length} members named ${first.first_name} ${first.last_name}, born ${fmtDate(first.dob)}, will be treated as different people and hidden from this list. The group comes back if another matching member is registered.`,
      confirmLabel: 'Not duplicates',
    });
    if (!ok) return;
    setBusyKey(group.key);
    try {
      await api.dismissDuplicateGroup(group.member_ids);
      toast.success('Marked as different people');
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not update this group');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <>
      <PageHeader title="Possible duplicates" subtitle={leaderGkk(user) ? `Members of ${leaderGkk(user)} who share a name and date of birth` : 'Members who share a name and date of birth'} />
      <PageBody>
        <div>
          <div className="mb-[18px] px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
            Matches ignore capital letters, extra spaces, middle names and suffixes. Members without a date of birth aren't checked.
            Open each record to compare. If they're the same person, choose <strong>Merge</strong>: one record keeps everything from both and
            the other goes to the Trash. If the whole household was registered twice, delete the extra household from the Households page instead.
            If they really are different people, choose <strong>Not duplicates</strong>.
          </div>

          {loading && !groups && <LoadingState label="Looking for duplicates…" />}
          {error && !loading && <ErrorState message={error} onRetry={reload} />}
          {groups && !groups.length && (
            <EmptyState title="No possible duplicates" subtitle="No two members share a name and date of birth." />
          )}

          {!!groups?.length && (
            <>
              <div className="text-[13px] text-parish-muted mb-3">{groups.length} group(s) to review</div>
              <div className="flex flex-col gap-4">
                {groups.map((g) => {
                  const first = g.members[0];
                  return (
                    <section key={g.key} className="bg-parish-card border border-parish-border rounded-2xl shadow-cardSm overflow-hidden" aria-label={`${first.first_name} ${first.last_name}, born ${fmtDate(first.dob)}`}>
                      <div className="px-[18px] py-3.5 border-b border-parish-line flex items-center gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="font-serif text-[19px] font-semibold text-parish-navy">{first.first_name} {first.last_name}</div>
                          <div className="text-[12.5px] text-parish-muted">Born {fmtDate(first.dob)} · {g.members.length} records</div>
                        </div>
                        <Badge tone={g.same_household ? 'gold' : 'blue'}>{g.same_household ? 'Same household' : 'Different households'}</Badge>
                        <div className="ml-auto flex gap-2">
                          {canMerge && (
                            <button
                              onClick={() => setMerging(g)}
                              disabled={busyKey === g.key}
                              className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap disabled:opacity-60"
                            >
                              Merge…
                            </button>
                          )}
                          {canReview && <button
                            onClick={() => dismiss(g)}
                            disabled={busyKey === g.key}
                            className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg whitespace-nowrap disabled:opacity-60"
                          >
                            {busyKey === g.key ? 'Saving…' : 'Not duplicates'}
                          </button>}
                        </div>
                      </div>
                      <div className="grid gap-px bg-parish-track" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
                        {g.members.map((m) => (
                          <div key={m.id} className="bg-parish-card px-[18px] py-3.5 flex flex-col gap-1.5">
                            <div className="font-semibold text-[14.5px] text-parish-navy">{fullName(m)}</div>
                            <div className="text-[13px] text-parish-text2">{bis(RELATIONSHIP_LABELS, m.relationship) || '—'} in <strong>{m.household_name}</strong></div>
                            <div className="flex items-center gap-2 flex-wrap text-[12px] text-parish-muted">
                              <StatusPill status={m.household_status} />
                              {m.ref_no && <span>{m.ref_no}</span>}
                              <span>Registered {fmtDateTime(m.registered_at, { time: false })}</span>
                            </div>
                            <div className="flex gap-2 mt-1">
                              <button onClick={() => setOpenMemberId(m.id)} className="appearance-none border-none cursor-pointer px-3 py-1.5 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg">Open member</button>
                              <Link to={`/admin/households?status=All&q=${encodeURIComponent(m.household_name)}`} className="px-3 py-1.5 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg no-underline">View household</Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          {!!dismissed.data?.length && (
            <details className="mt-8 group">
              <summary className="cursor-pointer list-none flex items-center gap-2.5 mb-3">
                <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">Marked not duplicates ({dismissed.data.length})</span>
                <span className="text-[12px] text-parish-muted group-open:hidden">Show</span>
                <span className="flex-1 h-px bg-parish-track" />
              </summary>
              <ul className="list-none m-0 p-0 flex flex-col gap-2">
                {dismissed.data.map((d) => {
                  const key = `d-${d.member_ids.join('-')}`;
                  return (
                    <li key={key} className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-parish-line2 bg-parish-card">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[14px] text-parish-navy">
                          {d.members.map((m) => `${fullName(m)} (${m.household_name})`).join(' · ')}
                        </div>
                        <div className="text-[12.5px] text-parish-muted">
                          {[d.members[0]?.dob && `Born ${fmtDate(d.members[0].dob)}`, `marked ${fmtDateTime(d.dismissed_at, { time: false })}`, d.dismissed_by_name && `by ${d.dismissed_by_name}`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {canReview && (
                        <button onClick={() => undismiss(d)} disabled={busyKey === key} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap disabled:opacity-60">
                          {busyKey === key ? 'Saving…' : 'Undo'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      </PageBody>

      {merging && <MergeDialog group={merging} onClose={() => setMerging(null)} onMerged={() => { setMerging(null); reload(); }} />}
      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={reload} />}
    </>
  );
}

/**
 * Merge a group's records into one: pick the record to keep (the first one
 * registered, unless changed) and which others are the same person.
 */
function MergeDialog({ group, onClose, onMerged }) {
  const toast = useToast();
  const [keepId, setKeepId] = useState(group.members[0].id);
  const [others, setOthers] = useState(() => new Set(group.members.slice(1).map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = group.members.filter((m) => m.id !== keepId && others.has(m.id));
  const keep = group.members.find((m) => m.id === keepId);

  function chooseKeep(id) {
    setKeepId(id);
    // The record kept can't also be merged away; the one it replaces becomes a choice.
    setOthers(new Set(group.members.filter((m) => m.id !== id).map((m) => m.id)));
  }
  function toggle(id) {
    setOthers((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function merge() {
    setBusy(true);
    setError('');
    let done = 0;
    try {
      for (const m of chosen) {
        await api.mergeMembers(keepId, m.id);
        done += 1;
      }
      toast.success(`${done} record(s) merged into ${fullName(keep)}. The other record is in the Trash for 30 days.`);
      onMerged();
    } catch (e) {
      setError(`${done ? `${done} merged, then: ` : ''}${e.message || 'Could not merge these records'}`);
      if (done) onMerged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Merge duplicate records" onClose={onClose} maxWidth={560}>
      <p className="text-[13.5px] text-parish-text2 leading-relaxed mt-0 mb-4">
        The record you keep gets what it's missing from the others: blank details, sacraments, ministries and organizations, blood type,
        sacrament verifications and census answers, and every request linked to them. The others go to the Trash, where they stay for 30 days.
      </p>
      {error && <div role="alert" className="mb-3 text-[13.5px] text-parish-error font-medium">{error}</div>}
      <fieldset className="border-none p-0 m-0 flex flex-col gap-2">
        <legend className="font-semibold text-[13px] text-parish-ink mb-2">Keep this record</legend>
        {group.members.map((m) => (
          <div key={m.id} className={`flex items-start gap-3 px-3.5 py-3 rounded-xl border-[1.5px] ${m.id === keepId ? 'border-parish-blue bg-[var(--p-blue-tint)]' : 'border-parish-line2 bg-parish-field'}`}>
            <input type="radio" name="keep" checked={m.id === keepId} onChange={() => chooseKeep(m.id)} aria-label={`Keep ${fullName(m)} in ${m.household_name}`} className="mt-1 w-[18px] h-[18px] accent-parish-blue cursor-pointer" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-[14px] text-parish-navy">{fullName(m)}</div>
              <div className="text-[12.5px] text-parish-muted">
                {[`${bis(RELATIONSHIP_LABELS, m.relationship) || '—'} in ${m.household_name}`, m.ref_no, `registered ${fmtDateTime(m.registered_at, { time: false })}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            {m.id !== keepId && (
              <label className="flex items-center gap-2 text-[12.5px] font-semibold text-parish-text2 cursor-pointer whitespace-nowrap">
                <Checkbox checked={others.has(m.id)} onChange={() => toggle(m.id)} /> Merge in
              </label>
            )}
          </div>
        ))}
      </fieldset>
      {chosen.some((m) => m.household_id !== keep.household_id) && (
        <p className="text-[12.5px] text-parish-muted mt-3 mb-0">
          The record kept stays in {keep.household_name}. If the other household was registered twice, delete it from the Households page once you've merged.
        </p>
      )}
      <div className="flex justify-end gap-2.5 mt-5">
        <GhostButton onClick={onClose} className="px-4 py-2.5 text-[13.5px]">Cancel</GhostButton>
        <PrimaryButton onClick={merge} disabled={busy || !chosen.length} className="px-5 py-2.5 text-[13.5px]">
          {busy ? 'Merging…' : `Merge ${chosen.length} into this record`}
        </PrimaryButton>
      </div>
    </Modal>
  );
}
