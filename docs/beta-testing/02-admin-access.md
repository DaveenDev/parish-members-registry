# Playbook 2 — Admin access & navigation

Signing in, staying signed in, getting around, and signing out. Everything a
parish secretary does before the actual work starts.

- **URL:** `/admin/login`
- **Sign-in needed:** a staff account
- **Time:** 20 minutes
- **Prerequisite:** sample data loaded (`npm run db:demo`) so the screens are not
  all empty

---

## Signing in

### AA-01 — The sign-in page
**Steps**
1. Open `/admin/login`.

**Expected**
- Parish name and *Members Registry · Admin*.
- Email and password fields, a **Remember me** box, a **Forgot password?**
  link, and a **Sign in** button.
- Nothing on this page reveals parish data.
- On a phone the card fits the screen without horizontal scrolling.

> **Note for beta builds:** the fields arrive pre-filled with the demo account.
> That is a convenience for testing and must be removed before the parish goes
> live — if it is still there in a release candidate, file it as **S2**.

### AA-02 — A wrong password is refused clearly
**Steps**
1. Enter the correct email and a wrong password. Sign in.
2. Enter an email that does not exist, with any password. Sign in.

**Expected**
- Both attempts show *Invalid email or password* near the button.
- **The two messages are identical.** If the app says "no such account" for one
  and "wrong password" for the other, that tells an outsider which parish staff
  emails exist — file it as **S2**.
- The password field is not silently cleared with no explanation.
- You stay on the sign-in page.

### AA-03 — Empty fields
**Steps**
1. Clear both fields and click **Sign in**.

**Expected**
- A message telling you what is missing; no blank screen, no crash.

### AA-04 — Signing in works
**Steps**
1. Enter valid credentials and sign in.

**Expected**
- The button shows *Signing in…* while it works.
- You land on the Dashboard.
- Your name and role appear at the bottom of the sidebar (or in the drawer on a
  phone).

### AA-05 — Too many failed attempts
**Steps**
1. Sign out. Attempt to sign in with a wrong password more than ten times in a
   row. (Only worth doing if you are specifically testing this.)

**Expected**
- After the tenth failure, the app says *Too many requests — please try again
  shortly.* instead of continuing to accept attempts.
- Waiting fifteen minutes, or trying from another device, works again.
- Note: successful sign-ins do not count towards this limit, so a busy office
  is never locked out by ordinary use — confirm by signing in correctly several
  times in a row first.

### AA-06 — Forgot password
**Steps**
1. Click **Forgot password?**.

**Expected**
- An explanation appears: there is no automated reset; another staff member can
  set a new password from **Parish Config → Change password**.
- Clicking it again hides the note.
- No email is sent and nothing pretends one was.

---

## Staying signed in

### AA-07 — The session survives a reload
**Steps**
1. Signed in, reload the page.
2. Open `/admin/members` directly in the address bar.

**Expected**
- You stay signed in both times; you are not sent back to the sign-in page.
- There is no visible flash of the sign-in page before the admin panel appears.

### AA-08 — The session survives closing the tab
**Steps**
1. Close the browser tab, then open the admin URL again.

**Expected**
- You are still signed in.
- Note: this happens regardless of the **Remember me** box in the current build.
  If the parish expects that box to control whether the session persists, file
  it as **S3** with the observed behaviour.

### AA-09 — A broken session is handled gracefully
**Steps**
1. Open your browser's developer tools → Application/Storage → Local Storage.
2. Change the value of `pmr_token` to `broken`.
3. Reload the admin panel.

**Expected**
- You are returned to the sign-in page.
- No error page, no blank screen, no console-only failure.
- Signing in again works normally.

### AA-10 — Signing out
**Steps**
1. Use the sign-out button at the bottom of the sidebar.
2. Then press the browser **Back** button.

**Expected**
- You land on the sign-in page.
- Back does **not** show the admin panel again with data still on screen.
- Reloading after sign-out keeps you signed out.

---

## Getting around

### AA-11 — Every navigation item works
**Steps**
1. Visit each item in turn: Dashboard, Households, Members, Sacraments,
   Organizations, Ministries, Reports, Exports; then under Settings:
   Parish Config, Ministries, Organizations.

**Expected**
- Each page loads with its own title and subtitle.
- The item you are on is highlighted in the sidebar, and only that one.
- No page shows a spinner that never resolves.
- The two Settings items (Ministries, Organizations) are the *management*
  screens and are clearly distinguishable from the directory pages of the same
  name higher up.

### AA-12 — The browser Back button behaves
**Steps**
1. Go Dashboard → Households → Members → Reports.
2. Press Back three times, then Forward twice.

**Expected**
- Each press moves one page, in the expected order.
- The sidebar highlight follows along.
- Filters and search you had set are not carried onto an unrelated page.

### AA-13 — The mobile drawer
**Steps**
1. Narrow the window below 1024 px (or use a phone).
2. Tap the menu button in the top bar.
3. Tap a navigation item.
4. Open it again and press **Escape**; open it again and tap outside it.

**Expected**
- Below 1024 px the sidebar is hidden and a menu button appears with the parish
  name beside it.
- The drawer slides in over the page with a dimmed background.
- Choosing an item navigates **and** closes the drawer.
- Escape closes it. Tapping the dimmed area closes it.
- At 1024 px and above, the sidebar is permanently visible and there is no menu
  button.

### AA-14 — Parish identity is shown
**Steps**
1. Look at the top of the sidebar.

**Expected**
- The parish name from Parish Config appears, not a hard-coded placeholder.
- If a logo has been uploaded, it appears; if not, a cross icon does.
- A long parish name truncates neatly rather than breaking the layout.

### AA-15 — Theme picker in the admin panel
**Steps**
1. Open the theme control near the bottom of the sidebar and change theme.
2. Navigate to two other pages, then reload.

**Expected**
- The theme applies across the admin panel and the public portal alike.
- It survives navigation and reload.
- In every theme, the sidebar text stays readable against its background, and
  status pills (Verified / Pending) stay distinguishable.

### AA-16 — Deep links
**Steps**
1. Copy the URL of the Members page.
2. Sign out, paste it into the address bar, then sign in.

**Expected**
- You are sent to the sign-in page rather than seeing member data.
- Signing in lands you in the admin panel without an error.
- (If it returns you to the Dashboard rather than the page you asked for, that
  is a usability note, **S4**, not a defect.)

---

## Sign-off

| ID | Check | Result |
|---|---|---|
| AA-01 | Sign-in page | |
| AA-02 | Identical failure messages | |
| AA-03 | Empty credentials | |
| AA-04 | Successful sign-in | |
| AA-05 | Failed-attempt limit | |
| AA-06 | Forgot password note | |
| AA-07 | Session survives reload | |
| AA-08 | Session survives tab close | |
| AA-09 | Broken token recovery | |
| AA-10 | Sign out and Back | |
| AA-11 | All navigation items | |
| AA-12 | Browser history | |
| AA-13 | Mobile drawer | |
| AA-14 | Parish name and logo | |
| AA-15 | Theme picker | |
| AA-16 | Deep links | |

Browser / version: ____________  Device / width: ____________  Tester: ____________
