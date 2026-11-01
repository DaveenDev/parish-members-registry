import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSql, lastDone, migrationMarkers, verdicts, versionOf } from '../../scripts/migration-markers.mjs';

const files = [
  { file: '0001_init.sql', sql: `create table if not exists gkks (id int);\ncreate or replace function public.gkk_count() returns int language sql as $$ select 1; $$;\ncreate table storage.objects_x (id int);` },
  { file: '0002_more.sql', sql: `-- create table not_this (id int);\nalter table gkks add column if not exists barangay text, add column chapel text;\ncreate or replace function gkk_count() returns int language plpgsql as $f$ begin create table inside_body (x int); return 2; end $f$;` },
  { file: '0003_only_changes.sql', sql: `create or replace function public.gkk_count() returns int language sql as $$ select 3; $$;` },
  { file: '0004_old_thing.sql', sql: `create table if not exists prayer_intentions (id int);\ncreate or replace view gkk_view as select 1;` },
  { file: '0005_remove.sql', sql: `drop table if exists prayer_intentions;\nalter table gkks drop column if exists chapel;` },
];

test('a version is the file name up to the first underscore', () => {
  assert.equal(versionOf('00191_sacrament_guide_drafts.sql'), '00191');
});

test('each migration owns what it adds first, not what earlier ones added, comments or function bodies', () => {
  const m = migrationMarkers(files);
  assert.deepEqual(m[0].markers, [{ kind: 'table', name: 'gkks' }, { kind: 'function', name: 'gkk_count' }]);
  assert.deepEqual(m[1].markers, [{ kind: 'column', table: 'gkks', name: 'barangay' }]);
  assert.deepEqual(m[2].markers, []);
});

test('something a later migration drops says nothing about the one that added it', () => {
  const m = migrationMarkers(files);
  assert.deepEqual(m[3].markers, [{ kind: 'view', name: 'gkk_view' }]);
  assert.ok(!m[1].markers.some((x) => x.name === 'chapel'));
});

test('a drop and re-create belongs to the migration that re-creates it', () => {
  const m = migrationMarkers([
    { file: '0001_a.sql', sql: 'create function public.f(a int) returns int language sql as $$ select 1 $$;' },
    { file: '0002_b.sql', sql: 'drop function if exists public.f(int);\ncreate function public.f(a text) returns int language sql as $$ select 1 $$;' },
  ]);
  assert.deepEqual(m[0].markers, []);
  assert.deepEqual(m[1].markers, [{ kind: 'function', name: 'f' }]);
});

test('the check is one query of literal names', () => {
  const sql = checkSql(migrationMarkers(files).slice(0, 2));
  assert.match(sql, /to_regclass\('public\.gkks'\)/);
  assert.match(sql, /table_name = 'gkks' and column_name = 'barangay'/);
  assert.match(sql, /p\.proname = 'gkk_count'/);
  assert.equal(sql.split('union all').length, 3);
  assert.match(checkSql([]), /where false/);
});

test('verdicts, and how far it can be marked applied', () => {
  const entries = migrationMarkers(files);
  const rows = [
    { version: '0001', marker: 'table gkks', present: true },
    { version: '0001', marker: 'function gkk_count', present: true },
    { version: '0002', marker: 'column gkks.barangay', present: true },
    { version: '0004', marker: 'view gkk_view', present: false },
  ];
  const checked = verdicts(entries, rows);
  assert.deepEqual(checked.map((c) => c.verdict), ['done', 'done', 'unknown', 'not run', 'unknown']);
  assert.deepEqual(checked[3].missing, ['view gkk_view']);
  assert.equal(lastDone(checked), '0002');

  const partly = verdicts(entries.slice(0, 1), [rows[0], { ...rows[1], present: false }]);
  assert.equal(partly[0].verdict, 'partly');
  assert.equal(lastDone(partly), null);
});
