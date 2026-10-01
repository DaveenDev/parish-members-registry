import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput, Select, PrimaryButton, GhostButton, Badge } from './ui.jsx';
import ParticipationSurvey from './ParticipationSurvey.jsx';
import MemberDetailModal from './MemberDetailModal.jsx';
import { AddMemberForm } from './HouseholdEditDrawer.jsx';
import { HEAD, HELP_WAYS, PARTICIPATION_ITEMS, PARTICIPATION_LEVELS, ageFromDob } from '../constants.js';
import { bis, RELATIONSHIP_LABELS } from '../lib/bisaya.js';
import { MEMBERSHIP_STATUSES, FORMER_STATUSES, CENSUS_SOURCES, STATUS_TONES, cleanParticipation, suggestStatus, formatAccessCode } from '../lib/census.js';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

const SHORT_LEVEL = { Aktibo: 'A', Panagsa: 'P', Wala: 'W' };

/** Editable census answer for one member, from their saved answer (if any). */
function rowFrom(m) {
  return {
    status: m.census?.status || '',
    participation: m.census?.participation || {},
    notes: m.census?.notes || '',
    // Until staff pick a status themselves, it follows the suggestion.
    statusPicked: !!m.census,
  };
}

function sameAnswer(row, saved) {
  if (!saved) return !row.status;
  return row.status === saved.status
    && (row.notes || '').trim() === (saved.notes || '')
    && JSON.stringify(cleanParticipation(row.participation)) === JSON.stringify(cleanParticipation(saved.participation));
}

/**
 * Record a household's census from its paper form (or a home visit): each
 * member's participation answers and membership status. Member details are
 * corrected with the usual member window; new members are added here too.
 */
