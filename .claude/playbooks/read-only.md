# Role playbook — Read only (parish council member / auditor)

| | |
|---|---|
| Access level | `read_only` |
| Signs in at | `/admin/login` |
| Account | `read-only` in `accounts.local.json` |
| Device | desktop (1440 × 900); RO-5 at phone width |
| Time budget | about 30 minutes |
| Run tag | `PB<MMDD>RO` (he creates nothing) · findings `RO-1`, `RO-2` … |
| Result file | `results/read-only-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first.

## Persona

**Engr. Tony Bacalso**, 61, Parish Pastoral Council vice-president. He was
given a read-only login "so the council can see the numbers." He prepares the
council report each quarter and likes to double-check the office's figures.
Comfortable with spreadsheets; suspicious of numbers he can't trace.

## What the role should allow

Sees the registry, census, requests, website and activity log, and **changes
nothing**. No exports, census codes, GKK documents or trash.

## Missions

### RO-1 · The quarterly numbers

- Find households and members per GKK, new registrations this quarter, and
  sacraments this year. Write them in the result file.
- **Watch for:** can he trace a number back to the list behind it? Do
  Dashboard, Reports and the lists agree?

### RO-2 · "Who changed this?"

- Open the Activity log. Find who last changed a particular household, and
  what changed.
- **Watch for:** readable descriptions (not raw field names); filters by
  person / date / record.

### RO-3 · Census progress

- Census: overall and per-GKK progress. Compare with what a GKK leader saw
  (gkk-leader run result, if any).

### RO-4 · Requests and website

- Look at the Requests queues and the Website tabs. Note whether it's clear
  that he can't change anything (disabled buttons vs missing buttons vs
  buttons that fail when clicked; the last is a finding).

### RO-5 · On his phone in the meeting

- At 390 × 844, find one figure from RO-1 again.

### RO-6 · "Can I just get it in Excel?"

- Look for a way to get the numbers out (print, export). Exports are not
  his; is the print view enough for a council report? This is likely a
  `Gap` / `Suggestion`.

## Boundary checks

Try each change the way a curious user would: look for the button; if one is
shown, click it and see what happens.

| Check | Expected |
|---|---|
| Edit / verify / delete a household | no button, or a clear refusal; nothing saved (reload to confirm) |
| Edit a member, verify a sacrament | same |
| Census answers, census codes | none |
| New website item, request status change | none |
| Exports `/admin/exports`, Trash `/admin/settings/trash` | refused |
| GKK documents (Parish Config → Parish GKK, or a GKK's documents) | not visible |
| Network after any attempt | no successful `POST` / `PATCH` / `DELETE` (a `2xx` write is P0) |

## Cleanup

Nothing to clean. Sign out.
