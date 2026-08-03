# Playbook 5 — Ministries, organizations & parish config

The parish's own vocabulary: which GKKs exist, which ministries and
organizations people can belong to, and the parish's own details. Getting this
wrong quietly corrupts every record that references it, so the rename and delete
checks below matter more than they look.

- **URLs:** `/admin/ministries`, `/admin/organizations`, `/admin/settings`,
  `/admin/settings/ministries`, `/admin/settings/organizations`
- **Sign-in needed:** yes
- **Time:** 30 minutes
- **Prerequisite:** sample data loaded. Note the two levels: **Ministries** and
  **Organizations** in the main navigation are the *directories* (who is in
  each); the same names under **Settings** are the *management* screens (which
  ones exist).

---

## Directories

### GR-01 — Ministry rosters
**Steps**
1. Open **Ministries**.
2. Open the roster for **Choir**.

**Expected**
- Every ministry is listed with how many members belong to it.
- The counts add up to what the member records say — spot-check Choir by
  filtering the Members page by ministry Choir and comparing.
- Opening a ministry shows the people in it, each identifiable by name and
  household.
- A ministry nobody belongs to shows a "no members in this group yet" state, not
  a blank panel.

### GR-02 — Organization rosters
**Steps**
1. Open **Organizations** and check two rosters.

**Expected**
- Same behaviour as ministries.
- Organizations and ministries are kept separate — a member of *Youth Ministry*
  (an organization) does not appear under ministries, and vice versa.

### GR-03 — Scoping a roster to one GKK
**Steps**
1. On a directory page, scope the view to **GKK San Isidro**.
2. Then to a GKK with no members in that group.
3. Then back to **All**.

**Expected**
- Counts drop to the members in that GKK only.
- The scoped roster contains only members whose household is in that GKK.
- An empty scope shows the empty state.
- Returning to All restores the full counts.

---

## Managing the lists

> These checks change shared data. Use names beginning with `ZZ Test` so they
> are easy to spot and remove, and delete them when you are done.

### GR-04 — Adding a ministry
**Steps**
1. Go to **Settings → Ministries**.
2. Add `ZZ Test Ministry`.

**Expected**
- It appears in the list immediately, with a count of 0.
- It is now offered when editing a member's ministries (playbook 4, ME-12).
- It appears on the Ministries directory page with an empty roster.

### GR-05 — Adding a duplicate
**Steps**
1. Add `ZZ Test Ministry` a second time.

**Expected**
- The list still shows it once — no duplicate row.
- The app does not report a scary error for what is a harmless action, and
  nothing is lost.

### GR-06 — Adding with a blank name
**Steps**
1. Try to add a ministry with an empty name, then with only spaces.

**Expected**
- Both are refused with *Name is required* or similar.
- No blank row appears in the list.

### GR-07 — Renaming carries members with it
**Steps**
1. Assign a member to `ZZ Test Ministry` (playbook 4, ME-12).
2. Rename it to `ZZ Renamed Ministry`.
3. Reopen that member.

**Expected**
- The member now shows `ZZ Renamed Ministry`; the old name appears nowhere.
- The roster and count follow the new name.
- **Any other groups that member belongs to are untouched.** Check a member with
  two ministries before and after — this is the easiest thing for a rename to
  break.

### GR-08 — Deleting a group that is in use
**Steps**
1. With a member still assigned to `ZZ Renamed Ministry`, try to delete it.

**Expected**
- The deletion is refused with a message along the lines of *Members are
  assigned to this item and it cannot be deleted*.
- The group is still in the list afterwards — reload to be sure.
- The member's record is untouched.

### GR-09 — Deleting a group nobody uses
**Steps**
1. Remove the member from `ZZ Renamed Ministry`.
2. Delete the group.

**Expected**
- It is removed from the list.
- It is no longer offered when editing a member.
- It is gone from the Ministries directory page.

