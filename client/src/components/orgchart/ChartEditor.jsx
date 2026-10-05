import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, applyNodeChanges, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './orgchart.css';
import { api } from '../../api.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { ActionMenu, ErrorState, FilterSelect, LoadingState, Modal, Panel } from '../admin.jsx';
import { Field, GhostButton, PrimaryButton, TextInput } from '../ui.jsx';
import { findCycle, fromRows, holderOf, parishRoleNote, isNewKey, NEW_PREFIX, removeLiftingChildren, savePayload, wouldCreateCycle } from '../../lib/orgChart.js';
import { NODE_H, NODE_W, tidyPositions } from '../../lib/orgChartLayout.js';
import NodePanel, { HolderAvatar } from './NodePanel.jsx';
import GkkOfficers from './GkkOfficers.jsx';
import { usePhotoUploads } from './usePhotoUploads.js';

// What the position cards need from the editor (kept out of node data, so
// the data stays plain and comparable).
const EditorContext = createContext({ canEdit: false, scope: 'parish', preview: null, addChild: () => {} });

const dbId = (key) => (isNewKey(key) ? null : Number(key));

/** One position on the canvas: photo or initials, title, holder, note. */
function PositionNode({ id, data, selected }) {
  const { canEdit, scope, preview, addChild } = useContext(EditorContext);
  const shown = preview ? preview[dbId(id)] : null;
  let holder = holderOf(data);
  let photo = data.photoUrl;
  let sub = null;
  if (scope === 'gkk') {
    photo = shown?.photo || '';
    holder = shown ? (shown.holders.join(', ') || 'Bakante') : '';
    sub = data.gkkRole ? `GKK role: ${data.gkkRole}` : 'Set per GKK';
  }
  return (
    <div
      className={`relative rounded-xl border bg-parish-surface shadow-cardSm transition ${selected ? 'border-parish-blue ring-2 ring-parish-blue/35' : 'border-parish-borderSoft'}`}
      style={{ width: NODE_W, minHeight: NODE_H - 8 }}
    >
      <Handle type="target" position={Position.Top} isConnectable={canEdit} />
      <div className="h-1 rounded-t-xl" style={{ background: 'var(--p-gold)' }} />
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <HolderAvatar photo={photo} name={holder !== 'Bakante' ? holder : ''} size={40} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[13.5px] leading-tight text-parish-navy break-words">{data.title || <span className="text-parish-error">No title</span>}</div>
          {scope !== 'gkk' && <div className={`text-[12.5px] truncate ${holder ? 'text-parish-text2' : 'text-parish-muted italic'}`}>{holder || 'Vacant'}</div>}
          {scope === 'gkk' && holder && <div className={`text-[12.5px] truncate ${holder === 'Bakante' ? 'text-parish-muted italic' : 'text-parish-text2'}`}>{holder}</div>}
          {sub && <div className="text-[11.5px] text-parish-muted truncate">{sub}</div>}
          {data.note && <div className="text-[11.5px] text-parish-muted truncate">{data.note}</div>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={canEdit} />
      {canEdit && (
        <button
          type="button" title="Add a position under this one" aria-label={`Add a position under ${data.title || 'this position'}`}
          onClick={(e) => { e.stopPropagation(); addChild(id); }}
          className="nodrag nopan absolute -bottom-3 right-3 w-6 h-6 rounded-full border-none cursor-pointer bg-parish-fill text-white font-bold text-[15px] leading-none shadow-btn flex items-center justify-center"
        >
          +
        </button>
      )}
    </div>
  );
}

const nodeTypes = { position: PositionNode };

/** Editor positions → canvas nodes, laid out tidily when any has no saved place. */
function toFlow(positions) {
  const needLayout = positions.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y));
  const place = needLayout ? tidyPositions(positions.map((p, i) => ({ ...p, x: Number.isFinite(p.x) ? p.x : i }))) : null;
  return positions.map(({ key, x, y, sortOrder: _s, ...data }) => ({
    id: key, type: 'position', position: place ? place[key] : { x, y }, data,
  }));
}

/** Canvas nodes → editor positions. */
const toPositions = (nodes) => nodes.map((n) => ({ key: n.id, ...n.data, x: n.position.x, y: n.position.y }));
const snapshot = (nodes) => JSON.stringify(savePayload(toPositions(nodes)));

