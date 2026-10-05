// "Tidy layout" for the Organization Structure editor: a top-down tree,
// each parent centred over its children, siblings kept in their
// left-to-right order (the order the website shows them in).

export const NODE_W = 232;
export const NODE_H = 88;
const GAP = 28;      // between siblings
const RANK_GAP = 72; // between levels

/**
 * Top-left canvas positions { key: { x, y } } for `nodes` ({ key, parentKey,
 * x, y, w?, h? }). Top positions sit side by side, in their current order.
 */
export function tidyPositions(nodes) {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const order = (a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0);
  const kids = new Map();
  const roots = [];
  for (const n of [...nodes].sort(order)) {
    if (n.parentKey != null && n.parentKey !== n.key && byKey.has(n.parentKey)) {
      if (!kids.has(n.parentKey)) kids.set(n.parentKey, []);
      kids.get(n.parentKey).push(n);
    } else {
      roots.push(n);
    }
  }
  const rowH = Math.max(NODE_H, ...nodes.map((n) => n.h || 0)) + RANK_GAP;
  const own = (n) => n.w || NODE_W;

  // Each position once, even in a loop (whatever a loop leaves out becomes a top position).
  const seen = new Set();
  const span = new Map();
  function measure(n) {
    seen.add(n.key);
    const children = (kids.get(n.key) || []).filter((c) => !seen.has(c.key));
    kids.set(n.key, children);
    const total = children.reduce((sum, c) => sum + measure(c), 0) + GAP * Math.max(0, children.length - 1);
    span.set(n.key, Math.max(own(n), total));
    return span.get(n.key);
  }
  const out = {};
  function place(n, left, depth) {
    const w = span.get(n.key);
    out[n.key] = { x: Math.round(left + w / 2 - own(n) / 2), y: depth * rowH };
    const children = kids.get(n.key) || [];
    const total = children.reduce((sum, c) => sum + span.get(c.key), 0) + GAP * Math.max(0, children.length - 1);
    let x = left + (w - total) / 2;
    for (const c of children) {
      place(c, x, depth + 1);
      x += span.get(c.key) + GAP;
    }
  }

  let left = 0;
  const tops = [...roots];
  for (let i = 0; i < tops.length || seen.size < nodes.length; i++) {
    if (i >= tops.length) tops.push(nodes.find((n) => !seen.has(n.key)));
    const r = tops[i];
    if (seen.has(r.key)) continue;
    measure(r);
    place(r, left, 0);
    left += span.get(r.key) + GAP * 2;
  }
  return out;
}
