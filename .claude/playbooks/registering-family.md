# Role playbook — Registering family

| | |
|---|---|
| Access level | none: not signed in (public registration at `/register`) |
| Starts at | `/` (the parish website), then the way in to registration |
| Device | phone (390 × 844) for the whole form; desktop for RF-6 |
| Time budget | about 40 minutes |
| Run tag | `PB<MMDD>RF` · findings `RF-1`, `RF-2` … |
| Result file | `results/registering-family-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first. If the browser tool or dev
database are not set up yet, do §0 there (`npm run db:dev:up && npm run db:dev:seed`). Be **signed out**.

## Persona

**Ate Grace Villanueva**, 41, a sari-sari store owner, head of a household
of five: husband Ramon (44, an OFW in Qatar), daughter Bea (16), son Migo
(9), and Ramon's mother Lola Pilar (73). Her GKK leader told her at the
chapel to "register the family online." She fills it on her phone between
customers, so she gets interrupted. She knows birthdays by heart but not the
exact baptism dates; she has the baptismal certificates in a folder at home.
Reads Bisaya; English is OK for short labels.

Use the tagged surname **`Villanueva PB<MMDD>RF`** for everyone, mobile
`0917 555 0110`, email `grace.pb@example.test`.

## What the role should allow

Fill in the five-step wizard (Pamilya ug Ulo → Mga Miyembro → Mga Sakramento →
Pag-apil → Pagsusi), submit, get a reference number (MEO-…), check status at
`/serbisyo/susiha`. A family joining an already registered house can join
with that house's reference number and code. Rate-limited per device.

## Missions

### RF-1 · Find how to register

- From `/`, find the registration without typing `/register`.
- **Watch for:** how many taps; whether it says what she needs to have
  ready and how long it takes, before she starts; privacy explained.

### RF-2 · Household and head (step 1)

- Fill step 1 as Grace. Make the human mistakes: leave a required field
  empty and tap continue; type the mobile as `0917-555-0110` and as
  `+63 917 555 0110`; an email with a typo (`grace.pb@example`).
- **Watch for:** errors in Bisaya next to the field; errors clear as she
  types; the GKK / barangay / purok pickers make sense for her address;
  nothing forces English.

### RF-3 · Members (step 2)

- Add the four other members. Mark Ramon as working abroad (OFW). Add one
  member by mistake and remove them. Edit a birthday after adding.
- **Watch for:** relationship options fit a Filipino household
  (mother-in-law, grandchild); age shown or computed correctly; removing
  asks for confirmation; at 390 px the member list stays usable with five
  people.

### RF-4 · The interruption

- Halfway through step 3, **reload the page** (a customer came, the phone
  locked). Then press the browser **Back** button. Then come back to the form.
- **Watch for:** is her work still there? Does she know where she was? Is
  anything silently lost (sacrament details, the OFW detail)?

### RF-5 · Sacraments and participation (steps 3–4)

- Tick sacraments for each member: she knows *that* they're baptized but not
  the dates. Give one exact date and parish, leave the others with no date.
  Fill participation (Pag-apil). Try to continue without the consent tick.
- **Watch for:** does she get blocked for not knowing a date? Is the A / P / W
  scale explained? Is consent wording understandable?

### RF-6 · Review and submit (step 5)

- On the review step, check every detail matches what was typed. Use an edit
  link to fix one thing and return. Submit. Double-tap the button.
- On the confirmation, save the reference number (MEO-…). Try print
  (Escape), then switch to desktop width and look at the confirmation again.
- **Watch for:** the review shows sacrament dates and OFW details correctly;
  only one household created; the confirmation tells her what happens next
  (who verifies, how long) and how to update later.

### RF-7 · "Did they get it?"

- Two days later (pretend): find the status check from the site menus and
  enter her MEO- number. Then a wrong one.
- **Watch for:** status only, in plain words; "pending verification"
  explained.

### RF-8 · A second family in the same house

*"My sister's family lives with us. Do they register separately?"*

- Start a new registration and look for the way to join an existing house
  (reference number + house code). Use her MEO- number and a wrong code:
  see the message. (She doesn't have the house code yet, so don't
  complete it unless a code is available.)
- **Watch for:** is the "join a house" option discoverable? Does the error
  tell her where to get the code (it should: the head of household or the
  parish office)?

### RF-9 · Register again by accident

- Start registering the same family again (same head, same birthday) and go
  as far as the review step. Don't submit unless the app accepts it without
  warning, in which case submit **once** and record it as a finding.
- **Watch for:** any warning that this family may already be registered.

## Boundary checks

| Check | Expected |
|---|---|
| After submitting, any page showing other families | none |
| Status check | status only, no names / mobile / address |
| Network responses during the wizard | no rows from `households` or `members` other than echoes of her own submit |
| Draft in browser storage after submit | not restored on the next registration (start one and look) |

## Cleanup

She can't delete. List the MEO- number(s) under **Left for staff admin**.
The full-access or gkk-leader run verifies or trashes them. Clear the
in-progress RF-8 / RF-9 forms by leaving them (note whether a draft lingers).
