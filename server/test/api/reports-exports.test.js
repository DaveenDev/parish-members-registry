/** Dashboard figures, report generation and the CSV exports. */
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { dbConfigured, skipReason, getPool, resetRegistry, insertHousehold } from '../helpers/db.js';
import { startTestServer, staffToken } from '../helpers/http.js';

let server;
let pool;
let token;

/** ISO date for someone who turns `age` today (birthday already passed). */
function dobForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Split a CSV line, honouring quoted fields. */
function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

describe('reports and exports API', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    pool = await getPool();
    server = await startTestServer();
    token = await staffToken();
    await resetRegistry(pool);

    // 2 households, 3 members: one fully sacramented volunteer, one child,
    // one member with no blood type and no groups.
    await insertHousehold(
      pool,
      { household_name: 'Aquino Family', gkk: 'GKK San Isidro', status: 'Verified' },
      [
        {
          first_name: 'Ana', last_name: 'Aquino', sex: 'Female', dob: dobForAge(45),
          blood_type: 'O+', contact: '0917 555 0100', relationship: 'Head of Household',
          has_baptism: true, has_communion: true, has_confirmation: true, has_matrimony: true,
          ministries: ['Choir'], organizations: ['Youth Ministry'],
        },
        {
          first_name: 'Ben', last_name: 'Aquino', sex: 'Male', dob: dobForAge(12),
          blood_type: 'A+', relationship: 'Son',
          has_baptism: true,
          ministries: ['Choir'],
        },
      ]
    );
    await insertHousehold(
      pool,
      { household_name: 'Bautista, Jr. Family', gkk: 'GKK Sto. Niño', status: 'Pending' },
      [{ first_name: 'Carlos', last_name: 'Bautista', sex: 'Male', dob: dobForAge(68), relationship: 'Head of Household' }]
    );
  });

  after(async () => {
    await resetRegistry(pool);
    await server?.close();
    await pool?.end();
  });

  const get = (path) => server.request(path, { token });

  describe('GET /api/dashboard/stats', () => {
    test('counts households, members and statuses', async () => {
      const res = await get('/api/dashboard/stats');

      assert.equal(res.status, 200);
      const card = (label) => res.body.statCards.find((c) => c.label === label);
      assert.equal(card('Households').value, 2);
      assert.equal(card('Members').value, 3);
      assert.equal(card('Verified').value, 1);
      assert.equal(card('Pending').value, 1);
      assert.equal(card('GKKs').value, 2);
      assert.equal(card('Households').note, '1 verified · 1 pending');
    });

    test('buckets members by age', async () => {
      const res = await get('/api/dashboard/stats');
      const bucket = (label) => res.body.ageBuckets.find((b) => b.label === label);

      assert.equal(bucket('10-19').n, 1);
      assert.equal(bucket('35-49').n, 1);
      assert.equal(bucket('65+').n, 1);
      assert.equal(bucket('0-9').n, 0);
      assert.ok(res.body.ageBuckets.every((b) => /^\d+%$/.test(b.h)), 'bar heights should be percentages');
    });

    test('breaks down by GKK, ministry and sacrament', async () => {
      const res = await get('/api/dashboard/stats');

      assert.equal(res.body.gkkBreak.find((g) => g.label === 'GKK San Isidro').n, 1);
      assert.equal(res.body.ministryBreak.find((m) => m.label === 'Choir').n, 2);
      assert.equal(res.body.ministryBreak.find((m) => m.label === 'Youth Ministry').n, 1);
      assert.equal(res.body.sacStats.find((s) => s.label === 'Baptism').n, 2);
      assert.equal(res.body.sacStats.find((s) => s.label === 'Matrimony').n, 1);
    });

    test('returns six months of registration history', async () => {
      const res = await get('/api/dashboard/stats');

      assert.equal(res.body.regMonths.length, 6);
      assert.equal(res.body.regMonths.at(-1).n, 3, 'all three members were created this month');
    });
  });

  describe('GET /api/reports/stats', () => {
    test('reports registration status per GKK as counts and bar widths', async () => {
      const res = await get('/api/reports/stats');

      assert.equal(res.status, 200);
      assert.equal(res.body.totalHH, 2);
      assert.equal(res.body.totalMembers, 3);
      assert.equal(res.body.totalVerified, 1);
      assert.equal(res.body.totalPending, 1);

      const isidro = res.body.regByGkk.find((g) => g.label === 'GKK San Isidro');
      assert.deepEqual({ verified: isidro.verified, pending: isidro.pending, vw: isidro.vw, pw: isidro.pw }, {
        verified: 1, pending: 0, vw: '100%', pw: '0%',
      });
    });

    test('reports sacramental completion with the number still missing', async () => {
      const res = await get('/api/reports/stats');
      const sac = (label) => res.body.sacCompletion.find((s) => s.label === label);

      assert.equal(sac('Baptism').n, 2);
      assert.equal(sac('Baptism').missing, 1);
      assert.equal(sac('Baptism').w, '67%');
      assert.equal(sac('Matrimony').n, 1);
      assert.equal(sac('Matrimony').missing, 2);
    });

    test('reports ministry and organization participation together', async () => {
      const res = await get('/api/reports/stats');

      assert.equal(res.body.participation.find((p) => p.label === 'Choir').n, 2);
      assert.equal(res.body.participation.find((p) => p.label === 'Youth Ministry').n, 1);
      assert.ok(res.body.participation.every((p) => /^#[0-9a-f]{6}$/i.test(p.color)), 'each row needs a colour');
      assert.equal(res.body.anyVolunteer, 67, 'two of three members belong to something');
    });

    test('counts blood types and the unknowns', async () => {
      const res = await get('/api/reports/stats');

      assert.deepEqual(res.body.bloodCounts, [{ label: 'A+', n: 1 }, { label: 'O+', n: 1 }]);
      assert.equal(res.body.unknownBlood, 1);
    });
  });

  describe('GET /api/reports/blood', () => {
    test('returns the directory with derived name, initials and age', async () => {
      const res = await get('/api/reports/blood?type=All');

      assert.equal(res.status, 200);
      assert.equal(res.body.rows.length, 2, 'members without a blood type must be left out');

      const ana = res.body.rows.find((r) => r.name === 'Ana Aquino');
      assert.equal(ana.initials, 'AA');
      assert.equal(ana.bloodType, 'O+');
      assert.equal(ana.age, 45);
      assert.equal(ana.gkk, 'GKK San Isidro');
      assert.equal(ana.household, 'Aquino Family');
      assert.equal(ana.contact, '0917 555 0100');
    });

    test('filters by blood type', async () => {
      const res = await get('/api/reports/blood?type=A%2B');

      assert.equal(res.body.rows.length, 1);
      assert.equal(res.body.rows[0].name, 'Ben Aquino');
    });

    test('returns nothing for a type nobody has', async () => {
      const res = await get('/api/reports/blood?type=AB-');
      assert.deepEqual(res.body.rows, []);
    });
  });

  describe('GET /api/reports/sources', () => {
    test('lists the report builder options', async () => {
      const res = await get('/api/reports/sources');

      assert.deepEqual(res.body.sources, ['Members', 'Households']);
      assert.deepEqual(res.body.types.Members.types, ['By GKK', 'By Sacrament', 'By Ministry / Organization']);
      assert.deepEqual(res.body.types.Households.types, ['By Status', 'By GKK']);
    });
  });

  describe('POST /api/reports/generate', () => {
    const generate = (body) => server.request('/api/reports/generate', { method: 'POST', body, token });

    test('builds a member report, optionally scoped to one GKK', async () => {
      const all = await generate({ source: 'Members', type: 'By GKK', gkk: 'All' });

      assert.equal(all.status, 200);
      assert.equal(all.body.title, 'Members — By GKK');
      assert.equal(all.body.meta, '3 member(s)');
      assert.deepEqual(all.body.columns, ['Name', 'Household', 'GKK', 'Age', 'Relationship', 'Contact']);
      assert.equal(all.body.empty, false);

      const scoped = await generate({ source: 'Members', type: 'By GKK', gkk: 'GKK Sto. Niño' });
      assert.equal(scoped.body.rows.length, 1);
      assert.deepEqual(scoped.body.rows[0].cells.slice(0, 3), ['Carlos Bautista', 'Bautista, Jr. Family', 'GKK Sto. Niño']);
    });

    test('fills empty cells with an em dash rather than blanks', async () => {
      const res = await generate({ source: 'Members', type: 'By GKK', gkk: 'GKK Sto. Niño' });

      assert.equal(res.body.rows[0].cells.at(-1), '—', 'missing contact');
    });

    test('filters a member report by sacrament', async () => {
      const res = await generate({ source: 'Members', type: 'By Sacrament', sacrament: 'Confirmation' });

      assert.equal(res.body.rows.length, 1);
      assert.equal(res.body.rows[0].cells[0], 'Ana Aquino');
    });

    test('filters a member report by ministry or organization', async () => {
      const choir = await generate({ source: 'Members', type: 'By Ministry / Organization', group: 'Choir' });
      const youth = await generate({ source: 'Members', type: 'By Ministry / Organization', group: 'Youth Ministry' });

      assert.equal(choir.body.rows.length, 2);
      assert.equal(youth.body.rows.length, 1);
    });

    test('marks an empty result rather than erroring', async () => {
      const res = await generate({ source: 'Members', type: 'By Ministry / Organization', group: 'Nobody' });

      assert.equal(res.status, 200);
      assert.equal(res.body.empty, true);
      assert.deepEqual(res.body.rows, []);
      assert.equal(res.body.meta, '0 member(s)');
    });

    test('builds a household report and filters it by registration date', async () => {
      const all = await generate({ source: 'Households', type: 'By Status' });
      assert.equal(all.body.rows.length, 2);
      assert.deepEqual(all.body.columns, ['Household', 'GKK', 'Grouping', 'Status', 'Registered']);

      const future = await generate({ source: 'Households', type: 'By Status', dateFrom: '2999-01-01' });
      assert.equal(future.body.rows.length, 0);

      const past = await generate({ source: 'Households', type: 'By Status', dateTo: '2000-01-01' });
      assert.equal(past.body.rows.length, 0);
    });

    test('rejects an unknown source or type', async () => {
      for (const body of [
        { source: 'Ministries', type: 'By GKK' },
        { source: 'Members', type: 'By Blood Type' },
        {},
      ]) {
        const res = await generate(body);
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Unknown report');
      }
    });
  });

  describe('CSV exports', () => {
    test('members.csv is served as a download with one row per member', async () => {
      const res = await get('/api/exports/members.csv');

      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /text\/csv/);
      assert.match(res.headers.get('content-disposition'), /attachment; filename="members\.csv"/);

      const lines = res.body.trim().split('\n');
      const header = parseCsvLine(lines[0]);
      assert.equal(lines.length, 4, 'header + 3 members');
      assert.deepEqual(header.slice(0, 4), ['First Name', 'Middle Name', 'Last Name', 'Household']);

      const ana = lines.map(parseCsvLine).find((cells) => cells[0] === 'Ana');
      assert.equal(ana[header.indexOf('Age')], '45');
      assert.equal(ana[header.indexOf('Baptism')], 'Yes');
      assert.equal(ana[header.indexOf('Ministries')], 'Choir');
      assert.equal(ana[header.indexOf('Organizations')], 'Youth Ministry');
      assert.equal(ana[header.indexOf('Blood Type')], 'O+');

      const carlos = lines.map(parseCsvLine).find((cells) => cells[0] === 'Carlos');
      assert.equal(carlos[header.indexOf('Baptism')], 'No');
      assert.equal(carlos[header.indexOf('Blood Type')], '');
    });

    test('households.csv quotes a name containing a comma', async () => {
      const res = await get('/api/exports/households.csv');

      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-disposition'), /filename="households\.csv"/);
      assert.match(res.body, /"Bautista, Jr\. Family"/);

      const lines = res.body.trim().split('\n');
      const header = parseCsvLine(lines[0]);
      const bautista = lines.map(parseCsvLine).find((cells) => cells[0] === 'Bautista, Jr. Family');
      assert.equal(bautista[header.indexOf('Members')], '1');
      assert.equal(bautista[header.indexOf('Status')], 'Pending');
      assert.match(bautista[header.indexOf('Registered')], /^\d{4}-\d{2}-\d{2}$/);
    });

    test('blood.csv covers only members with a recorded blood type', async () => {
      const res = await get('/api/exports/blood.csv');

      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-disposition'), /filename="blood-directory\.csv"/);

      const lines = res.body.trim().split('\n');
      assert.equal(lines.length, 3, 'header + 2 members with a blood type');
      assert.deepEqual(parseCsvLine(lines[0]), ['Name', 'Blood Type', 'Age', 'GKK', 'Household', 'Contact']);
      assert.ok(!res.body.includes('Carlos'), 'a member without a blood type was exported');
    });

    test('generated.csv turns a built report into a download', async () => {
      const res = await server.request('/api/exports/generated.csv', {
        method: 'POST',
        token,
        body: {
          title: 'Members By GKK',
          columns: ['Name', 'GKK'],
          rows: [{ cells: ['Ana Aquino', 'GKK San Isidro'] }, { cells: ['Carlos Bautista', 'GKK Sto. Niño'] }],
        },
      });

      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-disposition'), /filename="members-by-gkk\.csv"/);
      assert.equal(res.body.trim(), 'Name,GKK\nAna Aquino,GKK San Isidro\nCarlos Bautista,GKK Sto. Niño');
    });

    test('generated.csv falls back to report.csv when no title is given', async () => {
      const res = await server.request('/api/exports/generated.csv', {
        method: 'POST',
        token,
        body: { columns: ['Name'], rows: [{ cells: ['Ana Aquino'] }] },
      });

      assert.match(res.headers.get('content-disposition'), /filename="report\.csv"/);
    });

    test('generated.csv rejects an empty request', async () => {
      const res = await server.request('/api/exports/generated.csv', { method: 'POST', token, body: {} });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Nothing to export');
    });

    test('generated.csv strips characters an HTTP header cannot carry, e.g. the em dash in a report title', async () => {
      // HTTP header values are Latin-1 only; every built-in report title contains
      // an em dash ("Members — By GKK"), so this is not a hypothetical input.
      const res = await server.request('/api/exports/generated.csv', {
        method: 'POST',
        token,
        body: { title: 'Members — By GKK', columns: ['Name'], rows: [{ cells: ['Ana Aquino'] }] },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-disposition'), 'attachment; filename="members-by-gkk.csv"');
      assert.equal(res.body.trim(), 'Name\nAna Aquino');
    });
  });
});
