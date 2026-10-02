import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Badge } from '../ui.jsx';
import { STATE_TONES } from '../../lib/website.js';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';

export { SidePanel, SectionLabel, TextArea, RowButton, Panel, TabIntro, AddButton } from '../panels.jsx';

/**
 * Rows of one website content table plus the actions every tab shares:
 * publish/unpublish, delete (after a confirm), and putting a saved row back
 * into the list without a reload. `describe(row)` names a row in messages.
 */
export function useContentList({ table, load, remove, describe }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsyncData(load, []);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { if (data) setRows(data.rows); }, [data]);

  function upsert(saved) {
    setRows((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [...rs, saved]));
  }

  async function togglePublished(row) {
    setBusyId(row.id);
    try {
      upsert(await api.setWebsitePublished(table, row.id, !row.published));
      toast.success(row.published ? `${describe(row)} is now a draft` : `${describe(row)} is on the website`);
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow(row) {
    const ok = await confirm({
      title: `Delete “${describe(row)}”?`,
      message: "This can't be undone. To hide it without deleting, make it a draft instead.",
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await remove(row.id);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message || 'Could not delete this');
    } finally {
      setBusyId(null);
    }
  }

  /** Drop rows deleted elsewhere (e.g. the days unticked from a Daily Mass). */
  function forget(ids) {
    setRows((rs) => rs.filter((r) => !ids.includes(r.id)));
  }

  return { rows, loading: loading && !data, error, reload, upsert, forget, togglePublished, removeRow, busyId };
}

/** "Show on the public website" switch inside an editor. */
export function PublishSwitch({ checked, onChange }) {
  return (
    <label className="flex items-start gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-field cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-[19px] h-[19px] mt-0.5 accent-parish-blue cursor-pointer" />
      <span>
        <span className="block font-semibold text-[14px] text-parish-navy">Show on the public website</span>
        <span className="block text-[12.5px] text-parish-muted">Leave unticked to keep it as a draft only staff can see.</span>
      </span>
    </label>
  );
}

export function StateBadge({ state }) {
  return <Badge tone={STATE_TONES[state] || 'gray'}>{state}</Badge>;
}
