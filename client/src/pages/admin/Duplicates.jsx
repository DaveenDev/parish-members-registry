import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, EmptyState, ErrorState, LoadingState } from '../../components/admin.jsx';
import { StatusPill, Badge } from '../../components/ui.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { fmtDate, fmtDateTime } from '../../constants.js';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { bis, RELATIONSHIP_LABELS } from '../../lib/bisaya.js';

const fullName = (m) => [m.first_name, m.middle_name, m.last_name, m.suffix].filter(Boolean).join(' ');

/**
 * Members who look like the same person entered twice: same first name,
 * last name and date of birth (ignoring case and spacing). Families register
 * anonymously, so a second registration is the usual cause. Staff open each
 * record to remove the extra one, or mark the group "not duplicates".
 */
export default function Duplicates() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: groups, loading, error, reload } = useAsyncData(() => api.findDuplicateMembers(), []);
  const [openMemberId, setOpenMemberId] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const { user } = useAuth();

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
      <PageHeader title="Possible duplicates" subtitle="Members who share a name and date of birth" />
      <PageBody>
        <div className="max-w-[920px]">
          <div className="mb-[18px] px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
            Matches ignore capital letters, extra spaces, middle names and suffixes. Members without a date of birth aren't checked.
            Open each record to compare, then delete the extra member, or the whole extra household from the Households page.
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
                        {can(user, 'deleteRecords') && <button
                          onClick={() => dismiss(g)}
                          disabled={busyKey === g.key}
                          className="ml-auto appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg whitespace-nowrap disabled:opacity-60"
                        >
                          {busyKey === g.key ? 'Saving…' : 'Not duplicates'}
                        </button>}
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
        </div>
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={reload} />}
    </>
  );
}
