# Role playbook — Census family (family portal)

| | |
|---|---|
| Access level | the family portal: reference number + census access code at `/census` |
| Starts at | `/` (as if from the SMS / slip the GKK leader gave), then `/census` |
| Device | phone (390 × 844) |
| Time budget | about 30 minutes |
| Run tag | `PB<MMDD>CF` · findings `CF-1`, `CF-2` … |
| Result file | `results/census-family-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first. Be **signed out** of the admin.

## Persona

**Kuya Ramil Santos**, 29, a call-centre agent, updating the family record for
his parents because "you're the one good with phones." His GKK leader gave
him a small slip with a reference number and a code. He does it on his
break, quickly, and wants to be sure it "went through." He reads English
fine but the portal is in Bisaya, and he wonders what a few words mean.

## What the role should allow

Open and update **their own household only**, and only while a census is
open. Changes go to the GKK leader / office for review (Census → Online
updates).

## Before you start

- You need a reference number and access code for a **tagged or demo
  household** in `accounts.local.json` → `census-family` (the gkk-leader run's
  GL-4 or a full-access run makes one). If none, `BLOCKED (no code)`.
- A census must be open. If the portal says the census is closed, test only
  CF-1 and the closed message, and mark the rest `BLOCKED (census closed)`.

## Missions

### CF-1 · Get in

- From the home page, find the census portal (don't type `/census` unless
  he can't find it, which would be a finding). Enter the reference number
  and code. First enter them wrong once: lowercase, a space at the end, the
  code with a digit swapped.
- **Watch for:** forgiving input (case, spaces); a clear message for a wrong
  code that tells him who to ask; lock-out after several tries explained.

### CF-2 · Check the family list

- Look at who is listed. Confirm each member is still in the household.
- **Watch for:** members shown with enough detail to recognise them but not
  more than needed; clear yes/no per member.

### CF-3 · Update the household

- Make the changes a real family has: a member moved to Manila; a new baby
  (add a member, tagged surname `Santos PB<MMDD>CF`, born this year);
  a changed mobile (`0917 555 0120`); one member's activeness changes.
- Step through the new-member steps (Mga detalye, Mga sakramento, Pag-apil,
  Census). Try to finish without the census status.
- **Watch for:** the steps make sense for a newborn (no Confirmation
  questions); moving someone out is reversible before sending.

### CF-4 · The break ends

- Halfway through CF-3, reload. Then close the tab and reopen `/census`.
- **Watch for:** is his work kept or lost, and does the screen say which?
  Does he need to type the code again?

### CF-5 · Send and confirm

- Send the update. Look for proof it was received. Open the portal again
  with the same code: what does it say now?
- **Watch for:** a clear "received, your GKK leader will review it";
  whether he can still change it before review; whether sending twice makes
  two submissions.

### CF-6 · Reading the Bisaya

- Go through every screen once more and list words or sentences a young
  English-first user might not understand, and any English left untranslated
  that would confuse his parents. Note these as `Copy` findings with a
  suggested wording.

## Boundary checks

| Check | How | Expected |
|---|---|---|
| Another household | change the reference number to a neighbour's (one digit off) with the same code | refused, no details |
| Admin | open `/admin/households` in the same tab | sign-in page, no rows |
| Network | `read_network_requests` | only his household's data in responses |
| After the census closes (if a later run closes it) | reopen the portal | read-only or a closed message, no edits |

## Cleanup

He can't delete. List the tagged baby member and the submission under **Left
for staff admin**; the gkk-leader run's GL-5 reviews (or sends back) the
submission. Sign-out isn't needed; close the portal.
