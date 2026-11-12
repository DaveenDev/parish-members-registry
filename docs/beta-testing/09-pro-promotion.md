# Playbook 9 — PRO notes in the admin panel

The quiet PRO tip cards, the monthly showcase and the PRO modules page. They
are for staff only and must never be in the way.

- **Sign-in needed:** yes, as Full access, then as the other access levels
- **Time:** 25 minutes
- **Prerequisite:** a site built with `VITE_PRO_PROMO=on` (the demo site; without it nothing below shows, which is itself the first check), an account at least 21 days old (or the shared Demo login,
  which skips the wait), and migration 0124 run. A newer account should see
  nothing at all.

Cards wait about 4 seconds after a page opens. The showcase waits about 2.

---

### PROMO-B0 — Off means off
**Steps**
1. On a site built *without* `VITE_PRO_PROMO` (or with it set to `off`), sign in as Full access and open the Dashboard, Requests and Settings.

**Expected**
- No tip card, no showcase and no **PRO modules** in Settings. Opening `/admin/pro` goes back to the Dashboard.

### PROMO-B1 — A drawer opens while a card is showing
**Steps**
1. Open **Requests**. Wait for the PRO tip card.
2. Open any other panel, for example press **Ctrl K**.

**Expected**
- The card goes away at once and does not come back on that page.

### PROMO-B2 — Phone width
**Steps**
1. At 390 px wide, open **Sacraments** and wait.
2. Open the Dashboard on an account whose showcase is due.

**Expected**
- The card sits at the bottom of the page and covers nothing.
- The showcase is a bottom sheet that scrolls.

### PROMO-B3 — Hiding follows the account
**Steps**
1. Hide the showcase on the office computer (**Remind me in a month**).
2. Open the Dashboard on the same account on a phone.

**Expected**
- It does not show on the phone.

### PROMO-B4 — Demo login on two browsers
**Steps**
1. Press **Login to Demo Site** in two browsers and hide the showcase in one.

**Expected**
- It still shows in the other.

### PROMO-B5 — Printing
**Steps**
1. With a card on screen, print a household sheet and a report.

**Expected**
- Neither the card nor the showcase prints.

### PROMO-B6 — Never for the public
**Steps**
1. Visit the public website, `/register` and `/census`, signed in and not.

**Expected**
- No PRO card or showcase anywhere.

### PROMO-B7 — Dark mode and two colour themes
**Steps**
1. Switch the admin panel to dark mode, then to two accent colours.

**Expected**
- The card, the showcase and the PRO modules page are readable in all of them.

### PROMO-B8 — Who sees what
**Steps**
1. Sign in as Read only, then GKK leader, then Website & requests, then Clergy.

**Expected**
- Read only and GKK leader: no cards, no showcase and no **PRO modules** in Settings.
- Website & requests: a card only on the Requests pages.
- Clergy: cards and the showcase.

### PROMO-B9 — Don't show PRO tips
**Steps**
1. Open **Settings → PRO modules** and press **Don't show PRO tips**.
2. Visit Requests and Reports.

**Expected**
- No cards. The monthly showcase can still show.
