import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal } from './admin.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { formatAccessCode } from '../lib/census.js';

/**
 * The two things a family types into the online census form (/census): the
 * household reference number and its access code (0008 migration). Asking
 * for the code issues one if the household has none yet.
 */
export default function CensusCodesDialog({ household, canReset, onClose }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [code, setCode] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.censusAccessCodes([household.id])
      .then((codes) => setCode(codes[household.id] || null))
      .catch((e) => setError(e.message || 'Could not get the census code'));
  }, [household.id]);

  async function newCode() {
    const ok = await confirm({
      title: 'Give this family a new online code?',
      message: 'The code on the form they already have stops working at once. Print a new form or tell them the new code.',
      confirmLabel: 'New code',
    });
    if (!ok) return;
    try {
      setCode(await api.resetAccessCode(household.id));
      toast.success('New online code issued');
    } catch (e) {
      toast.error(e.message || 'Could not issue a new code');
    }
  }

  function copy(text, what) {
    navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`)).catch(() => {});
  }

  const field = (label, value, copyText) => (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-sunk">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold tracking-[.12em] uppercase text-parish-muted">{label}</div>
        <div className="font-serif text-[26px] font-semibold tracking-[.06em] text-parish-navy">{value}</div>
      </div>
      {copyText && (
        <button type="button" onClick={() => copy(copyText, label)} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1 py-1">Copy</button>
      )}
    </div>
  );

  return (
    <Modal title="Census update codes" onClose={onClose} maxWidth={440}>
      <p className="text-[13.5px] text-parish-text2 mt-0 mb-4">{household.household_name}</p>
      <div className="flex flex-col gap-2.5">
        {field('Reference No.', household.ref_no || '—', household.ref_no)}
        {error
          ? <div role="alert" className="text-[13.5px] text-parish-error">{error}</div>
          : field('Census code', code ? formatAccessCode(code) : 'Getting code…', code && formatAccessCode(code))}
      </div>
      <p className="text-[12.5px] text-parish-muted mt-4 mb-0">
        The family enters both at <strong>{window.location.origin}/census</strong>. Keep the code private.
      </p>
      {canReset && code && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={newCode} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1 py-1">New code</button>
        </div>
      )}
    </Modal>
  );
}
