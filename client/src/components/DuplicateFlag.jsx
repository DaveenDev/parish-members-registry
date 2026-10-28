import React, { useState } from 'react';
import { api } from '../api.js';
import { Modal } from './admin.jsx';
import { Field, PrimaryButton, GhostButton } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';
import { fmtDateTime } from '../constants.js';
import { useAuth } from '../AuthContext.jsx';
import { can, leaderGkk } from '../lib/access.js';

const textareaClass = 'w-full px-3.5 py-3 text-[15px] text-parish-ink bg-parish-field border-[1.5px] border-parish-borderSoft rounded-xl outline-none transition focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15 leading-relaxed';

/**
 * Sending possible duplicates to the parish office (0093), for the Members
 * and Households tabs. A GKK leader sees duplicates with another GKK's
 * records, but can't merge them or mark them for both GKKs, so they send
 * them; full-access staff are alerted, fix the records, and the GKK that sent
 * them hears back. `kind` is 'members' or 'households'.
 */
export function useDuplicateFlags(kind, reload) {
  const toast = useToast();
  const { user } = useAuth();
  const [sending, setSending] = useState(null); // { ids, subject } while the dialog is open
  const [busyId, setBusyId] = useState(null);
  const myGkk = leaderGkk(user);

  async function run(id, action, done) {
    setBusyId(id);
    try {
      await action();
      toast.success(done);
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusyId(null);
    }
  }

  return {
    // GKK leaders send; full access closes one fixed some other way.
    canSend: !!myGkk,
    canClose: can(user, 'deleteRecords'),
    myGkk,
    busyId,
    open: (ids, subject) => setSending({ ids, subject }),
    takeBack: (flag) => run(flag.id, () => api.unflagDuplicate(flag.id), 'Taken back'),
    close: (flag) => run(flag.id, () => api.closeDuplicateFlag(flag.id), `Done. ${flag.flagged_gkk || 'The GKK'} is told.`),
    dialog: sending && (
      <SendDialog
        subject={sending.subject}
        onClose={() => setSending(null)}
        onSend={async (note) => {
          await api.flagDuplicate(kind, sending.ids, note);
          setSending(null);
          toast.success('Sent to the parish office');
          reload();
        }}
      />
    ),
  };
}

function SendDialog({ subject, onClose, onSend }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    setBusy(true);
    setError('');
    try {
      await onSend(note.trim());
    } catch (e) {
      setError(e.message || 'Could not send this');
      setBusy(false);
    }
  }

  return (
    <Modal title="Send to the parish office" onClose={onClose} maxWidth={520}>
      <p className="text-[13.5px] text-parish-text2 leading-relaxed mt-0 mb-4">
        <strong>{subject}</strong> will be marked for the parish office to fix: merge the records, delete the extra one, or mark them
        different. The office is alerted, and you're told when it's done.
      </p>
      {error && <div role="alert" className="mb-3 text-[13.5px] text-parish-error font-medium">{error}</div>}
      <Field label="Note for the office (optional)">
        <textarea
          autoFocus
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Same person. The family moved from Meohao to San Isidro; keep the San Isidro record."
          className={textareaClass}
        />
      </Field>
      <div className="flex justify-end gap-2.5 mt-5">
        <GhostButton onClick={onClose} className="px-4 py-2.5 text-[13.5px]">Cancel</GhostButton>
        <PrimaryButton onClick={send} disabled={busy} className="px-5 py-2.5 text-[13.5px]">{busy ? 'Sending…' : 'Send'}</PrimaryButton>
      </div>
    </Modal>
  );
}

/** "Send to the parish office": the card's button for GKK leaders. */
export function SendButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-[var(--p-gold-deep)] bg-[var(--p-gold-tint)] rounded-lg whitespace-nowrap disabled:opacity-60"
    >
      Send to the parish office…
    </button>
  );
}

/**
 * The strip under a card's heading once it's been sent: who sent it, their
 * note, and Take back (the GKK that sent it) or Done (full access).
 */
export function FlagStrip({ flag, flags }) {
  const busy = flags.busyId === flag.id;
  const ours = flags.myGkk && flag.flagged_gkk === flags.myGkk;
  const who = ours
    ? `Sent to the parish office${flag.mine ? '' : ` by ${flag.flagged_by_name}`}`
    : `Sent by ${flag.flagged_by_name || 'a GKK leader'}${flag.flagged_gkk ? ` (${flag.flagged_gkk})` : ''}`;
  return (
    <div className="px-[18px] py-2.5 border-b border-parish-line bg-[var(--p-gold-tint)] flex items-center gap-3 flex-wrap text-[13px]">
      <div className="min-w-0 flex-1 text-[var(--p-gold-deep)]">
        <span className="font-semibold">{who}</span> · {fmtDateTime(flag.flagged_at, { time: false })}
        {flag.note && <span className="text-parish-ink"> — “{flag.note}”</span>}
      </div>
      {ours && (
        <button onClick={() => flags.takeBack(flag)} disabled={busy} className="appearance-none border-none cursor-pointer px-3 py-1.5 font-semibold text-[12.5px] text-parish-text2 bg-parish-card rounded-lg whitespace-nowrap disabled:opacity-60">
          {busy ? 'Saving…' : 'Take back'}
        </button>
      )}
      {flags.canClose && (
        <button
          onClick={() => flags.close(flag)}
          disabled={busy}
          title="The records were fixed some other way. Merging, deleting or marking them different closes it by itself."
          className="appearance-none border-none cursor-pointer px-3 py-1.5 font-semibold text-[12.5px] text-parish-ok bg-parish-okBg rounded-lg whitespace-nowrap disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Done'}
        </button>
      )}
    </div>
  );
}

/** For a GKK leader: another GKK's record, which only the parish office opens. */
export function OtherGkkNote({ gkk }) {
  return <div className="text-[12.5px] text-parish-muted mt-1">A record of {gkk || 'another GKK'}: only the parish office can open or change it.</div>;
}