/**
 * The editor for one chart: the canvas, its toolbar, the selected
 * position's details, and (GKK Structure) the officers of one GKK.
 * `onDirtyChange` reports unsaved changes to the page.
 */
export default function ChartEditor(props) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

let newCount = 0;

function Editor({ chart, canEdit, onChartUpdated, onDeleted, onDirtyChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const rf = useReactFlow();
  const photos = usePhotoUploads();
  const canvasRef = useRef(null);
  const scope = chart.scope;

  const [state, setState] = useState({ loading: true, error: '' });
  const [nodes, setNodes] = useState([]);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [saving, setSaving] = useState(false);
  const [positionNames, setPositionNames] = useState([]);
  const saved = useRef({ nodes: [], snap: '[]' });

  const [gkks, setGkks] = useState([]);
  const [previewGkk, setPreviewGkk] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [renaming, setRenaming] = useState(false);

  const load = useCallback(async (selectKey = null) => {
    const rows = await api.listOrgNodes(chart.id);
    const flow = toFlow(fromRows(rows)).map((n) => ({ ...n, selected: n.id === selectKey }));
    saved.current = { nodes: flow, snap: snapshot(flow) };
    setNodes(flow);
  }, [chart.id]);

  useEffect(() => {
    let live = true;
    setState({ loading: true, error: '' });
    load()
      .then(() => live && setState({ loading: false, error: '' }))
      .catch((e) => live && setState({ loading: false, error: e.message || 'Could not load the chart' }));
    api.listParishPositions().then((r) => live && setPositionNames(r.rows.map((p) => p.name))).catch(() => {});
    if (scope === 'gkk') api.listGkks().then((r) => live && setGkks(r.rows.map((g) => g.name))).catch(() => {});
    return () => { live = false; };
  }, [load, scope]);

  // Photos uploaded and never saved go when the editor closes.
  const savedPhotos = () => saved.current.nodes.map((n) => n.data.photoUrl).filter(Boolean);
  useEffect(() => () => photos.forget(savedPhotos()), [photos.forget]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (scope !== 'gkk' || !previewGkk) { setPreview(null); return undefined; }
    let live = true;
    api.orgChartPreview(chart.id, previewGkk)
      .then((rows) => live && setPreview(Object.fromEntries((rows || []).map((r) => [r.id, r]))))
      .catch((e) => live && toast.error(e.message || 'Could not load the preview'));
    return () => { live = false; };
  }, [chart.id, scope, previewGkk, previewNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => !state.loading && snapshot(nodes) !== saved.current.snap, [nodes, state.loading]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const selected = nodes.find((n) => n.selected) || null;
  const keys = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => nodes
    .filter((n) => n.data.parentKey != null && keys.has(n.data.parentKey))
    .map((n) => ({
      id: `e:${n.id}`, source: n.data.parentKey, target: n.id, type: 'smoothstep',
      selected: selectedEdge === `e:${n.id}`, deletable: canEdit,
    })), [nodes, keys, selectedEdge, canEdit]);

  const patchNode = useCallback((key, patch) => {
    setNodes((ns) => ns.map((n) => (n.id === key ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);

  const select = useCallback((key) => {
    setSelectedEdge(null);
    setNodes((ns) => ns.map((n) => (n.selected === (n.id === key) ? n : { ...n, selected: n.id === key })));
  }, []);

  const addPosition = useCallback((parentKey = null) => {
    newCount += 1;
    const key = `${NEW_PREFIX}${Date.now().toString(36)}${newCount}`;
    setNodes((ns) => {
      let position;
      const parent = parentKey != null ? ns.find((n) => n.id === parentKey) : null;
      if (parent) {
        const siblings = ns.filter((n) => n.data.parentKey === parentKey);
        position = {
          x: siblings.length ? Math.max(...siblings.map((s) => s.position.x)) + NODE_W + 28 : parent.position.x,
          y: parent.position.y + (parent.measured?.height || NODE_H) + 72,
        };
      } else {
        const box = canvasRef.current?.getBoundingClientRect();
        const center = box ? rf.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }) : { x: 0, y: 0 };
        position = { x: Math.round(center.x - NODE_W / 2), y: Math.round(center.y - NODE_H / 2) };
      }
      const data = { parentKey, title: 'New position', positionName: null, gkkRole: null, memberId: null, memberName: '', holderName: '', photoUrl: '', note: '' };
      return [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), { id: key, type: 'position', position, data, selected: true }];
    });
    setSelectedEdge(null);
    // Bring the new position into view, at the same zoom.
    setTimeout(() => {
      const zoom = rf.getZoom();
      rf.fitView({ nodes: [{ id: key }], minZoom: zoom, maxZoom: zoom, duration: 250 });
    }, 50);
  }, [rf]);

  const reparent = useCallback((childKey, parentKey) => {
    const positions = toPositions(rf.getNodes());
    if (wouldCreateCycle(positions, childKey, parentKey)) {
      toast.error("A position can't go under itself or one of the positions below it");
      return;
    }
    patchNode(childKey, { parentKey });
  }, [rf, patchNode, toast]);

  const requestDelete = useCallback(async (key) => {
    const node = rf.getNodes().find((n) => n.id === key);
    if (!node) return;
    const below = rf.getNodes().filter((n) => n.data.parentKey === key).length;
    const ok = await confirm({
      title: `Delete “${node.data.title || 'this position'}”?`,
      message: `${below ? `The ${below} position(s) under it move up a level. ` : ''}Nothing changes on the website until you save.`,
      tone: 'danger', confirmLabel: 'Delete',
    });
    if (!ok) return;
    photos.drop(node.data.photoUrl);
    setNodes((ns) => {
      const kept = removeLiftingChildren(toPositions(ns), key);
      const byKey = new Map(kept.map((p) => [p.key, p.parentKey]));
      return ns.filter((n) => n.id !== key).map((n) => (byKey.get(n.id) === n.data.parentKey ? n : { ...n, data: { ...n.data, parentKey: byKey.get(n.id) } }));
    });
  }, [rf, confirm, photos]);

  function tidy() {
    const place = tidyPositions(nodes.map((n) => ({ key: n.id, parentKey: n.data.parentKey, x: n.position.x, y: n.position.y, w: n.measured?.width, h: n.measured?.height })));
    setNodes((ns) => ns.map((n) => ({ ...n, position: place[n.id] || n.position })));
    requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 300 }));
  }

  async function save() {
    const positions = toPositions(nodes);
    const blank = positions.find((p) => !(p.title || '').trim());
    if (blank) { select(blank.key); toast.error('Every position needs a title'); return; }
    const loop = findCycle(positions);
    if (loop) { select(loop.key); toast.error(`“${loop.title}” is under one of its own positions`); return; }
    setSaving(true);
    try {
      const before = savedPhotos();
      const res = await api.saveOrgChart(chart.id, savePayload(positions));
      const now = positions.map((p) => p.photoUrl).filter(Boolean);
      photos.forget(now);
      for (const url of before) if (!now.includes(url)) api.deleteImage(url).catch(() => {});
      const selectedKey = selected ? String(res?.keys?.[selected.id] ?? selected.id) : null;
      await load(selectedKey);
      setPreviewNonce((n) => n + 1);
      toast.success(`${chart.title} saved${chart.published ? '. The website shows it now.' : '.'} ${parishRoleNote(res?.roles)}`.trim());
    } catch (e) {
      toast.error(e.message || 'Could not save the chart');
    } finally {
      setSaving(false);
    }
  }

  async function discard() {
    if (!(await confirm({ title: 'Discard your changes?', message: 'The chart goes back to how it was last saved.', tone: 'danger', confirmLabel: 'Discard' }))) return;
    photos.forget(savedPhotos());
    setNodes(saved.current.nodes);
    setSelectedEdge(null);
  }

  async function togglePublished() {
    try {
      const row = await api.setOrgChartPublished(chart.id, !chart.published);
      onChartUpdated(row);
      toast.success(row.published ? `${chart.title} is on the website` : `${chart.title} is off the website`);
    } catch (e) {
      toast.error(e.message || 'Could not change it');
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${chart.title}?`,
      message: `Its ${nodes.length} position(s) are deleted too${chart.published ? ', and it comes off the website' : ''}. This can't be undone.`,
      tone: 'danger', confirmLabel: 'Delete chart',
    });
    if (!ok) return;
    try {
      const before = savedPhotos();
      await api.deleteOrgChart(chart.id);
      photos.forget();
      for (const url of before) api.deleteImage(url).catch(() => {});
      toast.success(`${chart.title} deleted`);
      onDeleted();
    } catch (e) {
      toast.error(e.message || 'Could not delete the chart');
    }
  }

  const onNodesChange = useCallback((changes) => {
    const kept = changes.filter((c) => c.type !== 'remove');
    if (kept.some((c) => c.type === 'select' && c.selected)) setSelectedEdge(null);
    setNodes((ns) => applyNodeChanges(kept, ns));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    for (const c of changes) {
      if (c.type === 'select') setSelectedEdge((cur) => (c.selected ? c.id : cur === c.id ? null : cur));
      if (c.type === 'remove' && canEdit) {
        patchNode(c.id.slice(2), { parentKey: null });
        setSelectedEdge(null);
      }
    }
  }, [canEdit, patchNode]);

  const onBeforeDelete = useCallback(async ({ nodes: gone }) => {
    if (gone.length) {
      requestDelete(gone[0].id);
      return false;
    }
    return true;
  }, [requestDelete]);

  const context = useMemo(() => ({ canEdit, scope, preview, addChild: addPosition }), [canEdit, scope, preview, addPosition]);
  const savedPositions = saved.current.nodes.filter((n) => !isNewKey(n.id)).map((n) => ({ id: Number(n.id), title: n.data.title, gkkRole: n.data.gkkRole }));
  const siteLink = `/simbahan?tab=organisasyon&chart=${encodeURIComponent(chart.slug)}`;

  if (state.loading) return <Panel><LoadingState label="Loading the chart…" /></Panel>;
  if (state.error) return <Panel><ErrorState message={state.error} onRetry={() => { setState({ loading: true, error: '' }); load().then(() => setState({ loading: false, error: '' })).catch((e) => setState({ loading: false, error: e.message })); }} /></Panel>;

  return (
    <EditorContext.Provider value={context}>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {canEdit && (
          <>
            <PrimaryButton type="button" onClick={() => addPosition(null)} className="px-4 py-2.5 text-[14px]">+ Add position</PrimaryButton>
            <GhostButton type="button" onClick={tidy} disabled={!nodes.length} className="px-4 py-2 text-[14px]">Tidy layout</GhostButton>
          </>
        )}
        {scope === 'gkk' && (
          <FilterSelect aria-label="Preview the chart as one GKK" value={previewGkk} onChange={(e) => setPreviewGkk(e.target.value)}>
            <option value="">Preview as GKK…</option>
            {gkks.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <PublishedSwitch published={chart.published} canEdit={canEdit} onToggle={togglePublished} />
          <ActionMenu label="Chart actions" items={[
            chart.published && { label: 'View on the website', onClick: () => window.open(siteLink, '_blank', 'noopener') },
            canEdit && { label: 'Rename chart', onClick: () => setRenaming(true) },
            canEdit && !chart.builtin && { label: 'Delete chart', tone: 'danger', onClick: remove },
          ]} />
          {canEdit && (
            <>
              <GhostButton type="button" onClick={discard} disabled={!dirty || saving} className="px-4 py-2 text-[14px] disabled:opacity-50 disabled:cursor-not-allowed">Discard</GhostButton>
              <PrimaryButton type="button" onClick={save} disabled={!dirty || saving || photos.uploading} className="px-5 py-2.5 text-[14px]">{saving ? 'Saving…' : 'Save'}</PrimaryButton>
            </>
          )}
        </div>
      </div>
      {canEdit && (
        <p className="m-0 mb-3 text-[12.5px] text-parish-muted">
          Drag from a position's bottom dot to another's top dot to put it under that one. Click a line and press Delete to detach it. Siblings show on the website in their left-to-right order.
          {dirty && <strong className="text-parish-warnStrong"> Unsaved changes.</strong>}
        </p>
      )}
      <div className="md:hidden mb-2 px-3 py-2 rounded-lg bg-parish-sunk text-[12.5px] text-parish-text2">Pan and zoom work here; editing the chart is easier on a computer.</div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div ref={canvasRef} className="org-flow h-[64vh] min-h-[420px] rounded-2xl border border-parish-border overflow-hidden bg-parish-field">
          <ReactFlow
            nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={({ source, target }) => reparent(target, source)}
            isValidConnection={(c) => c.source !== c.target}
            onBeforeDelete={onBeforeDelete}
            onPaneClick={() => setSelectedEdge(null)}
            nodesDraggable={canEdit} nodesConnectable={canEdit} edgesFocusable={canEdit}
            deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
            fitView fitViewOptions={{ padding: 0.15, maxZoom: 1 }} minZoom={0.15} maxZoom={1.75}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable style={{ width: 150, height: 96 }} className="!hidden xl:!block" />
          </ReactFlow>
        </div>

        <Panel className="p-4 sm:p-5 lg:max-h-[64vh] lg:overflow-y-auto">
          {selected ? (
            <NodePanel
              key={selected.id} node={selected} scope={scope} positions={positionNames} canEdit={canEdit} photos={photos}
              onChange={(patch) => patchNode(selected.id, patch)}
              onAddChild={() => addPosition(selected.id)}
              onDelete={() => requestDelete(selected.id)}
            />
          ) : (
            <div className="text-[13.5px] text-parish-text2 flex flex-col gap-2">
              <div className="font-serif text-[20px] font-semibold text-parish-navy">{chart.title}</div>
              <div>{nodes.length} position(s). {chart.published ? 'On the website.' : 'Not on the website yet.'}</div>
              <div className="text-parish-muted">{!canEdit ? 'Click a position to see its details.' : scope === 'gkk' ? 'Click a position to edit its title, GKK role and note.' : 'Click a position to edit its title, holder, photo and note.'}</div>
              {scope === 'gkk' && <div className="text-parish-muted">This structure is the same for every GKK. Pick a GKK in “Preview as GKK…” to see and set its officers.</div>}
            </div>
          )}
        </Panel>
      </div>

      {scope === 'gkk' && previewGkk && (
        <GkkOfficers
          gkk={previewGkk} positions={orderedForTable(savedPositions, saved.current.nodes)} preview={preview}
          canEdit={canEdit} dirty={dirty} onChanged={() => setPreviewNonce((n) => n + 1)}
        />
      )}

      {renaming && (
        <RenameChart chart={chart} onClose={() => setRenaming(false)} onSaved={(row) => { setRenaming(false); onChartUpdated(row); }} />
      )}
    </EditorContext.Provider>
  );
}

/** Saved positions top to bottom, each level left to right, for the officers list. */
function orderedForTable(positions, flowNodes) {
  const at = new Map(flowNodes.map((n) => [Number(n.id), n.position]));
  return [...positions].sort((a, b) => (at.get(a.id)?.y ?? 0) - (at.get(b.id)?.y ?? 0) || (at.get(a.id)?.x ?? 0) - (at.get(b.id)?.x ?? 0));
}

function PublishedSwitch({ published, canEdit, onToggle }) {
  if (!canEdit) {
    return <span className={`text-[12.5px] font-semibold px-2.5 py-1 rounded-full ${published ? 'bg-parish-okBg text-parish-okText' : 'bg-parish-sunk text-parish-text2'}`}>{published ? 'On the website' : 'Not published'}</span>;
  }
  return <PublishToggle published={published} onToggle={onToggle} />;
}

/** On: "Published" (on the website). Off: "Publish it". Disabled while the change saves. */
function PublishToggle({ published, onToggle }) {
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try { await onToggle(); } finally { setBusy(false); }
  }
  return (
    <label className={`flex items-center gap-2.5 cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-parish-sunk ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
      <span className="relative inline-flex">
        <input type="checkbox" role="switch" checked={published} disabled={busy} onChange={toggle} className="peer sr-only" />
        <span className="w-10 h-6 rounded-full bg-parish-sunk border border-parish-border transition peer-checked:bg-parish-fill peer-checked:border-transparent peer-focus-visible:ring-4 peer-focus-visible:ring-parish-blue/20" />
        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      <span className={`text-[13.5px] font-semibold ${published ? 'text-parish-okText' : 'text-parish-text2'}`}>{published ? 'Published' : 'Publish it'}</span>
    </label>
  );
}

function RenameChart({ chart, onClose, onSaved }) {
  const [title, setTitle] = useState(chart.title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) { setError('Give the chart a title'); return; }
    setBusy(true);
    try {
      onSaved(await api.renameOrgChart(chart.id, title.trim()));
    } catch (err) {
      setError(err.message || 'Could not rename it');
      setBusy(false);
    }
  }
  return (
    <Modal title="Rename chart" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Title" required error={error}>
          <TextInput autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="flex gap-2.5 justify-end">
          <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={busy} className="px-6 py-2.5 text-[14px]">{busy ? 'Saving…' : 'Rename'}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
