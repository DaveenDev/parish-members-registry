import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { fmtDate } from '../../constants.js';
import { memberFullName } from '../../lib/util.js';
import { useDebounced } from '../../hooks.js';
import { TextInput, Badge } from '../ui.jsx';
import { RowButton } from '../panels.jsx';
import SacramentVerifyDialog, { SacramentChip } from '../SacramentVerifyDialog.jsx';
import { certSacrament, subjectName } from '../../lib/requests.js';

/**
 * Find the person on a certificate request in the member registry, link
 * them, and check (or record) the sacrament's verification against the
 * parish register before the certificate is issued.
 */
export default function MemberMatch({ request, onLink, busy }) {
  const sacrament = certSacrament(request.cert_type);
  const member = request.member;

  if (member) return <LinkedMember member={member} sacrament={sacrament} onUnlink={() => onLink(null)} busy={busy} />;
  return <MemberSearch initial={subjectName(request)} sacrament={sacrament} onPick={(m) => onLink(m.id)} busy={busy} />;
}

function LinkedMember({ member, sacrament, onUnlink, busy }) {
  const [verification, setVerification] = useState(undefined);
  const [verifying, setVerifying] = useState(false);
  const claimed = !!member[sacrament.has];

  function load() {
    api.getSacramentVerifications(member.id)
      .then((v) => setVerification(v[sacrament.key] || null))
      .catch(() => setVerification(null));
  }
  useEffect(load, [member.id, sacrament.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="border-[1.5px] border-parish-focusLine rounded-xl bg-parish-fillSoft px-4 py-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-semibold text-[15px] text-parish-navy">{memberFullName(member)}</div>
          <div className="text-[12.5px] text-parish-muted">{member.dob ? `Born ${fmtDate(member.dob)}` : 'No birth date on record'}</div>
        </div>
        <RowButton tone="gray" onClick={onUnlink} disabled={busy}>Unlink</RowButton>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[13.5px]">
        <span className="text-parish-text2">{sacrament.label} in the registry:</span>
        {verification === undefined ? <span className="text-parish-muted">checking…</span> : (
          <SacramentChip claimed={claimed} verified={!!verification} label={sacrament.label} onClick={claimed ? () => setVerifying(true) : undefined} />
        )}
      </div>
      {claimed ? (
        <div className="text-[13px] text-parish-text2">
          {[member[sacrament.date] && fmtDate(member[sacrament.date]), member[sacrament.church]].filter(Boolean).join(' · ') || 'No date or church recorded.'}
          {verification && <div className="text-parish-ok font-semibold mt-0.5">Verified: {[verification.source, verification.reference].filter(Boolean).join(' · ')}</div>}
          {verification === null && <div className="text-parish-warn font-semibold mt-0.5">Not verified yet. Check the parish register, then click “Claimed” to record it.</div>}
        </div>
      ) : (
        <div className="text-[13px] text-parish-warn font-semibold">
          This member has no {sacrament.label.toLowerCase()} on record. Check the parish register; if it's there, add it to their member record first.
        </div>
      )}
      {verifying && (
        <SacramentVerifyDialog
          member={member}
          sacrament={sacrament}
          verification={verification}
          onClose={() => setVerifying(false)}
          onChanged={() => { setVerifying(false); load(); }}
        />
      )}
    </div>
  );
}

function MemberSearch({ initial, sacrament, onPick, busy }) {
  const [query, setQuery] = useState(initial);
  const debounced = useDebounced(query.trim(), 350);
  const [state, setState] = useState({ rows: [], loading: false, error: '' });

  useEffect(() => {
    if (debounced.length < 2) { setState({ rows: [], loading: false, error: '' }); return; }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: '' }));
    // Include moved-away and deceased members: their certificates are requested too.
    api.listMembers({ search: debounced, membership: 'All', pageSize: 6 })
      .then((r) => { if (!cancelled) setState({ rows: r.rows, loading: false, error: '' }); })
      .catch((e) => { if (!cancelled) setState({ rows: [], loading: false, error: e.message || 'Search failed' }); });
    return () => { cancelled = true; };
  }, [debounced]);

  return (
    <div className="flex flex-col gap-2">
      <TextInput aria-label="Search the member registry" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members by name" className="!py-2.5 !text-[15px]" />
      {state.loading && <div className="text-[13px] text-parish-muted">Searching…</div>}
      {state.error && <div className="text-[13px] text-parish-error">{state.error}</div>}
      {!state.loading && debounced.length >= 2 && !state.rows.length && !state.error && (
        <div className="text-[13px] text-parish-muted">No registered member matches. The person may not be in the registry; check the parish register directly.</div>
      )}
      {state.rows.map((m) => (
        <div key={m.id} className="flex items-center gap-3 border border-parish-line2 rounded-xl bg-parish-field px-3.5 py-2.5 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="font-semibold text-[14px] text-parish-navy">{memberFullName(m)}</div>
            <div className="text-[12.5px] text-parish-muted">
              {[m.household_name, m.dob && `born ${fmtDate(m.dob)}`, m.household_gkk].filter(Boolean).join(' · ')}
            </div>
          </div>
          <SacramentChip claimed={!!m[sacrament.has]} verified={!!m[`${sacrament.key}_verified`]} label={sacrament.label} />
          {m.membership_status && m.membership_status !== 'Active' && <Badge tone="gray">{m.membership_status}</Badge>}
          <RowButton onClick={() => onPick(m)} disabled={busy}>Link</RowButton>
        </div>
      ))}
    </div>
  );
}