### GR-10 — Organizations behave identically
**Steps**
1. Repeat GR-04 through GR-09 under **Settings → Organizations** with
   `ZZ Test Org`.

**Expected**
- Every behaviour matches the ministry screens. Differences between the two are
  worth reporting even if each screen works on its own.

---

## GKKs

### GR-11 — Adding a GKK
**Steps**
1. Go to **Parish Config**.
2. Add `ZZ Test GKK`.

**Expected**
- It appears in the GKK list with a household count of 0.
- It is now offered in the GKK filters on Households and Members, and when
  editing a household.
- With no GKKs at all, the screen says so rather than showing an empty box.

### GR-12 — Renaming a GKK carries households with it
**Steps**
1. Assign a household to `ZZ Test GKK` (playbook 3, HH-11).
2. Rename it to `ZZ Renamed GKK`.

**Expected**
- The household now shows the new name in the list and in its edit view.
- The GKK filter finds it under the new name and not under the old one.
- The Dashboard and Reports GKK breakdowns use the new name.

### GR-13 — Deleting a GKK that is in use
**Steps**
1. With a household still assigned, try to delete `ZZ Renamed GKK`.

**Expected**
- Refused, with a message such as *This GKK is assigned to a household and
  cannot be deleted*.
- The GKK and the household are both unchanged.

### GR-14 — Deleting an unused GKK
**Steps**
1. Move the household to another GKK, then delete `ZZ Renamed GKK`.

**Expected**
- It disappears from the list and from every GKK filter.
- No household is left pointing at a GKK that no longer exists — check the
  household you moved.

---

## Parish profile

### GR-15 — Editing the parish profile
**Steps**
1. In Parish Config, change the parish name, address, contact and email. Save.
2. Reload.

**Expected**
- A confirmation appears and the values survive the reload.
- The new parish name shows at the top of the sidebar and on the printed
  household sheet (playbook 3, HH-09).
- Restore the original values when you are done.

### GR-16 — Parish logo
**Steps**
1. Upload a small image as the parish logo. Save.
2. Reload, then remove the logo.

**Expected**
- The logo appears in the sidebar in place of the cross icon.
- It survives a reload.
- Removing it brings the default icon back.
- A very large image is either rejected with a clear message or handled without
  freezing the page — note which happens.
- A non-image file is rejected with a message, not silently accepted.

### GR-17 — Changing your password
**Steps**
1. Use **Change password** with a wrong current password.
2. Try a new password shorter than 10 characters.
3. Try re-using the current password as the new one.
4. Enter mismatched values in *New password* and *Confirm new password*.
5. Do it correctly.

**Expected**
- Wrong current password — *Current password is incorrect*.
- Short password — a message stating the 10-character minimum.
- Same as current — refused with an explanation.
- Mismatched confirmation — refused before anything is sent.
- On success, a confirmation appears.
- **Sign out and back in with the new password** — this is the check that
  matters. The old password must no longer work.

> Tell the rest of the beta group before you change the shared demo account's
> password, and write the new one in the run log.

---

## Sign-off

| ID | Check | Result |
|---|---|---|
| GR-01 | Ministry rosters | |
| GR-02 | Organization rosters | |
| GR-03 | GKK scoping | |
| GR-04 | Add a ministry | |
| GR-05 | Duplicate name | |
| GR-06 | Blank name refused | |
| GR-07 | Rename carries members | |
| GR-08 | Delete refused while in use | |
| GR-09 | Delete when unused | |
| GR-10 | Organizations identical | |
| GR-11 | Add a GKK | |
| GR-12 | Rename carries households | |
| GR-13 | GKK delete refused while in use | |
| GR-14 | GKK delete when unused | |
| GR-15 | Parish profile | |
| GR-16 | Parish logo | |
| GR-17 | Change password | |

Browser / version: ____________  Device / width: ____________  Tester: ____________

**Clean-up:** confirm no `ZZ Test` / `ZZ Renamed` entries remain in any list
before you close this playbook.
