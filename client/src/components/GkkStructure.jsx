import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { ErrorState, LoadingState, Modal } from './admin.jsx';
import { Badge, Field, GhostButton, PrimaryButton, TextInput } from './ui.jsx';
import { RowButton } from './panels.jsx';
import MemberPicker from './orgchart/MemberPicker.jsx';
import {
  birthdateText, displayName, formalName, maxText, otherPositions, positionRows, savePayload, snapshot, statusText, structureChanges, structureProblem,
} from '../lib/gkkStructure.js';

const dateText = (v) => (v ? new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '');
let keyCount = 0;
const withKey = (o) => ({ ...o, key: `k${(keyCount += 1)}` });

/**
 * A GKK's structure (0081): the GKK Structure's positions, the same for
 * every GKK, and this GKK's people in each, laid out like the Formation
 * Ministry's paper form, with a printout of it.
 *
 * The GKK leader (`office` false) saves a draft and sends it to the parish
 * office. The parish office (`office`, full access) approves what was sent,
 * sends it back with a note, or changes and publishes it directly.
 */
export default function GkkStructure({ gkk, office = false, canEdit = true }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [officers, setOfficers] = useState([]);
  const [adding, setAdding] = useState(null); // a position id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [returning, setReturning] = useState(false);
  const [parish, setParish] = useState(null);

  function show(d) {
    setData(d);
    setOfficers((d.draft ?? d.live).map(withKey));
    setAdding(null);
    setError('');
  }

  function load() {
    setLoadError('');
    api.gkkStructure(gkk).then(show).catch((e) => setLoadError(e.message || 'Could not load the structure'));
  }
  useEffect(() => {
    setData(null);
    load();
    api.getSettings().then((r) => setParish(r.settings)).catch(() => {});
  }, [gkk]); // eslint-disable-line react-hooks/exhaustive-deps

  const positions = useMemo(() => data?.positions || [], [data]);
  const rows = useMemo(() => positionRows(positions), [positions]);
  const saved = useMemo(() => (data ? snapshot(positions, data.draft ?? data.live) : ''), [data, positions]);
  const dirty = !!data && snapshot(positions, officers) !== saved;
  const state = data?.state || null;
  const status = state?.status || null;
  const others = otherPositions(positions, officers);

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!data) return <LoadingState label="Loading the structure…" />;

  const update = (key, patch) => setOfficers((list) => list.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const remove = (key) => setOfficers((list) => list.filter((o) => o.key !== key));
  function add(nodeId, person) {
    setOfficers((list) => [...list, withKey({ nodeId, note: '', ...person })]);
    setAdding(null);
    setError('');
  }

  async function run(action, message) {
    const problem = structureProblem(positions, officers);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      show(await api.saveGkkStructure(gkk, savePayload(positions, officers), action));
      toast.success(message);
    } catch (e) {
      setError(e.message || 'Could not save the structure');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (status === 'submitted' && !(await confirm({
      title: 'Take it back from the parish office?',
      message: 'It was sent for approval. Saving a draft takes it back until you send it again.',
      confirmLabel: 'Save draft',
    }))) return;
    run('draft', 'Draft saved. Send it to the parish office when it’s ready.');
  }

  async function submit() {
    if (!(await confirm({
      title: 'Send to the parish office?',
      message: `The parish office will be alerted to approve ${gkk}'s structure. It shows on the website once approved.`,
      confirmLabel: 'Send',
    }))) return;
    run('submit', 'Sent. The parish office has been alerted to approve it.');
  }

  async function publish() {
    const approving = status === 'submitted';
    if (!(await confirm({
      title: approving ? `Approve ${gkk}'s structure?` : `Publish ${gkk}'s structure?`,
      message: 'It goes on the website now. Each registered officer gets the position in their service list, and their Katungdanan sa GKK follows their main position.',
      confirmLabel: approving ? 'Approve' : 'Publish',
    }))) return;
    run('publish', approving ? 'Approved. It’s on the website now, and the GKK leader has been told.' : 'Published. It’s on the website now.');
  }

  async function discard() {
    if (!(await confirm({
      title: 'Discard the changes?',
      message: 'The structure goes back to the one that was last approved.',
      tone: 'danger', confirmLabel: 'Discard',
    }))) return;
    setBusy(true);
    try {
      show(await api.discardGkkStructure(gkk));
      toast.success('Changes discarded');
    } catch (e) {
      setError(e.message || 'Could not discard the changes');
    } finally {
      setBusy(false);
    }
  }

  const changes = office && data.draft ? structureChanges(positions, data.live, data.draft) : [];
  const hasDraft = !!data.draft;

  return (
    <div className="flex flex-col gap-4">
      <StatusNote office={office} state={state} gkk={gkk} />

      {office && status === 'submitted' && (
        <div className="border border-parish-line2 rounded-xl px-4 py-3 bg-parish-field">
          <div className="font-semibold text-[13.5px] text-parish-navy mb-1.5">What changes from the approved structure</div>
          {!changes.length ? <div className="text-[13px] text-parish-muted">Nothing: the same people as now.</div> : (
            <ul className="list-none m-0 p-0 flex flex-col gap-1 text-[13px] text-parish-text3">
              {changes.map((c) => (
                <li key={c.id}>
                  <b className="text-parish-navy">{c.title}:</b>
                  {c.added.map((n) => <span key={`a${n}`} className="ml-2 text-parish-okText">+ {n}</span>)}
                  {c.removed.map((n) => <span key={`r${n}`} className="ml-2 text-parish-error line-through">{n}</span>)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!positions.length ? (
        <div className="text-[13.5px] text-parish-muted">The GKK Structure has no positions yet. The parish office sets them up under Organization Structure.</div>
      ) : (
        <ul className="list-none m-0 p-0 border border-parish-line2 rounded-xl divide-y divide-parish-line overflow-hidden">
          {rows.map((p) => {
            const here = officers.filter((o) => o.nodeId === p.id);
            const full = p.max != null && here.length >= p.max;
            return (
              <li key={p.id} className="px-3.5 py-2.5 bg-parish-surface" style={{ paddingLeft: 14 + p.depth * 18 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[14px] text-parish-navy ${p.depth === 0 || p.hasChildren ? 'font-bold' : 'font-semibold'}`}>{p.title}</span>
                  <span className="text-[11.5px] text-parish-muted">{maxText(p.max)}</span>
                  {canEdit && !full && adding !== p.id && (
                    <RowButton className="ml-auto" onClick={() => { setAdding(p.id); setError(''); }}>+ Add</RowButton>
                  )}
                </div>
                {!here.length && adding !== p.id && <div className="text-[12.5px] text-parish-muted italic mt-0.5">Vacant</div>}
                {here.length > 0 && (
                  <ul className="list-none m-0 mt-1.5 p-0 flex flex-col gap-1.5">
                    {here.map((o) => {
                      const also = others(o);
                      return (
                        <li key={o.key} className="flex items-center gap-2.5 flex-wrap border border-parish-line2 rounded-lg bg-parish-field px-3 py-1.5">
                          <div className="flex-1 min-w-[180px]">
                            <div className="font-semibold text-[13.5px] text-parish-ink">{formalName(o)}</div>
                            <div className="text-[12px] text-parish-muted">
                              {o.memberId ? (birthdateText(o.dob) ? `Born ${birthdateText(o.dob)}` : 'Registered member') : 'Not registered yet'}
                              {also.length > 0 && ` · also ${also.join(', ')}`}
                            </div>
                          </div>
                          {canEdit ? (
                            <TextInput
                              aria-label={`Note for ${displayName(o)}`} value={o.note || ''} maxLength={60}
                              onChange={(e) => update(o.key, { note: e.target.value })}
                              placeholder="Note, e.g. Family Group 1" className="!py-1.5 !text-[13px] max-w-[210px]"
                            />
                          ) : o.note && <Badge tone="gray">{o.note}</Badge>}
                          {canEdit && <RowButton tone="gray" onClick={() => remove(o.key)}>Remove</RowButton>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {adding === p.id && <AddPerson gkk={gkk} title={p.title} onAdd={(person) => add(p.id, person)} onCancel={() => setAdding(null)} />}
              </li>
            );
          })}
        </ul>
      )}

      {error && <div role="alert" className="text-parish-error text-[13.5px] font-medium">{error}</div>}

      <div className="flex items-center gap-2 flex-wrap">
        <GhostButton type="button" onClick={() => window.print()} className="px-4 py-2 text-[14px]">Print</GhostButton>
        {dirty && <span className="text-[13px] font-semibold text-parish-warnStrong">Unsaved changes</span>}
        {canEdit && (
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {(dirty || hasDraft) && (
              <GhostButton type="button" disabled={busy} onClick={() => (hasDraft ? discard() : show(data))} className="px-4 py-2 text-[14px]">
                {hasDraft ? 'Discard changes' : 'Undo'}
              </GhostButton>
            )}
            {office ? (
              <>
                {status === 'submitted' && <GhostButton type="button" disabled={busy || dirty} onClick={() => setReturning(true)} className="px-4 py-2 text-[14px]">Send back…</GhostButton>}
                <PrimaryButton type="button" disabled={busy || (!dirty && !hasDraft)} onClick={publish} className="px-5 py-2.5 text-[14px]">
                  {busy ? 'Saving…' : status === 'submitted' ? 'Approve' : 'Publish'}
                </PrimaryButton>
              </>
            ) : (
              <>
                <GhostButton type="button" disabled={busy || !dirty} onClick={saveDraft} className="px-4 py-2 text-[14px]">Save draft</GhostButton>
                <PrimaryButton type="button" disabled={busy || (!dirty && (status === 'submitted' || !hasDraft))} onClick={submit} className="px-5 py-2.5 text-[14px]">
                  {busy ? 'Sending…' : 'Send to parish office'}
                </PrimaryButton>
              </>
            )}
          </div>
        )}
      </div>

      {returning && (
        <SendBack
          gkk={gkk}
          onClose={() => setReturning(false)}
          onSent={(d) => { setReturning(false); show(d); toast.success('Sent back. The GKK leader has been told.'); }}
        />
      )}

      <StructurePrint gkk={gkk} rows={rows} officers={officers} parish={parish} approved={!dirty && !hasDraft && !!state?.approvedAt} />
    </div>
  );
}

function StatusNote({ office, state, gkk }) {
  const status = state?.status;
  const box = (tone, children) => (
    <div className={`rounded-xl px-4 py-3 text-[13.5px] ${tone === 'warn' ? 'bg-parish-warnBg text-parish-warnStrong' : tone === 'ok' ? 'bg-parish-okBg text-parish-okText' : 'bg-parish-sunk text-parish-text2'}`}>
      {children}
    </div>
  );
  if (status === 'returned') {
    return box('warn', <><b>{statusText(state)}</b>{state.reviewedBy && ` (${state.reviewedBy}, ${dateText(state.reviewedAt)})`}: “{state.reviewNote}”{!office && ' Make the changes and send it again.'}</>);
  }
  if (status === 'submitted') {
    return box('warn', office
      ? <><b>Waiting for your approval.</b> Sent {dateText(state.submittedAt)}{state.submittedBy && ` by ${state.submittedBy}`}. Approve it to put it on the website, or send it back with a note.</>
      : <><b>{statusText(state)}.</b> Sent {dateText(state.submittedAt)}. It goes on the website once approved. You can still change it and send it again.</>);
  }
  if (status === 'draft') {
    return box('info', office
      ? <><b>{gkk}'s leader is working on changes</b> (draft saved {dateText(state.savedAt)}{state.savedBy && ` by ${state.savedBy}`}), not sent yet. Shown here; publishing approves them.</>
      : <><b>{statusText(state)}.</b> Saved {dateText(state.savedAt)}. Send it to the parish office when it’s ready.</>);
  }
  if (state?.approvedAt) {
    return box('ok', <><b>Approved</b> {dateText(state.approvedAt)}{state.approvedBy && ` by ${state.approvedBy}`}. This is what the website shows under “Mga Opisyal”.{!office && ' Changes go to the parish office for approval.'}</>);
  }
  return box('info', office
    ? <>Pick a member of {gkk} or type a full name for each position. Publishing puts it on the website.</>
    : <>Fill in your GKK's officers: pick a registered member of {gkk}, or type the full name of someone not registered yet. Then send it to the parish office for approval.</>);
}

/** Add someone to a position: a member of the GKK, or a typed full name. */
function AddPerson({ gkk, title, onAdd, onCancel }) {
  const [name, setName] = useState('');
  const typed = name.replace(/\s+/g, ' ').trim();
  return (
    <div className="mt-2 border border-parish-edge rounded-xl px-3.5 py-3 bg-parish-field flex flex-col gap-2.5">
      <div className="text-[12.5px] text-parish-muted">Add to {title}: search {gkk}'s members, or type the full name.</div>
      <MemberPicker gkk={gkk} onPick={(m) => onAdd({
        memberId: m.id, name: [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' '),
        firstName: m.first_name, middleName: m.middle_name, lastName: m.last_name, suffix: m.suffix, dob: m.dob,
      })} />
      <form
        className="flex gap-2 flex-wrap items-end"
        onSubmit={(e) => { e.preventDefault(); if (typed) onAdd({ memberId: null, name: typed }); }}
      >
        <div className="flex-1 min-w-[220px]">
          <Field label="Or type the full name (not registered)">
            <TextInput value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Surname, Given name, Middle initial" />
          </Field>
        </div>
        <PrimaryButton type="submit" disabled={!typed} className="px-4 py-2.5 text-[13.5px]">Add</PrimaryButton>
        <GhostButton type="button" onClick={onCancel} className="px-4 py-2 text-[13.5px]">Cancel</GhostButton>
      </form>
    </div>
  );
}

function SendBack({ gkk, onClose, onSent }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!note.trim()) { setError('Say what needs changing'); return; }
    setBusy(true);
    try {
      onSent(await api.returnGkkStructure(gkk, note.trim()));
    } catch (err) {
      setError(err.message || 'Could not send it back');
      setBusy(false);
    }
  }
  return (
    <Modal title={`Send back to ${gkk}`} onClose={onClose} maxWidth={520}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="What needs changing" required error={error}>
          <TextInput autoFocus value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Please add the Lay Ministers" />
        </Field>
        <div className="text-[13px] text-parish-muted">The GKK leader is told, and the approved structure stays on the website meanwhile.</div>
        <div className="flex gap-2.5 justify-end">
          <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={busy} className="px-6 py-2.5 text-[14px]">{busy ? 'Sending…' : 'Send back'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

/** The printout, like the Formation Ministry's form: position, complete name, birthdate, signatures. */
function StructurePrint({ gkk, rows, officers, parish, approved }) {
  const cell = { padding: '5px 8px', border: '1px solid #9aa3b5', fontSize: 11.5, verticalAlign: 'top', textAlign: 'left' };
  const head = { ...cell, fontWeight: 700, fontSize: 10.5, textTransform: 'uppercase', background: '#eef1f6' };
  const president = officers.find((o) => rows.find((p) => p.id === o.nodeId)?.gkkRole === 'GKK President')
    || officers.find((o) => o.nodeId === rows[0]?.id);
  const sign = (label, name, role) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11 }}>{label}</div>
      <div style={{ marginTop: 34, borderTop: '1px solid #17263f', paddingTop: 3, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', minHeight: 16 }}>{name}</div>
      <div style={{ fontSize: 11 }}>{role}</div>
    </div>
  );
  return createPortal(
    <div id="print-sheet" aria-hidden>
      <header style={{ textAlign: 'center', marginBottom: 12 }}>
        {parish?.logo && <img src={parish.logo} alt="" style={{ width: 54, height: 54, objectFit: 'contain' }} />}
        <div style={{ fontSize: 15, fontWeight: 700 }}>{parish?.name || 'Our Lady of Guadalupe Quasi-Parish'}</div>
        {parish?.address && <div style={{ fontSize: 11.5 }}>{parish.address}</div>}
        <div style={{ fontSize: 13, fontWeight: 700, marginTop: 10 }}>FORMATION MINISTRY</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>GKK STRUCTURE {new Date().getFullYear()}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 4 }}>GKK: {String(gkk).replace(/^GKK\s+/i, '').toUpperCase()}</div>
        {!approved && <div style={{ fontSize: 11, color: '#9a3412', marginTop: 4 }}>Not yet approved by the parish office</div>}
      </header>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...head, width: '38%' }}>Position</th>
            <th style={head}>Complete name<br /><span style={{ fontWeight: 400, textTransform: 'none' }}>(Surname, Given Name, Middle Name)</span></th>
            <th style={{ ...head, width: '22%' }}>Birthdate</th>
          </tr>
        </thead>
        <tbody>
          {rows.flatMap((p) => {
            const here = officers.filter((o) => o.nodeId === p.id);
            const people = here.length ? here : [null];
            return people.map((o, i) => (
              <tr key={`${p.id}-${o?.key || 'none'}`} style={{ breakInside: 'avoid' }}>
                <td style={{ ...cell, paddingLeft: 8 + p.depth * 12, fontWeight: p.depth === 0 || p.hasChildren ? 700 : 400, borderTop: i ? 'none' : cell.border }}>{i === 0 ? p.title : ''}</td>
                <td style={cell}>{o ? `${formalName(o)}${o.note ? ` (${o.note})` : ''}` : ''}</td>
                <td style={cell}>{o ? birthdateText(o.dob) : ''}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 40, marginTop: 28, breakInside: 'avoid' }}>
        {sign('Submitted and recommended by:', president ? displayName(president) : '', 'GKK President')}
        {sign('Approved:', '', 'Parish Priest / Administrator')}
      </div>
    </div>,
    document.body
  );
}
