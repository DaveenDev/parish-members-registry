import React, { useEffect, useState } from 'react';
import { PageHeader, PageBody, SearchInput, Pagination } from './admin.jsx';
import { useClientList } from '../hooks.js';
import { TextInput, PrimaryButton } from './ui.jsx';
import { useConfirm } from './ConfirmDialog.jsx';

export default function ManageList({ title, subtitle, ...listProps }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        <div className="max-w-[720px]">
          <ManageListCard {...listProps} />
        </div>
      </PageBody>
    </>
  );
}

/** Add / search / rename / delete card for one staff-managed name list. */
export function ManageListCard({ heading, description, itemNoun, placeholder, listFn, addFn, renameFn, deleteFn }) {
  const [rows, setRows] = useState([]);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');
  const confirm = useConfirm();
  const list = useClientList(rows, (r) => r.name);

  function reload() { listFn().then((res) => setRows(res.rows)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!newName.trim()) return;
    setError('');
    try {
      await addFn(newName.trim());
      setNewName('');
      reload();
    } catch (e) {
      setError(e.message || `Could not add this ${itemNoun}`);
    }
  }
  async function save() {
    if (!editValue.trim()) return;
    setError('');
    try {
      await renameFn(editing, editValue.trim());
      setEditing(null);
      reload();
    } catch (e) {
      setError(e.message || `Could not rename this ${itemNoun}`);
    }
  }
  async function remove(name) {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      message: `This removes the ${itemNoun} from the list. It can't be undone, but you can add it again later.`,
      confirmLabel: `Delete ${itemNoun}`,
      tone: 'danger',
    });
    if (!ok) return;
    setError('');
    try {
      await deleteFn(name);
      reload();
    } catch (e) {
      setError(e.message || `Could not delete this ${itemNoun}`);
    }
  }

  return (
    <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-6 shadow-cardSm">
      {heading && <div className="font-serif text-[22px] font-semibold text-parish-navy mb-1">{heading}</div>}
      {description && <div className="text-[13.5px] text-parish-muted mb-[18px]">{description}</div>}
      {error && <div className="mb-3 text-parish-error text-[13.5px] font-medium">{error}</div>}
      <div className="flex gap-2 mb-4">
        <TextInput placeholder={placeholder || `New ${itemNoun} name`} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <PrimaryButton onClick={add} className="px-[22px] py-2.5 text-[14px] whitespace-nowrap">Add</PrimaryButton>
      </div>
      {rows.length > 0 && (
        <div className="mb-3">
          <SearchInput placeholder={`Search ${itemNoun} names…`} aria-label={`Search ${itemNoun} names`} value={list.query} onChange={(e) => list.setQuery(e.target.value)} />
        </div>
      )}
      <div className="flex flex-col gap-2">
        {list.rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2.5 border border-[#f0e8d6] rounded-xl px-3.5 py-2.5 bg-[#fdfbf6]">
            {editing === r.name ? (
              <>
                <TextInput value={editValue} onChange={(e) => setEditValue(e.target.value)} className="flex-1 !py-2.5 !bg-white !border-parish-blue" />
                <button onClick={save} className="appearance-none border-none bg-parish-blue text-white cursor-pointer px-4 py-2 rounded-lg font-bold text-[12.5px]">Save</button>
                <button onClick={() => setEditing(null)} className="appearance-none border-none bg-[#f4efe3] text-parish-text2 cursor-pointer px-3.5 py-2 rounded-lg font-semibold text-[12.5px]">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold text-[14.5px] text-parish-navy">{r.name}</span>
                <span className="font-semibold text-[12px] text-parish-muted">{r.count} member(s)</span>
                <button onClick={() => { setEditing(r.name); setEditValue(r.name); }} className="appearance-none border-none bg-[var(--p-blue-tint)] text-parish-blue cursor-pointer px-3.5 py-2 rounded-lg font-semibold text-[12.5px]">Edit</button>
                <button onClick={() => remove(r.name)} className="appearance-none border-none bg-parish-errorBg text-parish-error cursor-pointer px-3.5 py-2 rounded-lg font-semibold text-[12.5px]">Delete</button>
              </>
            )}
          </div>
        ))}
        {!rows.length && <div className="text-[13.5px] text-parish-muted">Nothing added yet.</div>}
        {!!rows.length && !list.total && <div className="text-[13.5px] text-parish-muted">No {itemNoun} matches “{list.query}”.</div>}
      </div>
      <div className="-mx-6 -mb-6 mt-4">
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} />
      </div>
    </div>
  );
}
