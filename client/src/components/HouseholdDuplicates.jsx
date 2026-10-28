import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../api.js';
import { EmptyState, ErrorState, LoadingState } from './admin.jsx';
import { StatusPill, Badge } from './ui.jsx';
import HouseholdViewDrawer from './HouseholdViewDrawer.jsx';
import { useAsyncData } from '../hooks.js';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { fmtDate, fmtDateTime } from '../constants.js';
import { useAuth } from '../AuthContext.jsx';
import { can } from '../lib/access.js';
import { bis, RELATIONSHIP_LABELS } from '../lib/bisaya.js';
import { useDuplicateFlags, SendButton, FlagStrip, OtherGkkNote } from './DuplicateFlag.jsx';

const fullName = (m) => [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ');
// As the database compares names (dup_text_key, 0092): lower case, letters and digits only.
const nameKey = (m) => `${m.first_name}|${m.last_name}`.toLowerCase().replace(/[^\p{L}\p{N}|]+/gu, '');
// Surname and birthday, which find "Ma. Cristina" and "Maria Cristina" alike.
const bornKey = (m) => `${m.last_name}|`.toLowerCase().replace(/[^\p{L}\p{N}|]+/gu, '') + m.dob;
const pairKey = (ids) => ids.join('-');

/**
 * Households that look like one house registered twice (0092): a family
 * that registered with the wrong Household Head and then again with the
 * right one, or registered by two people. Each pair shows how it was
 * checked (0095: address, contact, then members); staff compare them side
 * by side, then delete the extra one from the Households
 * page, or mark the pair "Not the same household" (which can be taken back
 * below the list). The Households page's Possible Duplicates tab.
 *
 * A GKK leader sees the pairs with a household of their GKK, other GKKs'
 * included (0094), and sends any pair to the parish office to fix.
 */
export default function HouseholdDuplicates() {
  const toast = useToast();
  const confirm = useConfirm();
  const layout = useOutletContext();
  const { user } = useAuth();
  const { data: pairs, loading, error, reload: reloadPairs } = useAsyncData(() => api.findDuplicateHouseholds(), []);
  const dismissed = useAsyncData(() => api.listDismissedHouseholdDuplicates().catch(() => []), []);
  const [viewing, setViewing] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  // As for members: full access, and GKK leaders for their GKK (0092).
  const canReview = can(user, 'editRegistry');

  function reload() {
    reloadPairs();
    dismissed.reload();
    layout?.refreshNavCounts?.();
  }
  const flags = useDuplicateFlags('households', reload);

  async function dismiss(pair) {
    const [a, b] = pair.households;
    const ok = await confirm({
      title: 'Not the same household?',
      message: `${a.household_name} and ${b.household_name} will be treated as different houses and hidden from this list.`,
      confirmLabel: 'Not the same household',
    });
    if (!ok) return;
    setBusyKey(pair.key);
    try {
      await api.dismissHouseholdDuplicate(pair.household_ids);
      toast.success('Marked as different households');
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not update this pair');
    } finally {
      setBusyKey(null);
    }
  }

  async function undismiss(d) {
    const key = `d-${pairKey(d.household_ids)}`;
    setBusyKey(key);
    try {
      await api.undismissHouseholdDuplicate(d.household_ids);
      toast.success('Back on the list, if the two still match');
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not change this pair');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <div className="mb-[18px] px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
        Each pair is checked like you would: the address and barangay, then the phone number or email, then the members by name
        and birthday, which are what confirm it's one house ("Ma." and "Maria" count as the same name when the surname and birthday
        match). A family that registered with the wrong Household Head and then again with the right one shows up here. Compare the two. If they're the same house, keep the one with the right Household Head:
        add anyone missing to it, merge the people in both under{' '}
        <Link to="/admin/members?view=duplicates" className="font-semibold text-parish-blue">Members → Possible Duplicates</Link>, then delete the extra
        household from the Households list (it stays in the Trash for 30 days). If they're different houses, choose <strong>Not the same household</strong>.
        {flags.canSend && (
          <> Pairs with a household of another GKK show here too. Only the parish office can delete a household or change another
          GKK's, so choose <strong>Send to the parish office</strong>: the office is alerted, and you're told when it's fixed.</>
        )}
      </div>

      {loading && !pairs && <LoadingState label="Looking for duplicate households…" />}
      {error && !loading && <ErrorState message={error} onRetry={reload} />}
      {pairs && !pairs.length && (
        <EmptyState title="No possible duplicate households" subtitle="No two households share enough to look like the same house." />
      )}

      {!!pairs?.length && (
        <>
          <div className="text-[13px] text-parish-muted mb-3">{pairs.length} pair(s) to review</div>
          <div className="flex flex-col gap-4">
            {pairs.map((p) => (
              <PairCard
                key={p.key} pair={p} canReview={canReview} busy={busyKey === p.key} flags={flags}
                onDismiss={() => dismiss(p)} onOpen={setViewing}
              />
            ))}
          </div>
        </>
      )}

      {!!dismissed.data?.length && (
        <details className="mt-8 group">
          <summary className="cursor-pointer list-none flex items-center gap-2.5 mb-3">
            <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">Marked not the same household ({dismissed.data.length})</span>
            <span className="text-[12px] text-parish-muted group-open:hidden">Show</span>
            <span className="flex-1 h-px bg-parish-track" />
          </summary>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {dismissed.data.map((d) => {
              const key = `d-${pairKey(d.household_ids)}`;
              return (
                <li key={key} className="flex items-center gap-3 flex-wrap px-4 py-3 rounded-xl border border-parish-line2 bg-parish-card">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14px] text-parish-navy">
                      {d.households.map((h) => [h.household_name, h.ref_no && `(${h.ref_no})`].filter(Boolean).join(' ')).join(' · ')}
                    </div>
                    <div className="text-[12.5px] text-parish-muted">
                      {[`marked ${fmtDateTime(d.dismissed_at, { time: false })}`, d.dismissed_by_name && `by ${d.dismissed_by_name}`].filter(Boolean).join(' · ')}
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

      {flags.dialog}
      {/* At the page's root, so the card's text styles don't reach the panel. */}
      {viewing && createPortal(<HouseholdViewDrawer household={viewing} readOnly onClose={() => setViewing(null)} />, document.body)}
    </div>
  );
}

// The address step (0095): how the two places compare.
const ADDRESS_STEP = {
  same: ['match', 'Same address and barangay'],
  purok: ['partial', 'Same purok and barangay, no house number or street to compare'],
  barangay: ['partial', 'Same barangay, a different street or purok'],
  different: ['miss', 'Different barangays'],
};
// "Same phone 0917…", or just "Same phone" when it's another GKK's ('' from 0095).
const same = (what, value) => (value ? `Same ${what} ${value}` : `Same ${what}`);

/**
 * The pair compared step by step, as the database did (0095): where they
 * are, how to reach them, then who lives there, the members being what
 * confirms one house. Each step: [tone, title, text, details].
 */
function steps(p) {
  const list = [];
  const [addrTone, addrText] = ADDRESS_STEP[p.address] || ['none', 'No address to compare'];
  list.push([addrTone, 'Address', addrText]);
  const contact = [p.phone != null && same('phone', p.phone), p.email != null && same('email', p.email)].filter(Boolean);
  list.push([contact.length ? 'match' : 'none', 'Contact', contact.length ? contact.join(' · ') : 'No phone number or email in common']);
  const confirmed = p.same_people.length + p.near_people.length;
  const smaller = Math.min(p.members_a, p.members_b);
  const details = [
    p.same_people.length > 0 && `Same name and birthday: ${p.same_people.join(', ')}`,
    p.near_people.length > 0 && `Same surname and birthday, first name spelled differently: ${p.near_people.join(', ')}`,
    p.name_only.length > 0 && `Same name, a different or no birthday: ${p.name_only.join(', ')}`,
  ].filter(Boolean);
  if (!smaller) list.push(['none', 'Members', 'No members to compare']);
  else {
    list.push([
      confirmed && (confirmed >= 2 || confirmed >= smaller) ? 'match' : confirmed || p.name_only.length ? 'partial' : 'miss',
      'Members',
      confirmed ? `${confirmed} of ${smaller} match by name and birthday` : 'Nobody matches by name and birthday',
      details,
    ]);
  }
  if (p.previous_ref != null) list.push(['match', 'Previous census', same('reference number', p.previous_ref)]);
  if (p.name) list.push(['match', 'Household name', `Same name, ${p.name}`]);
  return list;
}

const STEP_TONES = {
  match: ['✓', 'bg-parish-okBg text-parish-ok', 'matches'],
  partial: ['~', 'bg-[var(--p-gold-tint)] text-[var(--p-gold-deep)]', 'partly matches'],
  miss: ['✗', 'bg-parish-errorBg text-parish-error', "doesn't match"],
  none: ['–', 'bg-parish-sunk text-parish-muted', 'nothing to compare'],
};

function Steps({ pair }) {
  return (
    <ol className="list-none m-0 mt-2.5 p-0 flex flex-col gap-1.5 text-[13px]">
      {steps(pair).map(([tone, title, text, details]) => {
        const [mark, cls, said] = STEP_TONES[tone];
        return (
          <li key={title} className="flex items-start gap-2.5">
            <span className={`flex-none w-5 h-5 mt-px rounded-full flex items-center justify-center font-bold text-[12px] ${cls}`} aria-label={said}>{mark}</span>
            <div className="min-w-0">
              <span className="font-semibold text-parish-text2">{title}: </span>
              <span className="text-parish-ink break-words">{text}</span>
              {details?.map((d) => <div key={d} className="text-[12.5px] text-parish-muted break-words">{d}</div>)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PairCard({ pair: p, canReview, busy, flags, onDismiss, onOpen }) {
  const [a, b] = p.households;
  // A leader marks "Not the same household" only for their own GKK's households (0092).
  const bothMine = a.mine !== false && b.mine !== false;
  // The people in both, to mark them in each list: by name, or by surname and birthday (0095).
  const keys = (m) => [nameKey(m), m.dob && bornKey(m)].filter(Boolean);
  const inB = new Set(b.members.flatMap(keys));
  const shared = new Set(a.members.flatMap(keys).filter((k) => inB.has(k)));
  return (
    <section className="bg-parish-card border border-parish-border rounded-2xl shadow-cardSm overflow-hidden" aria-label={`${a.household_name} and ${b.household_name}`}>
      <div className="px-[18px] py-3.5 border-b border-parish-line flex items-start gap-3 flex-wrap">
        {/* Wide enough to read; on a phone the button goes below. */}
        <div className="flex-1 min-w-[min(100%,300px)]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-[19px] font-semibold text-parish-navy">{a.household_name} · {b.household_name}</span>
            <Badge tone={p.likely ? 'red' : 'gold'}>{p.likely ? 'Very likely the same house' : 'Possibly the same house'}</Badge>
            {a.gkk !== b.gkk && <Badge tone="gray">Different GKKs</Badge>}
          </div>
          <Steps pair={p} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {flags.canSend && !p.flag && (
            <SendButton disabled={busy} onClick={() => flags.open(p.household_ids, `${a.household_name} and ${b.household_name}`)} />
          )}
          {canReview && bothMine && (
            <button
              onClick={onDismiss}
              disabled={busy}
              className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg whitespace-nowrap disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Not the same household'}
            </button>
          )}
        </div>
      </div>
      {p.flag && <FlagStrip flag={p.flag} flags={flags} />}
      <div className="grid gap-px bg-parish-track" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        {p.households.map((h, i) => (
          <HouseholdColumn key={h.id} household={h} first={i === 0} shared={shared} onOpen={() => onOpen(h)} />
        ))}
      </div>
    </section>
  );
}

function HouseholdColumn({ household: h, first, shared, onOpen }) {
  const address = [h.street, h.barangay].filter(Boolean).join(', ');
  return (
    <div className="bg-parish-card px-[18px] py-3.5 flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-[15px] text-parish-navy">{h.household_name}</span>
        <StatusPill status={h.status} />
      </div>
      <div className="text-[12px] text-parish-muted">
        {[h.ref_no, `registered ${fmtDateTime(h.registered_at, { time: false })}${first ? ' (first)' : ''}`, h.gkk].filter(Boolean).join(' · ')}
      </div>
      {(address || h.contact) && <div className="text-[13px] text-parish-text2 break-words">{[address, h.contact].filter(Boolean).join(' · ')}</div>}
      <ul className="list-none m-0 mt-1 p-0 flex flex-col gap-1">
        {h.members.map((m) => {
          const both = shared.has(nameKey(m)) || (m.dob && shared.has(bornKey(m)));
          return (
            <li key={m.id} className="flex items-baseline gap-2 flex-wrap text-[13px]">
              <span className={m.relationship === 'Head of Household' ? 'font-semibold text-parish-navy' : 'text-parish-ink'}>{fullName(m)}</span>
              <span className="text-[12px] text-parish-muted">
                {[bis(RELATIONSHIP_LABELS, m.relationship), m.dob && fmtDate(m.dob)].filter(Boolean).join(' · ')}
              </span>
              {both && <Badge tone="blue">In both</Badge>}
            </li>
          );
        })}
        {!h.members.length && <li className="text-[13px] text-parish-muted">No members</li>}
      </ul>
      {h.can_open === false ? <OtherGkkNote gkk={h.gkk} /> : (
        <div className="flex gap-2 mt-1.5 flex-wrap">
          <button onClick={onOpen} className="appearance-none border-none cursor-pointer px-3 py-1.5 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg">Open household</button>
          <Link to={`/admin/households?status=All&q=${encodeURIComponent(h.ref_no || h.household_name)}`} className="px-3 py-1.5 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg no-underline">Find in Households</Link>
        </div>
      )}
    </div>
  );
}
