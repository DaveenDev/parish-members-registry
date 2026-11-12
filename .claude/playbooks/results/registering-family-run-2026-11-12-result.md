# Registering family run — 2026-11-12

| | |
|---|---|
| Playbook | `.claude/playbooks/registering-family.md` |
| Persona | Ate Grace Villanueva, 41, sari-sari store owner, registering her household of five on her phone |
| Account | not signed in |
| App | http://localhost:5173 (local dev server) |
| Database | **Local Supabase stack** (`127.0.0.1:54321`, `supabase start`, seeded with `db:demo`). **Not** the shared demo project `qyoyuukpdjrwfhovtrwd`. Purple Demo banner seen: yes. No request went to `rmlkowkbonbrtaqocsvo` (the live project). Run here because the user said to use `client/.env.local`, which points at the local stack. |
| Browser / widths | Playwright MCP (headless Chromium); 390 × 844 for everything, 1440 × 900 for the RF-6 confirmation |
| App version | `client/package.json` (not re-read for this run) |
| Run tag | PB1112RF |
| Started / finished | about 15:55 / 16:02 UTC (23:55 / 00:02 Asia/Manila) |

## Summary

Grace could register her family: the wizard is clear, in Bisaya, forgiving about missing baptism dates, kept her work through a reload, and the double-tap produced exactly one household. The status check and the "join a house" path both work and read well. The main problems are on the review and confirmation steps. The review shows "Paagi sa pagtabang" ticked for all six options when she ticked none (RF-1 below, display only, nothing wrong was saved). The head's own phone and email do not reach the family contact (RF-2). Registering the same family twice raises no warning at all, and the second copy is silently renamed (RF-3).

Top three to fix: **RF-1** (review shows help options she did not tick), **RF-2** (household contact blank when the head typed her own), **RF-3** (no duplicate-family warning).

**Verdict:** Ready with fixes

## Mission results

| Mission | Result | Time | Findings | Notes |
|---|---|---|---|---|
| RF-1 Find how to register | PASS WITH ISSUES | 1 min | RF-9 | One obvious button on `/`. Nothing says what to have ready or how long it takes. |
| RF-2 Household and head | PASS WITH ISSUES | 3 min | RF-2, RF-6, RF-10, RF-11 | Errors in Bisaya beside the field. Barangay and purok are free text. Head's contact not copied to family contact. |
| RF-3 Members | PASS WITH ISSUES | 3 min | RF-4, RF-7, RF-12 | Remove has no confirmation. No age on cards. Five members = about 6,600 px of scrolling. |
| RF-4 The interruption | PASS WITH ISSUES | 2 min | RF-8 | Reload kept everything checked. Browser Back leaves the wizard. |
| RF-5 Sacraments and participation | PASS WITH ISSUES | 4 min | RF-13 | Not blocked for unknown dates. Consent enforced. Step 4 is very long. |
| RF-6 Review and submit | PASS WITH ISSUES | 6 min | RF-1, RF-2, RF-5, RF-14, RF-15 | Double-tap created one household. Confirmation lacks "what happens next". |
| RF-7 "Did they get it?" | PASS | 1 min | RF-16 | Status only, plain words, helpful wrong-number message. |
| RF-8 Second family, same house | PASS | 1 min | | Option is on step 1. Wrong-code error says where to get the code. Join not completed (as instructed). |
| RF-9 Register again by accident | FAIL | 2 min | RF-3 | No warning. Submitted once, as the playbook says. |

## Findings

### RF-1 · P2 · Bug · Review shows all six "Paagi sa pagtabang" options when none were ticked

