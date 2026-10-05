import test from 'node:test';
import assert from 'node:assert/strict';

import {
  descendantKeys, escapeHtml, findCycle, fromRows, hasCycle, HIDDEN_ROOT, holderOf, nameInitials,
  parishRoleNote, removeLiftingChildren, safePhotoUrl, savePayload, siblingOrder, toD3Rows, wouldCreateCycle,
} from '../src/lib/orgChart.js';

// Parish Priest → PPC President → (Secretary, Treasurer); Secretary → Clerk.
const tree = [
  { key: '1', parentKey: null, title: 'Parish Priest', x: 0, y: 0 },
  { key: '2', parentKey: '1', title: 'PPC President', x: 0, y: 150 },
  { key: '3', parentKey: '2', title: 'PPC Treasurer', x: 200, y: 300 },
  { key: '4', parentKey: '2', title: 'PPC Secretary', x: -200, y: 300 },
  { key: 'new-1', parentKey: '4', title: 'Clerk', x: -200, y: 450 },
];

test('descendants are found however far down', () => {
  assert.deepEqual([...descendantKeys(tree, '2')].sort(), ['3', '4', 'new-1']);
  assert.deepEqual([...descendantKeys(tree, '3')], []);
});

test('a position cannot go under itself or anything below it', () => {
  assert.equal(wouldCreateCycle(tree, '2', '2'), true);
  assert.equal(wouldCreateCycle(tree, '2', 'new-1'), true);
  assert.equal(wouldCreateCycle(tree, '1', '3'), true);
  assert.equal(wouldCreateCycle(tree, 'new-1', '3'), false);
  assert.equal(wouldCreateCycle(tree, '3', null), false);
});

test('a loop in the data is detected', () => {
  assert.equal(hasCycle(tree), false);
  const looped = tree.map((n) => (n.key === '1' ? { ...n, parentKey: 'new-1' } : n));
  assert.equal(hasCycle(looped), true);
  assert.ok(findCycle(looped));
  assert.equal(hasCycle([{ key: 'a', parentKey: 'a' }]), true);
  // A parent that isn't in the chart is not a loop.
  assert.equal(hasCycle([{ key: 'a', parentKey: 'gone' }]), false);
});

test('deleting a position moves its children up to its parent', () => {
  const after = removeLiftingChildren(tree, '2');
  assert.equal(after.length, 4);
  assert.equal(after.find((n) => n.key === '3').parentKey, '1');
  assert.equal(after.find((n) => n.key === '4').parentKey, '1');
  assert.equal(after.find((n) => n.key === 'new-1').parentKey, '4');
  // The top position's children become top positions.
  assert.equal(removeLiftingChildren(tree, '1').find((n) => n.key === '2').parentKey, null);
  assert.equal(removeLiftingChildren(tree, 'nope'), tree);
});

test('siblings are ordered left to right on the canvas', () => {
  const order = siblingOrder(tree);
  assert.equal(order['4'], 0);
  assert.equal(order['3'], 1);
  assert.equal(order['1'], 0);
});

test('the save payload has ids, parents, order and rounded positions', () => {
  const nodes = [
    ...tree.slice(0, 4),
    { key: 'new-1', parentKey: '4', title: '  Clerk ', note: ' ', holderName: ' Ana ', x: -200.4, y: 450.6 },
    { key: 'new-2', parentKey: 'deleted', title: 'Orphan' },
  ];
  const p = savePayload(nodes);
  const clerk = p.find((n) => n.key === 'new-1');
  assert.deepEqual(clerk, {
    key: 'new-1', id: null, parentKey: '4', title: 'Clerk', positionName: null, gkkRole: null, memberId: null,
    holderName: 'Ana', photoUrl: null, note: null, sortOrder: 0, x: -200, y: 451,
  });
  assert.equal(p.find((n) => n.key === '3').id, 3);
  assert.equal(p.find((n) => n.key === 'new-2').parentKey, null);
  assert.equal(p.find((n) => n.key === 'new-2').x, null);
});

