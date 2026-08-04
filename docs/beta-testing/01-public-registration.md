# Playbook 1 — Public registration

**The parishioner's view.** This is the one screen strangers will use, often on a
phone, often once, often with a queue behind them. Test it that way: do not
maximise the window, do not slow down to read carefully the first time through.

- **URL:** the beta site root, e.g. <http://localhost:5173/>
- **Sign-in needed:** none
- **Time:** 30–40 minutes
- **Prerequisite:** none — but tell whoever manages the beta database that you
  are about to add records

> Run PR-01 to PR-09 on a phone-sized window first, then repeat PR-05 to PR-16
> on a desktop width.

---

## Landing

### PR-01 — The landing page explains itself
**Steps**
1. Open the site root in a fresh tab.

**Expected**
- Parish name and "Parish Members Registry" are visible without scrolling.
- One obvious button: **Register Your Household**.
- A note that the information is private and seen only by parish staff.
- A link at the bottom for staff: *Parish staff? Sign in to the admin panel →*.
- Nothing looks broken while the page settles — no flash of unstyled text, no
  layout jump after a second.

### PR-02 — The theme picker works and sticks
**Steps**
1. Use the theme control in the top-right corner.
2. Choose a different colour theme.
3. Reload the page.

**Expected**
- The picker opens on click and closes on a second click, on **Escape**, and on
  a click outside it.
- Colours change immediately across the page.
- After reload, the chosen theme is still applied.
- Text stays readable in every theme — check the small grey text under the
  button in particular.

### PR-03 — Starting the wizard
**Steps**
1. Click **Register Your Household**.

**Expected**
- Step 1 of 5 opens, with the step name **Household** highlighted.
- The progress bar is one-fifth full.
- The page is scrolled to the top.

---

## Step 1 — Household

### PR-04 — Required fields are enforced
**Steps**
1. On the empty Household step, click **Continue →**.

**Expected**
- The page scrolls back to the top and a red banner appears:
  *Please complete the highlighted household fields.*
- A short toast appears near the bottom with the same message and fades away.
- Every required field — family name, street, barangay, city, province, ZIP —
  is marked with its own error message.
- Optional fields (contact, email, GKK, family grouping) are **not** flagged.
- You are still on step 1.

### PR-05 — Errors clear as you type
**Steps**
1. With the errors from PR-04 showing, type into the family name field.

**Expected**
- That field's error disappears as soon as you type — you do not have to press
  Continue again to see it clear.
- The red banner at the top disappears too.
- The other fields keep their errors.

### PR-06 — Email is checked, but only if provided
**Steps**
1. Fill in all six required fields.
2. Leave the household email empty and click **Continue →**.
3. Come back, type `not-an-email` in the household email, click **Continue →**.
4. Correct it to a valid address and continue.

**Expected**
- Step 2 with the email empty — an empty optional field must not block anyone.
- *Enter a valid email* on the malformed address, and you stay on step 1.
- Continuing works once corrected.

### PR-07 — Filipino addresses fit
**Steps**
1. Enter a long, realistic address, e.g. street `Purok 3, Blk 14 Lot 22, Sitio
   Mahayahay`, barangay `Poblacion (Mua-an)`, city `Kidapawan City`.
2. Enter a ZIP with a leading zero, e.g. `09400`.

**Expected**
- No field truncates what you typed or silently drops characters.
- The ZIP field accepts the leading zero and keeps it.
- On a phone, the ZIP field brings up a numeric keypad.
- Long values wrap or scroll inside the field; they do not push the layout wider
  than the screen.

---

## Step 2 — Members

### PR-08 — The first member is required
**Steps**
1. On the Members step, click **Continue →** without filling anything.

**Expected**
- Banner: *Please complete the required member details.*
- First name, last name, relationship, sex, date of birth and civil status are
  each flagged.
- Middle name, place of birth, contact, email, occupation, religion and blood
  type are not.
- Religion is pre-set to **Roman Catholic**.
- Blood type offers *Unknown / prefer not to say*.

