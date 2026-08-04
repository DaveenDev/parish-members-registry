# Playbook 7 — Cross-cutting checks

Everything that is not one screen: layout on small devices, keyboard and screen
reader access, colour themes, printing, behaviour when the network misbehaves,
and the checks that protect one family's data from another.

Run this once per browser/device combination. It is the playbook most likely to
find something the others miss.

- **Sign-in needed:** yes, for most of it
- **Time:** 40 minutes
- **Prerequisite:** sample data loaded

---

## Responsive layout

### CC-01 — The five widths
**Steps**
For each width — 360, 390, 768, 1024, 1440 px — visit: the public landing page,
each step of the registration wizard, the Dashboard, Households, Members,
Reports and Parish Config.

**Expected**
- **No horizontal scrolling** on any page at any width. This is the single most
  common defect; check by scrolling right on every page.
- No text is cut off, clipped, or overlapping another element.
- Buttons and links are large enough to tap on a phone and not crowded together.
- Tables either fit, scroll inside their own area, or collapse into cards —
  they never force the whole page wider than the screen.
- The fixed Back/Continue bar in the wizard never covers the field you are
  typing in.

### CC-02 — The admin sidebar threshold
**Steps**
1. Slowly narrow the window from 1440 px to 360 px on an admin page.

**Expected**
- The sidebar becomes a drawer at 1024 px, with a menu button appearing in a top
  bar at the same moment.
- There is no width where both are visible, and none where neither is.
- Nothing is left half-transformed mid-resize.

### CC-03 — Orientation change
**Steps**
1. On a phone or tablet, rotate to landscape and back on the wizard and on the
   Members page.

**Expected**
- The layout adapts; nothing is lost.
- Anything you had typed is still there.
- If a dialog was open, it is still usable after rotating.

### CC-04 — Zoom
**Steps**
1. Set the browser zoom to 200% on the Households page and on the wizard.

**Expected**
- The layout reflows rather than clipping.
- All controls remain reachable — nothing ends up off-screen with no way to
  scroll to it.

---

## Keyboard and screen reader

### CC-05 — Keyboard-only registration
**Steps**
1. Using only Tab, Shift+Tab, arrow keys, Space and Enter, complete a
   registration from the landing page to the confirmation screen.

**Expected**
- Every control can be reached in a sensible order.
- The focused element is always visibly outlined — you can always tell where you
  are.
- Dropdowns and checkboxes work with the keyboard.
- Enter submits from within the form rather than doing nothing.
- You never get stuck in a loop or trapped in one component.

### CC-06 — Keyboard-only admin
**Steps**
1. Sign in with the keyboard only.
2. Reach the Members page, open a member, edit a field, save, and close.

**Expected**
- Sign-in works with Tab and Enter.
- Navigation items are reachable and activate with Enter.
- Opening a member moves focus into the dialog.
- **Escape closes the dialog**, and focus returns to where it was.
- While a dialog is open, Tab does not wander onto the page behind it.

### CC-07 — Labels and announcements
**Steps**
1. With a screen reader (VoiceOver, NVDA or TalkBack), move through the
   registration wizard and the Households page.

**Expected**
- Every input announces a label — not "edit text, blank".
- Required fields are announced as required.
- Validation errors are announced when they appear, not left silent.
- Buttons announce what they do; an icon-only button such as sign-out announces
  a name rather than "button".
- The step indicator conveys which step you are on.

### CC-08 — Colour is not the only signal
**Steps**
1. Look at the Verified/Pending pills and the validation errors.
2. If you can, enable a greyscale filter in your operating system.

**Expected**
- Verified and Pending are distinguishable without colour — by their text.
- Field errors have a message, not just a red border.
- Charts remain interpretable — each bar or segment carries a label or value.

### CC-09 — Contrast in every theme
**Steps**
1. Cycle through all eight themes on the landing page, the wizard, the sign-in
   page and the admin sidebar.

**Expected**
- Body text, muted helper text and sidebar text stay comfortably readable in
  every theme.
- Buttons remain legible against their background.
- Nothing becomes invisible — pay attention to the small grey helper text and
  to white text on light theme accents.

---

## Printing

### CC-10 — What prints
**Steps**
1. Print-preview the registration confirmation and a household sheet.

**Expected**
- Only the content prints — no sidebar, no filters, no buttons.
- Nothing runs off the right edge on A4 and on Letter.
- Text is black on white; no dark background floods the page.
- Multi-page output breaks between records, not through the middle of a member.

---

## Network and error handling

