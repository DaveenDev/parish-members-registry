import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api.js';
import { PrimaryButton, GhostButton, StatusPill, Badge } from './ui.jsx';
import { VerifiedLine } from './VerifiedLine.jsx';
import MemberDetailModal from './MemberDetailModal.jsx';
import { sacramentLines } from './PrintSheet.jsx';
import { FamilyHeading } from './FamilyGroups.jsx';
import { LoadingState } from './admin.jsx';
import ActivityList from './ActivityList.jsx';
import { familiesOf } from '../lib/household.js';
import { STATUS_TONES } from '../lib/census.js';
import { HELP_WAYS, PARTICIPATION_ITEMS, fmtDate, fmtDateTime, ageFromDob } from '../constants.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, VOLUNTEER_LABELS } from '../lib/bisaya.js';
import { useAuth } from '../AuthContext.jsx';
import { can } from '../lib/access.js';

const fullName = (m) => [m.first_name, m.middle_name, m.last_name, m.suffix].filter(Boolean).join(' ');

/** "Mass (Misa): Aktibo · Pintakasi: Wala", from a participation answer set. */
function participationText(p) {
  return PARTICIPATION_ITEMS.filter(([key]) => p?.[key]).map(([key, label]) => `${label}: ${p[key]}`).join(' · ');
}

/**
 * Review a household from a panel on the right, like the Edit panel: its
 * details and every member's, read-only and compact. "Verify" and "Edit"
 * at the bottom act on it; a member's name opens their record.
 */