- **Where:** `/register` step 5 (Pagsusi), "Paagi sa pagtabang" under Panimalay, mission RF-6
- **Steps:** 1. Reach step 4 and tick none of the six boxes under "Pagtabang sa Parokya / GKK". 2. Continue to the review.
- **Expected:** The list is empty or says "wala".
- **Actual:** All six options are listed (Kanunay nga pagsimba… through Paghatag sa suporta pinansyal). Seen in both submissions. The saved record is correct (`help_ways` is `[]`), so it is a display fault, but a parishioner would believe she volunteered for six things.
- **Evidence:** Step 4 checkbox states all `false`; review text lists all six; `households.help_ways = []` for both new households.
- **Suggestion:** Show only ticked options, or "Wala" when none.
- **Seen before:** new
- **Code pointer:** pointer added after the run

### RF-2 · P2 · Bug · Head's own mobile and email do not reach the household contact; review shows "—"

- **Where:** `/register` step 1, then step 5; mission RF-2 / RF-6
- **Steps:** 1. In "Ulo sa Panimalay" type mobile and email. 2. Leave "Numero sa kontak sa pamilya" and "Email sa pamilya" (further down, in "Puy-anan ug Kontak") empty. 3. Finish and submit.
- **Expected:** The parish can reach her. Or the form makes clear there are two separate contact fields.
- **Actual:** Review shows Kontak "—" and Email "—". Stored household 35 has empty `contact` and `email`; only Grace's member row has a number. Two near-identical labels ("Numero sa kontak" and "Numero sa kontak sa pamilya") on the same step make this easy to miss.
- **Evidence:** Review text; DB: household 35 `contact`/`email` empty, member Grace `contact` = `0917 555 0110`.
- **Suggestion:** Prefill family contact from the head, or merge the two fields.
- **Seen before:** new
- **Code pointer:** pointer added after the run

### RF-3 · P2 · Gap · No warning when the same family is registered again; copy is silently renamed

- **Where:** `/register` steps 1 to 5, mission RF-9
- **Steps:** 1. After a first submission, start a new registration with the same head, birthday and address. 2. Continue to review and submit once.
- **Expected:** A warning such as "this family may already be registered (POB-…)".
- **Actual:** No warning anywhere. The household name was silently changed from "Villanueva Pb1112rf Household" to "Villanueva Pb1112rf **Grace** Household" to avoid the name clash, and the second registration was accepted (POB-2026-0002). Staff will see two pending households for the same head.
- **Evidence:** Review text; DB rows 34 and 35.
- **Suggestion:** Warn when head name + birthday matches an existing household, pointing her to the status check. Don't expose who it is.
- **Seen before:** new
- **Code pointer:** pointer added after the run

### RF-4 · P2 · Friction · Removing a member has no confirmation and no undo

- **Where:** `/register` step 2, "Tangtangon", mission RF-3
- **Actual:** The member is gone at once; a toast says "Natangtang ang miyembro".
- **Expected:** Confirmation (playbook: "removing asks for confirmation"), or an undo on the toast.
- **Suggestion:** Confirm, or add "Ibalik" on the toast.
- **Seen before:** new

### RF-5 · P2 · Friction · The edit link on the review sends her to step 1 and takes four taps to come back

- **Where:** `/register` step 5, "Usba" on Panimalay, mission RF-6
- **Actual:** "Usba" opens step 1. After the fix she has to tap Padayon four times to get back to the review.
- **Suggestion:** After an edit from the review, show "Balik sa pagsusi".
- **Seen before:** new

### RF-6 · P3 · Friction · Barangay and street/purok are free text; no picker

- **Where:** `/register` step 1, mission RF-2
- **Actual:** Barangay is a typed field and purok is mixed into the street field. City, province and ZIP are prefilled. The GKK picker works and has a good "Dili sigurado? Tan-awa ang GKK directory" link.
- **Expected (playbook):** Barangay / purok pickers that match her address.
- **Impact:** Staff get inconsistent spellings.
- **Suggestion:** Barangay pick-list for the parish's area, with "Uban pa".
- **Seen before:** new

### RF-7 · P2 · Mobile · Member list is about 6,600 px tall with five people; no ages shown