### CC-11 — Slow network
**Steps**
1. In DevTools → Network, set throttling to *Slow 3G*.
2. Load the Members page and run a search.

**Expected**
- A loading indicator appears — the screen is never blank with no explanation.
- Nothing renders half-loaded and then jumps.
- Search results that arrive out of order do not leave the wrong rows on screen:
  type `dela`, then quickly change it to `reyes`, and confirm the final list
  matches `reyes`.

### CC-12 — Offline
**Steps**
1. Go offline (DevTools → Network → Offline, or airplane mode).
2. Try to load the Members page, then to save a member edit.

**Expected**
- A clear, plain-language error message.
- No blank white screen, no raw technical error, no infinite spinner.
- Coming back online and retrying works, without a reload being required.

### CC-13 — The API is down
**Steps**
1. Stop the API server (`Ctrl+C` in the terminal running it) while the browser
   stays open.
2. Navigate around the admin panel.
3. Restart the server and retry.

**Expected**
- Each page reports that it could not load data, ideally with a retry.
- The app shell stays usable — the navigation still works.
- After the server returns, retrying succeeds without signing in again.

### CC-14 — An expired session mid-task
**Steps**
1. In DevTools → Application → Local Storage, delete `pmr_token`.
2. Without reloading, try to save a member edit.

**Expected**
- You are told the session is no longer valid and sent to sign in.
- The app does not silently swallow the failure and pretend the save worked.
  Confirm afterwards that the edit really was not applied.

### CC-15 — Double submission
**Steps**
1. On the registration confirm dialog, click **Yes, submit registration** and
   then immediately click again.
2. In the admin panel, double-click a save button.

**Expected**
- Buttons disable themselves while the request is in flight.
- Exactly one household is created; exactly one save happens. Check the
  households list for a duplicate.

---

## Data protection

### CC-16 — Nothing leaks to the public portal
**Steps**
1. Sign out. Open the public landing page and start the wizard.

**Expected**
- No parishioner names, households or counts appear anywhere on the public side.
- The wizard starts empty even though other people have registered.

### CC-17 — Signed-out access to admin pages
**Steps**
1. Signed out, try each of these directly in the address bar:
   `/admin`, `/admin/households`, `/admin/members`, `/admin/reports`,
   `/admin/settings`.

**Expected**
- Every one redirects to the sign-in page.
- No data appears, not even briefly.

### CC-18 — One browser, two sessions
**Steps**
1. Sign in normally in one window and open a private/incognito window.
2. In the private window, open `/admin`.

**Expected**
- The private window is signed out and asks for credentials.
- Signing in there does not disturb the first window.

### CC-19 — Text stays text
**Steps**
1. Create a member with the last name `<b>Test</b>` and another with
   `<script>alert(1)</script>`.
2. Look at them on the Members page, in the household expansion, on the print
   sheet, in reports and in the CSV export.

**Expected**
- Both display as the literal text that was typed, everywhere.
- No bold rendering, and above all **no alert box**. Either would be **S1**.

### CC-20 — Draft privacy on a shared device
**Steps**
1. Start a registration on the public portal and fill in two members, but do not
   submit.
2. Close the tab and reopen the site — the draft returns (this is intended).
3. Complete or abandon it: submit, or use **Register another household** from a
   fresh start.

**Expected**
- The draft returns for whoever uses that browser next, which is intended for
  one family but is a real consideration on a shared parish tablet.
- After submitting, the draft is gone (playbook 1, PR-22).
- Note in the run log whether the parish needs a "clear this form" control for
  shared devices — that is a product decision, not a defect.

---

## Sign-off

| ID | Check | Result |
|---|---|---|
| CC-01 | Five widths, no horizontal scroll | |
| CC-02 | Sidebar threshold | |
| CC-03 | Orientation change | |
| CC-04 | 200% zoom | |
| CC-05 | Keyboard registration | |
| CC-06 | Keyboard admin & dialogs | |
| CC-07 | Labels & announcements | |
| CC-08 | Not colour alone | |
| CC-09 | Contrast in all themes | |
| CC-10 | Printing | |
| CC-11 | Slow network | |
| CC-12 | Offline | |
| CC-13 | API down | |
| CC-14 | Expired session | |
| CC-15 | Double submission | |
| CC-16 | Nothing leaks publicly | |
| CC-17 | Signed-out admin URLs | |
| CC-18 | Two sessions | |
| CC-19 | Text stays text | |
| CC-20 | Draft privacy | |

Browser / version: ____________  Device / OS: ____________  Assistive tech: ____________

Tester: ____________  Date: ____________