export default function CensusHouseholdDrawer({ cycle, householdId, pendingUpdate = false, onClose, onSaved }) {
  const toast = useToast();
  const confirm = useConfirm();
  const titleId = useId();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [rows, setRows] = useState({});
  const [source, setSource] = useState('Paper');
  const [survey, setSurvey] = useState(null); // { participation, help_ways } once staff open it
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [openMemberId, setOpenMemberId] = useState(null);
  const [adding, setAdding] = useState(false);
  const editable = cycle.status === 'Open';
  const [accessCode, setAccessCode] = useState(null);

  // The family's code for the online census form (0008); hidden without it.
  useEffect(() => {
    api.censusAccessCodes([householdId]).then((codes) => setAccessCode(codes[householdId] || null)).catch(() => setAccessCode(null));
  }, [householdId]);

  async function newCode() {
    const ok = await confirm({
      title: 'Give this family a new online code?',
      message: 'The code on the form they already have stops working at once. Print a new form or tell them the new code.',
      confirmLabel: 'New code',
    });
    if (!ok) return;
    try {
      setAccessCode(await api.resetAccessCode(householdId));
      toast.success('New online code issued');
    } catch (e) {
      toast.error(e.message || 'Could not issue a new code');
    }
  }

  function load({ keepEdits = false } = {}) {
    setLoadError('');
    api.getHouseholdCensus(cycle.id, householdId)
      .then((res) => {
        setData(res);
        setRows((prev) => Object.fromEntries(res.members.map((m) => [m.id, keepEdits && prev[m.id] ? prev[m.id] : rowFrom(m)])));
      })
      .catch((e) => setLoadError(e.message || 'Could not load this household'));
  }
  useEffect(() => { load(); }, [cycle.id, householdId]);

  const changed = data ? data.members.filter((m) => rows[m.id] && !sameAnswer(rows[m.id], m.census)) : [];
  const surveyDirty = !!survey && data && (
    JSON.stringify(cleanParticipation(survey.participation)) !== JSON.stringify(cleanParticipation(data.household.participation))
    || JSON.stringify(survey.help_ways) !== JSON.stringify(data.household.help_ways || [])
  );
  const dirty = changed.length > 0 || surveyDirty;

  function setRow(id, patch) {
    setRows((r) => {
      const next = { ...r[id], ...patch };
      if ('participation' in patch && !next.statusPicked) next.status = suggestStatus(next.participation) || '';
      return { ...r, [id]: next };
    });
  }

  async function requestClose() {
    if (dirty) {
      const ok = await confirm({
        title: 'Discard census answers?',
        message: 'The census answers you entered for this household have not been saved.',
        confirmLabel: 'Discard',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onClose();
  }
  const closeRef = useRef(requestClose);
  closeRef.current = requestClose;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || openMemberId || document.querySelector('[role="alertdialog"]')) return;
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openMemberId]);

  async function save() {
    setError('');
    // A member whose saved answer was cleared in the form needs "Clear answer", not Save.
    const toSave = changed.filter((m) => rows[m.id].status);
    if (!toSave.length && !surveyDirty) {
      setError(changed.length ? 'Choose a status for the members you changed, or use “Clear answer”.' : 'Nothing to save yet.');
      return;
    }
    setSaving(true);
    try {
      if (toSave.length) {
        await api.recordHouseholdCensus(cycle.id, householdId, {
          rows: toSave.map((m) => ({ memberId: m.id, ...rows[m.id] })),
          source,
          participation: surveyDirty ? survey.participation : null,
          helpWays: surveyDirty ? survey.help_ways : null,
        });
      } else {
        await api.updateHousehold(householdId, { participation: survey.participation, help_ways: survey.help_ways });
      }
      toast.success(toSave.length ? `Census saved for ${toSave.length} member(s)` : 'Household survey updated');
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Could not save the census');
    } finally {
      setSaving(false);
    }
  }

  async function clearAnswer(m) {
    const name = [m.first_name, m.last_name].join(' ');
    const ok = await confirm({
      title: `Clear ${name}'s census answer?`,
      message: `${name} will show as not confirmed in the ${cycle.label}, and their membership status goes back to their previous census answer.`,
      confirmLabel: 'Clear answer',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.clearMemberCensus(cycle.id, m.id);
      toast.success('Answer cleared');
      onSaved && onSaved();
      setRows((r) => ({ ...r, [m.id]: rowFrom({ census: null }) }));
      load({ keepEdits: true });
    } catch (e) {
      toast.error(e.message || 'Could not clear this answer');
    }
  }

  function openSurvey() {
    if (!survey) setSurvey({ participation: data.household.participation || {}, help_ways: data.household.help_ways || [] });
    setSurveyOpen((o) => !o);
  }
  const toggleHelpWay = (key) => setSurvey((s) => {
    const on = new Set(s.help_ways);
    on.has(key) ? on.delete(key) : on.add(key);
    return { ...s, help_ways: HELP_WAYS.map(([k]) => k).filter((k) => on.has(k)) };
  });

  const members = data?.members || [];
  // Members who moved away or died in an earlier census go last.
  const isFormer = (m) => FORMER_STATUSES.includes(m.membership_status) && !m.census;
  const ordered = [...members.filter((m) => !isFormer(m)), ...members.filter(isFormer)];
  const head = members.find((m) => m.relationship === HEAD);

  return (
    <div className="fixed inset-0 z-[45] flex justify-end">
      <div className="absolute inset-0 bg-parish-navy/35 backdrop-blur-[2px] animate-fadeIn" onClick={requestClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative h-full w-full sm:w-[min(100%,640px)] lg:w-[48vw] lg:min-w-[600px] bg-white shadow-2xl flex flex-col animate-slideInRight"
      >
        <header className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 pb-4 border-b border-[#f0e8d6]">
          <div className="min-w-0">
            <h3 id={titleId} className="font-serif text-[24px] font-semibold m-0 text-parish-navy truncate">
              {data ? data.household.household_name : 'Census'}
            </h3>
            <p className="text-[13px] text-parish-muted m-0">
              {cycle.label}{data?.household.ref_no ? ` · ${data.household.ref_no}` : ''}{data?.household.gkk ? ` · ${data.household.gkk}` : ''}
            </p>
          </div>
          <button onClick={requestClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none px-1">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5">
          {loadError && <div className="text-parish-error text-[13.5px]" role="alert">{loadError}</div>}
          {!data && !loadError && <div className="text-[13.5px] text-parish-muted py-3">Loading household…</div>}

          {data && (
            <>
              {pendingUpdate && (
                <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-[var(--p-blue-tint)] text-parish-navy text-[13.5px]">
                  This family sent an update online. Review it under <strong>Online updates</strong> before entering paper answers,
                  so one doesn't overwrite the other.
                </div>
              )}
              {accessCode && (
                <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-parish-text2">
                  <span>Online code:</span>
                  <code className="font-bold tracking-[.08em] text-parish-navy">{formatAccessCode(accessCode)}</code>
                  {editable && <button onClick={newCode} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[12.5px] text-parish-blue">New code</button>}
                </div>
              )}
              {!editable && (
                <div className="mb-4 px-3.5 py-2.5 rounded-xl bg-[#fdf1de] text-[#7a5a1f] text-[13.5px]">
                  The {cycle.label} is closed. Reopen it on the Census page to change answers.
                </div>
              )}
              {editable && (
                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <Field label="Answers came from">
                    <Select value={source} onChange={(e) => setSource(e.target.value)}>
                      {CENSUS_SOURCES.map((s) => <option key={s} value={s}>{s === 'Paper' ? 'Paper census form' : 'Staff / GKK home visit'}</option>)}
                    </Select>
                  </Field>
                  <p className="text-[12.5px] text-parish-muted m-0 flex-1 min-w-[200px]">
                    Circle answers on the form: <strong>A</strong> = Aktibo, <strong>P</strong> = Panagsa, <strong>W</strong> = Wala.
                    The status follows the suggestion until you choose one yourself.
                  </p>
                </div>
              )}

              {error && <div className="mb-4 text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}

              <div className="flex flex-col gap-3">
                {ordered.map((m) => (
                  <MemberCensusRow
                    key={m.id}
                    member={m}
                    row={rows[m.id] || rowFrom(m)}
                    former={isFormer(m)}
                    editable={editable}
                    onChange={(patch) => setRow(m.id, patch)}
                    onEdit={() => setOpenMemberId(m.id)}
                    onClear={() => clearAnswer(m)}
                  />
                ))}
              </div>

              {editable && !adding && (
                <button
                  onClick={() => setAdding(true)}
                  className="mt-3 w-full appearance-none cursor-pointer py-3 font-bold text-[14px] text-parish-blue bg-white border-[1.5px] border-dashed border-[#b9c6de] rounded-xl hover:bg-[#f4f7fc] hover:border-parish-blue transition"
                >
                  + Add a new member (newborn, new spouse, …)
                </button>
              )}
              {editable && adding && (
                <AddMemberForm
                  householdId={householdId}
                  defaultLastName={head?.last_name || ''}
                  hasHead={!!head}
                  onCancel={() => setAdding(false)}
                  onAdded={(added) => {
                    setAdding(false);
                    toast.success(`${[added.first_name, added.last_name].join(' ')} added`);
                    onSaved && onSaved();
                    load({ keepEdits: true });
                  }}
                />
              )}

              {editable && (
                <div className="mt-6 pt-4 border-t border-[#f0e8d6]">
                  <button onClick={openSurvey} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[14px] text-parish-blue">
                    {surveyOpen ? '▾' : '▸'} Also update the household participation survey
                  </button>
                  {surveyOpen && survey && (
                    <div className="mt-4">
                      <ParticipationSurvey
                        participation={survey.participation}
                        helpWays={survey.help_ways}
                        onParticipation={(key, level) => setSurvey((s) => ({ ...s, participation: { ...s.participation, [key]: level } }))}
                        onToggleHelpWay={toggleHelpWay}
                        compact
                        english
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center gap-2.5 justify-end px-5 sm:px-7 py-3.5 border-t border-[#f0e8d6] bg-[#fffdf8]">
          {dirty && <span className="mr-auto text-[12.5px] font-semibold text-[#a1762b]">Unsaved answers</span>}
          <GhostButton onClick={requestClose} className="px-5 py-2.5 text-[14px]">Close</GhostButton>
          {editable && (
            <PrimaryButton onClick={save} disabled={saving || !dirty} className="px-6 py-2.5 text-[14px]">
              {saving ? 'Saving…' : 'Save census'}
            </PrimaryButton>
          )}
        </footer>
      </aside>

      {openMemberId && (
        <MemberDetailModal
          memberId={openMemberId}
          onClose={() => setOpenMemberId(null)}
          onChanged={() => { onSaved && onSaved(); load({ keepEdits: true }); }}
        />
      )}
    </div>
  );
}

function MemberCensusRow({ member: m, row, former, editable, onChange, onEdit, onClear }) {
  const suggestion = suggestStatus(row.participation);
  const name = [m.first_name, m.middle_name, m.last_name, m.suffix].filter(Boolean).join(' ');
  const age = ageFromDob(m.dob);

  return (
    <div className={`border rounded-xl px-4 py-3.5 ${former ? 'bg-[#f7f5ef] border-[#ebe5d6] opacity-80' : 'bg-[#fdfbf6] border-[#f0e8d6]'}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-parish-navy">{name}</div>
          <div className="text-[12.5px] text-parish-muted">
            {[bis(RELATIONSHIP_LABELS, m.relationship), age !== null && `${age} yrs`].filter(Boolean).join(' · ') || '—'}
            {m.previous && <> · last census: <strong>{m.previous.status}</strong> ({m.previous.census_cycles?.label})</>}
            {!m.previous && m.membership_status && <> · status: <strong>{m.membership_status}</strong></>}
            {former && ' · no longer in the household'}
          </div>
          {m.census && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <Badge tone="green">Confirmed</Badge>
              <span className="text-[12px] text-parish-muted">
                {m.census.source} · {m.census.confirmed_by_name || 'staff'}, {new Date(m.census.confirmed_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1.5">
          <button onClick={onEdit} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg">Edit details</button>
          {editable && m.census && (
            <button onClick={onClear} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-error bg-parish-errorBg rounded-lg">Clear answer</button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
        {PARTICIPATION_ITEMS.map(([key, label]) => (
          <div key={key} role="radiogroup" aria-label={`${name}: ${label}`} className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] text-parish-text2 truncate" title={label}>{label}</span>
            <div className="flex gap-1 flex-none">
              {PARTICIPATION_LEVELS.map((level) => {
                const on = row.participation?.[key] === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={level}
                    title={level}
                    disabled={!editable}
                    onClick={() => onChange({ participation: { ...row.participation, [key]: on ? undefined : level } })}
                    className={`appearance-none cursor-pointer w-7 h-7 rounded-md border-[1.5px] text-[12px] font-bold disabled:cursor-default ${
                      on ? 'bg-parish-blue border-parish-blue text-white' : 'bg-white border-parish-borderSoft text-parish-text2'
                    }`}
                  >
                    {SHORT_LEVEL[level]}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: 'minmax(180px,1fr) minmax(180px,1.4fr)' }}>
        <Field label="Membership status">
          <Select
            value={row.status}
            disabled={!editable}
            onChange={(e) => onChange({ status: e.target.value, statusPicked: true })}
          >
            <option value="">— Not confirmed yet —</option>
            {MEMBERSHIP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <div className="text-[12px] mt-1 text-parish-muted">
            {suggestion
              ? <>Suggested from the answers: <Badge tone={STATUS_TONES[suggestion]}>{suggestion}</Badge></>
              : 'No suggestion — choose from what the family wrote.'}
          </div>
        </Field>
        <Field label="Notes">
          <TextInput value={row.notes} disabled={!editable} placeholder="e.g. working abroad, moved to Davao" onChange={(e) => onChange({ notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}