- **Where:** `/register` step 2 at 390 px, mission RF-3
- **Actual:** Every member card stays fully expanded, so the list is a very long scroll. No age appears on the cards (age only shows later, on step 3, for a child: "10 anyos pa"). The edited birthday was respected (Migo's age updated).
- **Suggestion:** Collapse finished members to one line (name, relationship, age) with an edit button.
- **Seen before:** new

### RF-8 · P3 · Friction · Browser Back from step 3 leaves the wizard; returning restores the draft silently

- **Where:** `/register` step 3, mission RF-4
- **Actual:** Reload kept step 3 and all ticks; OFW status, members and the edited birthday were all kept (nothing lost). Browser Back went to the home page, not step 2. Returning through the home button restored step 3 with no message that her answers were kept and no "start over".
- **Suggestion:** Show "Gipadayon ang inyong gisugdan — Sugdi pag-usab", and make Back step through the wizard.
- **Seen before:** new

### RF-9 · P3 · Gap · Nothing says what to have ready or how long registration takes

- **Where:** `/` and `/register` step 1, mission RF-1
- **Actual:** One tap gets from `/` to the form (good), and the privacy line is on the home page ("Pribado ang inyong impormasyon…"). But nothing before step 1 says to have birthdays and baptism papers ready or roughly how long it takes. Step 1 shows no privacy note; consent only appears at the end of step 4.
- **Suggestion:** A short intro line above step 1.
- **Seen before:** new

### RF-10 · P3 · Bug · Names are re-capitalised: "PB1112RF" becomes "Pb1112rf"

- **Where:** `/register` steps 2 to 5; stored `household_name`
- **Actual:** Entered "Villanueva PB1112RF", shown and stored as "Villanueva Pb1112rf". It hurts the run tag (cleanup needs a case-insensitive search). For real surnames this may mangle things like "dela Cruz" or "MacArthur"; **not tested**.
- **Suggestion:** Only capitalise the first letter of each word; don't lowercase the rest.
- **Seen before:** new

### RF-11 · P3 · Copy · Mobile numbers are stored exactly as typed

- **Where:** `/register` step 1
- **Actual:** `0917-555-0110` and `+63 917 555 0110` were both accepted without comment; the stored value is `+63 917 555 0110` for one household and `0917 555 0110` for the other. The email typo `grace.pb@example` was correctly refused in Bisaya ("Isulat ang saktong email").
- **Suggestion:** Normalise on save so staff can search and de-duplicate.
- **Seen before:** new

### RF-12 · P3 · Copy · Relationship list lumps in-laws together

- **Where:** `/register` step 2 / step 4
- **Actual:** Lola Pilar (mother-in-law) can only be "Ugangan / Bayaw / Bilas", which later reads oddly next to a 73-year-old woman. "Apo" (grandchild) exists. No option for son/daughter-in-law, nephew or niece (they must use "Uban pa").
- **Seen before:** new

### RF-13 · P3 · Friction · Step 4 is long and asks for staff-style details

- **Where:** `/register` step 4, mission RF-5
- **Actual:** "Kahimtang karon" is required for every member, including a 10-year-old, with "Mibiya sa Simbahan" as an option. Organisation lists (Knights of Columbus, Catholic Women's League) appear for children. GKK and parish officer positions (PPC President, GKK Cluster Head) are asked of every registrant. The consent tick is at the very bottom. The Aktibo / Panagsa / Wala scale has no explanation, though the words are understandable. Not being blocked for unknown sacrament dates, and the copy "pwede ra kini biyaan nga blangko", are good.
- **Suggestion:** Hide staff-only items from the public form; default status to the head's answer.
- **Seen before:** new

### RF-14 · P3 · Copy · Confirmation does not say who verifies, how long it takes, or how to update later

- **Where:** `/register` confirmation, mission RF-6
- **Actual:** "Susihon ug pamatud-an sa among kawani… sa dili madugay" ("soon") only. The updating instruction ("Gamita ang reference number ug code aron ma-update…") has no link to where. The warning box is in English on an otherwise Bisaya page. At desktop width it looks fine. Print was clicked and dismissed with Escape; the print layout could not be seen in this headless browser.
- **Seen before:** new

### RF-15 · P3 · Friction · A fast double-tap on "Ipadala ang Rehistro" seems to do nothing

- **Where:** `/register` step 5, mission RF-6
- **Actual:** The first tap opens the "Andam na ba ipadala?" sheet; a second tap right away appears to dismiss it, so the page looks unchanged. No data was sent. Double-tapping the final confirm ("Oo, ipadala ang rehistro") produced **one** household and **one** `submit_registration` call. Good.
- **Suggestion:** Ignore taps for a moment after the sheet opens.
- **Seen before:** new

### RF-16 · P3 · Copy · Example reference numbers say MEO-… but the real number was POB-…

- **Where:** `/serbisyo` status box, join-a-house placeholder
- **Actual:** The help text and placeholder use "MEO-2026-0001" while this parish issued "POB-2026-0001". The status result itself was plain and status-only: "Nadawat — gisusi pa sa kawani". A wrong number gave "Wala namo makit-i…" with a contact-the-office button.
- **Suggestion:** Build the example from the parish's own prefix.
- **Seen before:** new

## Improvement ideas

- Add a short checklist before step 1 ("Andama: birthdays, petsa sa bunyag kung nahibaw-an"). Helps Grace most, because she fills this between customers.
- Offer to keep the confirmation page: save the reference number and code to the phone's clipboard, or text them. Whether reloading the confirmation page loses the number was **not tested**.

## Boundary checks

| Check | Expected | Actual | Result |
|---|---|---|---|
| After submitting, any page showing other families | none | Confirmation page shows only her own reference number and code | PASS |
| Status check | status only, no names / mobile / address | "Nadawat · Gisusi pa sa kawani" only | PASS |
| Network responses during the wizard | no rows from `households` or `members` other than echoes of her own submit | No REST calls to those tables; only RPCs (`submit_registration` ×2, list/lookup RPCs) | PASS |
| Draft in browser storage after submit | not restored on next registration | Next `/register` opened empty at step 1; draft key reset | PASS |

## Think-aloud notes

- The draft lives in `localStorage` (`pmr_registration_draft_v2`) as plain text until submit, including names, birthdays and blood type; fine on her own phone, worth knowing for shared phones.
- Early 503s on the first page load were the local API still warming up after a container restart, not an app problem; the reload came back with 0 console errors.
- Some of my own steps misfired (slow typing appended instead of replacing, one field mis-targeted before the reload); those were my tool, not findings, and I re-entered the values.
- **Method deviation:** to fill the long forms I used Playwright's locator/fill API (real input events) for many fields instead of tapping each one by hand, and a few read-only page evaluations to inspect form values and localStorage. The playbook's strict "no developer tools" rule is therefore only partly followed.

## Not tested

- Names with ñ or an apostrophe (Peñaflor, D'Souza); errors clearing as she types; keyboard / screen-reader use; per-device rate limiting; completing a join with a valid house code; reloading the confirmation page; the print layout.

## Cleanup

- **Created:** household 34 = POB-2026-0001 (5 members, "Villanueva Pb1112rf Household") and household 35 = POB-2026-0002 (1 member, "Villanueva Pb1112rf Grace Household"), both in the **local** database only. The house code for the first is deliberately not written here.
- **Removed:** none (she can't delete).
- **Left for staff admin:** POB-2026-0001 and POB-2026-0002 (tag PB1112RF; search is case-insensitive because the tag was rewritten as "Pb1112rf").
- Signed out: n/a. Viewport reset: yes (1440 × 900 then 390 × 844; browser left open).