export default function HouseholdViewDrawer({ household: row, onClose, onEdit, onToggleStatus, onChanged }) {
  const { user } = useAuth();
  const titleId = useId();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openMemberId, setOpenMemberId] = useState(null);
  const canEdit = can(user, 'editRegistry');
  const showBlood = can(user, 'bloodTypes'); // GKK leaders don't see blood types (0050)

  function load() {
    setError('');
    api.getHousehold(row.id).then(setData).catch((e) => setError(e.message || 'Could not load this household'));
  }
  useEffect(() => { load(); }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes the panel, unless the member window or a prompt is open on top of it.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || openMemberId || document.querySelector('[role="alertdialog"]')) return;
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMemberId]);

  // The list row until the full record arrives, so the header shows at once.
  const h = data?.household || row;
  const members = data?.members;
  const families = members ? familiesOf(members) : [];
  const address = [h.street, h.barangay, h.city, h.province, h.zip].filter(Boolean).join(', ');
  const helpWays = HELP_WAYS.filter(([key]) => (h.help_ways || []).includes(key)).map(([, label]) => label);

  async function toggleStatus() {
    setBusy(true);
    try {
      await onToggleStatus(h);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[45] flex justify-end">
      <div className="absolute inset-0 bg-parish-scrim/35 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative h-full w-full sm:w-[min(100%,560px)] lg:w-[40vw] lg:min-w-[520px] bg-parish-surface shadow-2xl flex flex-col animate-slideInRight"
      >
        <header className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 pb-4 border-b border-parish-line2">
          <div className="min-w-0">
            <h3 id={titleId} className="font-serif text-[24px] font-semibold m-0 text-parish-navy truncate">{h.household_name}</h3>
            <p className="text-[13px] text-parish-muted m-0 flex items-center gap-2 flex-wrap">
              <StatusPill status={h.status} />
              {h.ref_no && <span>{h.ref_no}</span>}
            </p>
            <p className="text-[12px] text-parish-muted m-0 mt-1">
              {[h.created_at && `Registered ${fmtDateTime(h.created_at, { time: false })}`,
                h.updated_at && `Last updated ${fmtDateTime(h.updated_at)}`].filter(Boolean).join(' · ')}
            </p>
            <VerifiedLine household={h} className="text-[12px] text-parish-okText mt-0.5" />
          </div>
          <button onClick={onClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none px-1">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5">
          <SectionLabel>Household details</SectionLabel>
          <dl className="m-0 grid gap-x-4 gap-y-2 text-[13.5px]" style={{ gridTemplateColumns: 'minmax(110px,max-content) 1fr' }}>
            <Row label="Address">{address}</Row>
            <Row label="Parish GKK">{h.gkk}</Row>
            <Row label="Family grouping">{h.family_grouping}</Row>
            <Row label="Contact no.">{h.contact}</Row>
            <Row label="Email">{h.email}</Row>
            {data && <Row label="Volunteer">{bis(VOLUNTEER_LABELS, h.volunteer)}</Row>}
            {data && <Row label="How they can help">{helpWays.length ? <ul className="m-0 pl-4">{helpWays.map((w) => <li key={w}>{w}</li>)}</ul> : ''}</Row>}
          </dl>

          <div className="mt-7">
            <SectionLabel>Members{members ? ` (${members.length})` : ''}{families.length > 1 ? ` · ${families.length} families` : ''}</SectionLabel>
            {error && <div className="mb-3 text-parish-error text-[13.5px]" role="alert">{error} <button onClick={load} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-parish-blue p-0">Try again</button></div>}
            {!members && !error && <LoadingState label="Loading members…" compact />}
            {members && !members.length && <div className="text-[13px] text-parish-muted">No members yet.</div>}
            {members && (
              <div className="flex flex-col gap-4">
                {families.map((g) => (
                  <section key={g.familyNo}>
                    {families.length > 1 && <FamilyHeading group={g} />}
                    <div className="flex flex-col gap-2.5">
                      {g.members.map((m) => <MemberCard key={m.id} member={m} showBlood={showBlood} onOpen={() => setOpenMemberId(m.id)} />)}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          {can(user, 'activity') && (
            <details className="group mt-7">
              <summary className="cursor-pointer list-none flex items-center gap-2.5 mb-3">
                <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">History</span>
                <span className="text-[12px] text-parish-muted group-open:hidden">Changes to this household and its members</span>
                <span className="flex-1 h-px bg-parish-track" />
              </summary>
              <ActivityList householdId={h.id} />
            </details>
          )}
        </div>

        <footer className="flex items-center gap-2.5 justify-end px-5 sm:px-7 py-3.5 border-t border-parish-line2 bg-parish-card">
          <GhostButton onClick={onClose} className="mr-auto px-5 py-2.5 text-[14px]">Close</GhostButton>
          {canEdit && (
            <>
              <GhostButton onClick={() => onEdit(h)} className="px-5 py-2.5 text-[14px]">Edit</GhostButton>
              {h.status === 'Verified'
                ? <GhostButton onClick={toggleStatus} disabled={busy} className="px-5 py-2.5 text-[14px] disabled:opacity-60">{busy ? 'Saving…' : 'Mark Pending'}</GhostButton>
                : <PrimaryButton onClick={toggleStatus} disabled={busy} className="px-6 py-2.5 text-[14px]">{busy ? 'Verifying…' : 'Verify'}</PrimaryButton>}
            </>
          )}
        </footer>
      </aside>

      {openMemberId && (
        <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={() => { load(); onChanged && onChanged(); }} />
      )}
    </div>
  );
}

/** One member, compact: who they are, their status, sacraments, groups and participation. */
function MemberCard({ member: m, showBlood, onOpen }) {
  const age = ageFromDob(m.dob);
  const facts = [
    bis(RELATIONSHIP_LABELS, m.relationship), bis(SEX_LABELS, m.sex), bis(CIVIL_STATUS_LABELS, m.civil_status),
    m.dob && `b. ${fmtDate(m.dob)}${age !== null ? ` (${age} yrs)` : ''}`,
  ].filter(Boolean).join(' · ');
  const more = [
    m.religion && m.religion !== 'Roman Catholic' && m.religion,
    m.tribe && `Tribe: ${m.tribe}`,
    m.occupation,
    showBlood && m.blood_type && `Blood: ${m.blood_type}`,
    m.contact, m.email,
  ].filter(Boolean).join(' · ');
  const roles = [m.parish_role && `Parish: ${m.parish_role}`, m.gkk_role && `GKK: ${m.gkk_role}`].filter(Boolean);
  const serving = [...(m.ministries || []), ...(m.organizations || [])];
  const participation = participationText(m.registration_participation);
  return (
    <div className="px-3.5 py-3 bg-parish-field border border-parish-line2 rounded-xl">
      <div className="flex items-start gap-2 flex-wrap">
        <button onClick={onOpen} className="appearance-none border-none bg-transparent p-0 cursor-pointer text-left text-[14.5px] font-semibold text-parish-navy hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue">
          {fullName(m)}
        </button>
        {m.membership_status
          ? <Badge tone={STATUS_TONES[m.membership_status] || 'gray'}>{m.membership_status}</Badge>
          : <span className="text-[11.5px] font-semibold text-[#c2410c] whitespace-nowrap">No status</span>}
      </div>
      {facts && <div className="text-[12.5px] text-parish-text2 mt-0.5">{facts}</div>}
      {more && <div className="text-[12.5px] text-parish-muted mt-0.5">{more}</div>}
      <dl className="m-0 mt-2 grid gap-x-3 gap-y-1 text-[12.5px]" style={{ gridTemplateColumns: 'minmax(96px,max-content) 1fr' }}>
        {sacramentLines(m).map(([label, detail]) => (
          <React.Fragment key={label}>
            <dt className="font-semibold text-parish-blue">{label}</dt>
            <dd className="m-0 text-parish-text3">{detail}</dd>
          </React.Fragment>
        ))}
        {roles.length > 0 && <><dt className="font-semibold text-[var(--p-gold-deep)]">Roles</dt><dd className="m-0 text-parish-text3">{roles.join(' · ')}</dd></>}
        {serving.length > 0 && <><dt className="font-semibold text-[var(--p-gold-deep)]">Serving in</dt><dd className="m-0 text-parish-text3">{serving.join(', ')}</dd></>}
        {participation && <><dt className="font-semibold text-[var(--p-gold-deep)]">Participation</dt><dd className="m-0 text-parish-text3">{participation}</dd></>}
      </dl>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <>
      <dt className="font-semibold text-parish-muted">{label}</dt>
      <dd className="m-0 text-parish-text3 min-w-0 break-words">{children || '—'}</dd>
    </>
  );
}

function SectionLabel({ children, className = 'mb-3' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{children}</span>
      <span className="flex-1 h-px bg-parish-track" />
    </div>
  );
}