### PR-09 — Adding and removing members
**Steps**
1. Fill in the first member fully.
2. Click **Add Another Member**, fill in a second person.
3. Add a third, then remove the second using its **Remove** button.

**Expected**
- The counter at the top of the step updates each time ("2 member(s) added so
  far", then 3, then 2).
- Each member card is numbered and shows the person's name in its heading as
  soon as you type it; before that it reads "Member 2".
- **Remove** is not offered when only one member remains.
- Removing the second member leaves the first and third intact, with their data
  unchanged, and the numbering closes up.
- A toast confirms *Member added* / *Member removed*.

### PR-10 — Per-member validation points at the right person
**Steps**
1. With three members, clear the **last name** of the second one.
2. Click **Continue →**.

**Expected**
- Only member 2 shows the error, on the last-name field.
- Members 1 and 3 show no errors.
- The banner appears once at the top, not once per member.

### PR-11 — A large household
**Steps**
1. Add members until you have eight or more.
2. Scroll through the step.

**Expected**
- The page stays usable — no lag when typing in the last card.
- The sticky step header and the fixed Back/Continue bar stay put and do not
  cover the field you are typing in.
- On a phone, the on-screen keyboard does not hide the field you are editing.

---

## Step 3 — Sacraments

### PR-12 — Sacrament details appear only when ticked
**Steps**
1. Continue to the Sacraments step.
2. Tick **Baptism** for member 1.
3. Tick **Confirmation**, then **Matrimony**.
4. Untick **Baptism** again.

**Expected**
- Date and church fields appear under each sacrament only after it is ticked.
- Confirmation additionally offers *Confirmation name* and *Sponsor*.
- Matrimony additionally offers a type: *Catholic* or *Convalidation*.
- Unticking hides the fields again.
- Nothing here is required — you can continue with nothing ticked.

### PR-13 — Sacrament details survive the trip
**Steps**
1. Tick Baptism for member 1 and fill in a date and church.
2. Go **← Back** to Members, then **Continue →** to return.

**Expected**
- The tick and both values are still there, unchanged.
- The date you typed is the date shown — not a day earlier or later.

---

## Step 4 — Engagement and consent

### PR-14 — Consent is required to continue
**Steps**
1. On the Engagement step, leave the consent box unticked and click
   **Continue →**.
2. Tick it and continue.

**Expected**
- Banner: *Data privacy consent is required to continue.* You stay on step 4.
- The consent box is visually distinct from the optional email-list box —
  it is marked required and changes appearance when ticked.
- The volunteer question is optional; leaving it as *Select…* does not block you.
- With consent ticked, you reach step 5.

---

## Step 5 — Review and submit

### PR-15 — The review shows what you actually entered
**Steps**
1. Read every line of the review page against what you typed.

**Expected**
- Household block: family name, full address in one line, GKK, grouping,
  contact, email. Anything left blank shows `—`, not "undefined" or an empty gap.
- Members block: the heading counts the members, and each person shows name,
  relationship, sex, civil status, date of birth and blood type.
- Dates are shown in a readable form (e.g. *Jun 14, 1981*) and match what you
  entered — check one date against the form carefully.
- Sacraments are listed per member; members with none show *No sacraments
  recorded*.
- Engagement block shows the volunteer answer, email-list choice, and
  *Privacy consent: Granted*.

### PR-16 — Edit links go to the right step
**Steps**
1. Use **Edit** on the Household block; change the city; return to review.
2. Use **Edit** on the Members block, then on Engagement.

**Expected**
- Each Edit opens the matching step, scrolled to the top.
- The changed city is reflected on the review page.
- Returning to review does not lose anything from the other steps.

### PR-17 — The confirmation dialog
**Steps**
1. Click **Submit Registration**.
2. Read the dialog, then click **Keep reviewing**.
3. Submit again and use **Wait — add another member**.
4. Return to review and submit for real with **Yes, submit registration**.

**Expected**
- The dialog lists every member with their relationship and states how many are
  being registered.
- *Keep reviewing* closes it with nothing submitted.
- *Wait — add another member* takes you back to the Members step.
- The button shows a spinner and *Submitting…* while it works, and cannot be
  clicked twice.

### PR-18 — The confirmation screen
**Steps**
1. Complete the submission.

**Expected**
- A success screen: *Welcome to the family*.
- A reference number in the form `OLG-2026-XXXXXX`, in large type.
- The suffix uses no `0`, `O`, `1` or `I` — it has to be readable over the phone.
- Instruction to keep the number for their records.
- Buttons: **Print confirmation** and **Register another household**.

### PR-19 — Printing the confirmation
**Steps**
1. Click **Print confirmation** and inspect the preview (do not print).

**Expected**
- The print preview shows the reference number and parish name legibly.
- Nothing important is cut off at the page edge.
- No dark background floods the page.

### PR-20 — Registering another household starts clean
**Steps**
1. Click **Register another household**.
2. Start the wizard again.

**Expected**
- You are back on the landing page.
- Every field is empty; the previous family's details are gone.
- The reference number from the last submission is not shown anywhere.

---

## Draft recovery and error handling

### PR-21 — A refresh does not lose the form
**Steps**
1. Start a new registration and fill in step 1 and two members.
2. Reload the page (F5, or pull-to-refresh on a phone).

**Expected**
- The wizard reopens on the step you were on, with everything you typed intact,
  including both members.
- You do not land back on the landing page.

### PR-22 — A submitted draft does not come back
**Steps**
1. Submit a registration.
2. Reload the page.

**Expected**
- You get the landing page, not the wizard with the family you just submitted.

### PR-23 — Submission failure keeps the data
**Steps**
1. Fill in a complete registration and reach step 5.
2. Turn off your network (airplane mode, or DevTools → Network → Offline).
3. Click **Submit Registration** → **Yes, submit registration**.
4. Turn the network back on and submit again.

**Expected**
- An error toast appears; the wizard stays on step 5 with everything intact.
- The message is in plain language, not a raw browser or server error.
- The submit button becomes clickable again.
- The retry succeeds and produces one reference number.
- **Critically:** afterwards, the parish register must contain the household
  **once**, not twice. Confirm with a staff member in playbook 3 (HH-01).

### PR-24 — Too many submissions from one device
**Steps**
1. Submit more than twenty registrations from the same device within an hour
   (only worth doing if you are specifically testing this).

**Expected**
- After the limit, the app reports *Too many requests — please try again
  shortly.* rather than failing silently or looking broken.
- The form data is not lost.

### PR-25 — The public portal exposes nothing
**Steps**
1. Without signing in as staff, try to reach `/admin` directly in the URL bar.
2. Try `/admin/households`.
3. Try any nonsense path, e.g. `/nonsense`.

**Expected**
- `/admin` and `/admin/households` bounce you to the staff sign-in page.
- No parish data appears, even for a moment.
- A nonsense path returns you to the public landing page rather than an error.

---

## Sign-off

| ID | Check | Result |
|---|---|---|
| PR-01 | Landing page | |
| PR-02 | Theme picker persists | |
| PR-03 | Wizard starts | |
| PR-04 | Household required fields | |
| PR-05 | Errors clear on typing | |
| PR-06 | Email validation | |
| PR-07 | Long Filipino addresses | |
| PR-08 | Member required fields | |
| PR-09 | Add / remove members | |
| PR-10 | Per-member errors | |
| PR-11 | Large household | |
| PR-12 | Sacrament fields toggle | |
| PR-13 | Sacrament data persists | |
| PR-14 | Consent required | |
| PR-15 | Review accuracy | |
| PR-16 | Edit links | |
| PR-17 | Confirm dialog | |
| PR-18 | Reference number | |
| PR-19 | Print confirmation | |
| PR-20 | Clean restart | |
| PR-21 | Draft survives refresh | |
| PR-22 | Draft cleared after submit | |
| PR-23 | Failure keeps data, no duplicate | |
| PR-24 | Submission rate limit | |
| PR-25 | No data without sign-in | |

Browser / version: ____________  Device / width: ____________  Tester: ____________
