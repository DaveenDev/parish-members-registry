# Role playbook — No access (a login waiting for access)

| | |
|---|---|
| Access level | none: signed in, but the profile has no access level (`access` null → `'none'`, migration 0065) |
| Signs in at | `/admin/login` |
| Account | `no-access` in `accounts.local.json` (made in the Supabase dashboard; see staff-admin SA-0) |
| Device | phone (390 × 844) |
| Time budget | about 15 minutes |
| Run tag | `PB<MMDD>NA` · findings `NA-1`, `NA-2` … |
| Result file | `results/no-access-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first. If the browser tool or dev
database are not set up yet, do §0 there (`npm run db:dev:up && npm run db:dev:seed`). If there's no no-access account,
mark the run `BLOCKED (no account)`.

## Persona

**Joy**, 27, a new GKK leader. The office made her login but hasn't set
her access yet, which happens during busy weeks. She signs in on her phone
the night before the census training and wants to check that it works.

## What the role should allow

Only her own account settings (the sidebar shows only **My Account**).
No registry data at all, from the screen or the network.

## Missions

### NA-1 · Sign in and understand

- Sign in. What does she see? Does it tell her the account works but is
  waiting for access, and who to ask?
- **Watch for:** a blank page or a scary error is a P2 finding; a message
  in plain words is the goal.

### NA-2 · What she can do

- Open My Account. Change her display name and password (update
  `accounts.local.json`), and sign out and in again.

### NA-3 · Push the doors

- Type the addresses a colleague might have sent her: `/admin`,
  `/admin/households`, `/admin/census`, `/admin/requests`,
  `/admin/settings/staff`.
- **Expected:** each one refuses politely or sends her to My Account.
  `read_network_requests`: every data response is empty or refused. Any
  household, member or request row is **P0**.

### NA-4 · Notifications

- Settings → Notifications (if shown): can she turn on notifications for
  data she can't see? (She shouldn't.)

## Boundary checks

| Check | Expected |
|---|---|
| Sidebar | only My Account (+ sign out) |
| Every admin URL above | no data on screen or in the network |
| Dashboard counts / badges | none shown, or zero, with no data request returning rows |

## Cleanup

Put the display name back. Sign out.
