import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ACTIVITY_AREAS, describeActivity, activityActor } from '../src/lib/activity.js';

// The staff actions the log gained in 0102, as the database writes them.
describe('describeActivity: census, GKK and integration actions (0102)', () => {
  test('approving or rejecting a family’s online update', () => {
    assert.deepEqual(
      describeActivity({ action: 'update', table_name: 'census_submissions', changes: { status: ['Pending', 'Approved'] } }),
      { title: 'Approved the online census update', lines: [] },
    );
    assert.deepEqual(
      describeActivity({ action: 'update', table_name: 'census_submissions', changes: { status: ['Pending', 'Rejected'], review_note: 'Not our household' } }),
      { title: 'Rejected the online census update', lines: ['Note: Not our household'] },
    );
  });

  test('a renewed census code says so and carries no code', () => {
    const d = describeActivity({ action: 'update', table_name: 'household_access_codes', changes: { code_renewed: true } });
    assert.deepEqual(d, { title: 'Renewed the census access code', lines: [] });
  });

  test('last-year list edits say how many households, and name a single one', () => {
    const list = (action, changes) => describeActivity({ action, table_name: 'census_last_year_list', label: 'GKK San Isidro', changes });
    assert.equal(list('insert', { count: 25 }).title, 'Added 25 households to last year’s list');
    assert.equal(list('insert', { count: 1, household: 'Juan dela Cruz' }).title, 'Added “Juan dela Cruz” to last year’s list');
    assert.equal(list('delete', { count: 40 }).title, 'Removed 40 households from last year’s list');
    assert.equal(list('delete', { count: 1, household: 'Maria Santos' }).title, 'Removed “Maria Santos” from last year’s list');
    assert.deepEqual(
      list('update', { count: 1, household: 'Juan dela Cruz', status: ['Not yet', 'Registered'] }),
      { title: 'Updated “Juan dela Cruz” on last year’s list', lines: ['Status: Not yet → Registered'] },
    );
    assert.deepEqual(
      list('update', { count: 3, status: ['Not yet', 'Moved away'] }),
      { title: 'Updated 3 households on last year’s list', lines: ['Status: Not yet → Moved away'] },
    );
    assert.deepEqual(
      list('update', { count: 1, household: 'Juan D. Cruz', head_name: ['Juan dela Cruz', 'Juan D. Cruz'], purok: [null, 'Purok 4'] }).lines,
      ['Head: Juan dela Cruz → Juan D. Cruz', 'Purok: — → Purok 4'],
    );
  });

  test('a GKK document names the GKK, its type and the file', () => {
    const changes = { gkk: 'GKK San Isidro', kind: 'Land title', file: 'title.pdf' };
    assert.deepEqual(
      describeActivity({ action: 'insert', table_name: 'gkk_documents', label: 'Chapel lot', changes }),
      { title: 'Uploaded the GKK document', lines: ['GKK: GKK San Isidro', 'Type: Land title', 'File: title.pdf'] },
    );
    assert.equal(describeActivity({ action: 'delete', table_name: 'gkk_documents', changes }).title, 'Deleted the GKK document');
  });

  test('a donor contact shows the donor, the status and the note', () => {
    const c = (action, changes) => describeActivity({ action, table_name: 'blood_request_contacts', label: 'BR-2026-1 · Ana', changes });
    assert.deepEqual(
      c('insert', { donor: 'Dina Donor', status: 'Contacted', note: 'Can come Saturday' }),
      { title: 'Logged a donor contact', lines: ['Donor: Dina Donor', 'Status: Contacted', 'Note: Can come Saturday'] },
    );
    assert.deepEqual(
      c('update', { donor: 'Dina Donor', status: ['Contacted', 'Agreed'] }),
      { title: 'Changed a donor contact', lines: ['Donor: Dina Donor', 'Status: Contacted → Agreed'] },
    );
    assert.equal(c('delete', { donor: 'Dina Donor', status: 'Agreed' }).title, 'Cleared a donor contact');
  });

  test('photo storage changes show the bucket and address, and only say a key changed', () => {
    const s = (action, changes) => describeActivity({ action, table_name: 'media_storage_settings', label: 'Photo storage (Cloudflare R2)', changes });
    assert.deepEqual(
      s('update', { bucket: ['photos', 'parish-photos'], secret_access_key_changed: true, access_key_id_changed: true }),
      { title: 'Changed the photo storage settings', lines: ['Bucket: photos → parish-photos', 'Access key changed', 'Secret key changed'] },
    );
    assert.deepEqual(
      s('update', { public_base_url: ['https://a.example', 'https://b.example'], account_id_changed: true }).lines,
      ['Public URL: https://a.example → https://b.example', 'Account ID changed'],
    );
    assert.equal(s('insert', { bucket: [null, 'photos'] }).title, 'Set up the photo storage');
    assert.deepEqual(s('delete', null), { title: 'Cleared the photo storage settings', lines: [] });
    assert.ok(!JSON.stringify(s('update', { secret_access_key_changed: true })).match(/secret_access_key"|sekret/i), 'a key is never shown');
  });

  test('a restore from the Trash reads plainly for every kind', () => {
    for (const [table, noun] of [
      ['certificate_requests', 'certificate request'], ['sacrament_requests', 'sacrament request'], ['prayer_requests', 'prayer request'],
      ['blood_requests', 'blood request'], ['blood_donors', 'blood donor'], ['announcements', 'announcement'], ['events', 'event'],
      ['articles', 'article'], ['bulletins', 'bulletin'], ['history_articles', 'history page'], ['songs', 'song'],
    ]) {
      assert.equal(describeActivity({ action: 'restore', table_name: table }).title, `Restored the ${noun} from the trash`, table);
    }
    assert.equal(describeActivity({ action: 'restore', table_name: 'members' }).title, 'Restored the member from the trash', 'households and members as before');
  });

  test('every new table is under a filter the Activity log offers', () => {
    const area = (table) => ACTIVITY_AREAS.find(([, , tables]) => tables.includes(table))?.[0];
    assert.equal(area('census_submissions'), 'census');
    assert.equal(area('household_access_codes'), 'census');
    assert.equal(area('census_last_year_list'), 'census');
    assert.equal(area('gkk_documents'), 'settings');
    assert.equal(area('media_storage_settings'), 'settings');
    assert.equal(area('blood_request_contacts'), 'requests');
    assert.equal(area('prayer_requests'), 'requests');
  });

  test('these are staff actions, never the family’s', () => {
    assert.equal(activityActor({ table_name: 'census_submissions', actor_name: 'Ana Reyes' }), 'Ana Reyes');
  });
});
