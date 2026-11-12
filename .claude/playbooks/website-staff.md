# Role playbook — Website & requests staff

| | |
|---|---|
| Access level | `website` |
| Signs in at | `/admin/login` |
| Account | `website-staff` in `accounts.local.json` |
| Device | laptop (1440 × 900); WR-8 on a phone |
| Time budget | about 50 minutes |
| Run tag | `PB<MMDD>WR` · findings `WR-1`, `WR-2` … |
| Result file | `results/website-staff-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first.

## Persona

**Paolo**, 24, youth ministry volunteer and the parish's "media guy." He
posts on the parish Facebook page and now has to keep the website up to date
too, and answer the requests that come in (certificates, prayers, blood
requests). He's quick with apps and expects them to work like Facebook or
Canva: drag a photo in, preview, publish. He does the requests on his phone
when he's not at the office.

## What the role should allow

Runs the **Parish Website** (all tabs, including Office & Contact) and the
**Requests** queues; downloads the Requests files from Exports. Can view the
registry and blood types but **not** the census. No household/member edits,
no settings, staff, activity log or trash.

## Missions

### WR-1 · Post this Sunday's announcement

- Website → Announcements: write one (title ends with `PB<MMDD>WR`), add a
  photo if the form allows (use any image from `client/public/`), save as
  draft first, preview, then publish.
- Open the public site (click through, as a visitor) and find it.
- **Watch for:** draft vs published clear; preview matches the real page;
  the photo is cropped well on a phone; scheduling (show from / until).

### WR-2 · Add an event and a bulletin

- Add an event for next Saturday and a bulletin (tagged). Check both on the
  public site and that the event shows on the right day.
- **Watch for:** time zones (Manila); past events drop off; a bulletin
  upload says which file types work.

### WR-3 · Change the Mass schedule (and put it back)

- Mass Schedule: add a tagged special Mass (e.g. "Novena Mass PB<MMDD>WR").
  Check it on `/simbahan`. Delete it.
- **Watch for:** easy to add a one-off without breaking the weekly schedule.

### WR-4 · Certificate requests

- Requests → Certificates: find the tagged request from a public-visitor run
  (`Dela Cruz PB…PV`) or the most recent tagged one. Take it through its
  steps to *ready to claim*. If the app offers to text the requester, **don't
  send**; just note what it would do.
- Check the public status check (`Susiha`) shows the new status.
- **Watch for:** each step's meaning clear; can he see who to call; does he
  know what to do with an incomplete request?

### WR-5 · Prayer requests and the wall

- Requests → Prayers: approve one tagged request to the wall and decline or
  close another. Check the public prayer wall.
- **Watch for:** he can see if the requester wanted it private; wording on
  the wall can be edited before publishing (for privacy).

### WR-6 · A blood request

- Requests → Blood Requests: if a tagged one exists, find matching donors
  and **log** (not make) a call to one. Otherwise check the empty state.
- **Watch for:** donor matching by type is clear; contact log records who
  called; donor phone numbers shown only as needed.

### WR-7 · Office & Contact, Downloads, History

- Look at Office & Contact (don't change the real details; if you test a
  change, revert it immediately). Add a tagged download (a small text or
  image file) and delete it. Read the History tab.
- **Watch for:** what each field changes on the public site is shown
  (the tab links to its public page).

### WR-8 · Requests on the phone

- At 390 × 844, process one request end to end from the phone.
- **Watch for:** queue tabs fit; action buttons reachable; long text readable.

### WR-9 · Requests export

- Exports: see which Requests files he can download. **Ask the user before
  downloading.** Whole-registry exports must not be offered.

## Boundary checks

| Check | How | Expected |
|---|---|---|
| Census | `/admin/census` | refused / not in menu |
| Edit a household or member | open a household from Households | read-only, no edit/delete buttons |
| Whole-registry exports | Exports page | only Requests files |
| Settings | `/admin/settings?tab=config`, `/admin/settings/staff`, activity, trash | only My Account (personal); others refused |
| Reports | `/admin/reports` | refused (reports aren't in his access) |

## Cleanup

Delete his tagged announcement, event, bulletin, Mass entry and download.
Mark tagged requests done/closed. Sign out.