test('database rows become editor positions', () => {
  const [n] = fromRows([{
    id: 7, parent_id: 2, title: 'Old name', position_name: 'PPC Secretary', gkk_role: null, member_id: 9,
    member: { first_name: 'Juan', last_name: 'Dela Cruz', suffix: 'Jr.' }, holder_name: null, photo_url: null, note: '2025', sort_order: 1, pos_x: 10, pos_y: 20,
  }]);
  assert.equal(n.key, '7');
  assert.equal(n.parentKey, '2');
  assert.equal(n.title, 'PPC Secretary');
  assert.equal(n.memberName, 'Juan Dela Cruz Jr.');
  assert.equal(holderOf(n), 'Juan Dela Cruz Jr.');
  assert.equal(holderOf({ holderName: 'Typed' }), 'Typed');
});

test('initials for a position without a photo', () => {
  assert.equal(nameInitials('Juan Dela Cruz'), 'JC');
  assert.equal(nameInitials('maria'), 'M');
  assert.equal(nameInitials('  Ñora   Ibáñez '), 'ÑI');
  assert.equal(nameInitials('Juan Dela Cruz Jr.'), 'JC');
  assert.equal(nameInitials(''), '');
  assert.equal(nameInitials(null), '');
});

test('text and photos going into the website chart are made safe', () => {
  assert.equal(escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(safePhotoUrl('https://media.example/org/a.jpg'), 'https://media.example/org/a.jpg');
  assert.equal(safePhotoUrl('javascript:alert(1)'), '');
  assert.equal(safePhotoUrl('http://insecure/a.jpg'), '');
});

test('chart nodes become d3 rows, with one root', () => {
  const one = toD3Rows([{ id: 1, parentId: null, title: 'A' }, { id: 2, parentId: 1, title: 'B' }]);
  assert.deepEqual(one.map((r) => [r.id, r.parentId]), [['1', null], ['2', '1']]);

  // Two top positions share a hidden root; a missing parent counts as none.
  const forest = toD3Rows([{ id: 1, parentId: null }, { id: 2, parentId: 99 }, { id: 3, parentId: 2 }]);
  assert.equal(forest[0].id, HIDDEN_ROOT);
  assert.equal(forest[0].hidden, true);
  assert.deepEqual(forest.slice(1).map((r) => [r.id, r.parentId]), [['1', HIDDEN_ROOT], ['2', HIDDEN_ROOT], ['3', '2']]);

  // A loop is cut so the chart can still be drawn.
  const looped = toD3Rows([{ id: 1, parentId: 2 }, { id: 2, parentId: 1 }]);
  assert.equal(looped.filter((r) => r.parentId == null).length, 1);
  assert.deepEqual(toD3Rows([]), []);
});

test('tidy layout puts parents above their children and keeps sibling order', async () => {
  const { tidyPositions } = await import('../src/lib/orgChartLayout.js');
  const pos = tidyPositions(tree);
  assert.ok(pos['1'].y < pos['2'].y);
  assert.ok(pos['2'].y < pos['3'].y);
  assert.equal(pos['3'].y, pos['4'].y);
  // Secretary was left of Treasurer, and stays there.
  assert.ok(pos['4'].x < pos['3'].x);
  assert.ok(pos['4'].y < pos['new-1'].y);
});

test('tidy layout copes with several tops and a loop', async () => {
  const { tidyPositions, NODE_W } = await import('../src/lib/orgChartLayout.js');
  const pos = tidyPositions([
    { key: 'a', parentKey: null, x: 500 },
    { key: 'b', parentKey: null, x: 0 },
    { key: 'c', parentKey: 'd' }, { key: 'd', parentKey: 'c' },
  ]);
  assert.equal(Object.keys(pos).length, 4);
  assert.ok(pos.b.x + NODE_W <= pos.a.x);
  assert.equal(pos.a.y, 0);
});

test('the save message names the parish roles it changed', () => {
  assert.equal(parishRoleNote([]), '');
  assert.equal(parishRoleNote(undefined), '');
  assert.equal(
    parishRoleNote([{ name: 'Juan Dela Cruz', from: null, to: 'PPC President' }, { name: 'Maria Reyes', from: 'PPC Secretary', to: null }]),
    'Katungdanan sa Parish updated in the registry. Juan Dela Cruz: PPC President; Maria Reyes: none.',
  );
});
