# Role playbook — Clergy (parish priest)

| | |
|---|---|
| Access level | `clergy` |
| Signs in at | `/admin/login` |
| Account | `clergy` in `accounts.local.json` |
| Device | tablet (768 × 1024) and the rectory desktop (1440 × 900) |
| Time budget | about 40 minutes |
| Run tag | `PB<MMDD>CL` · findings `CL-1`, `CL-2` … |
| Result file | `results/clergy-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first.

## Persona

**Fr. Dodong**, 58, the parish priest. Busy, not patient with computers,
uses a tablet his nephew set up. He wants answers, not screens: "Is this
couple both confirmed?", "How many baptisms this year?", "Which GKKs are
weak in attendance?" He verifies sacraments against the parish books and
approves OCIA and anointing (Pagdihog) requests. He'll give up after two
confusing screens and call the secretary.

## What the role should allow

Sees the registry, sacraments, census and reports; **verifies sacraments**;
handles the Requests queues. Changes no household or member. **No** blood
types, exports, census codes, website, activity log or trash.

## Missions

### CL-1 · Sign in on the tablet

- At 768 × 1024, sign in. What does he see first? Is there a short path to
  the three things he asks about?

### CL-2 · "Are they both confirmed?"

*"A couple is asking to be married next month."*

- Find two members (any demo pair; search by surname) and read their
  baptism and confirmation, with dates and parishes.
- **Watch for:** the answer in one view; verified vs claimed clearly
  different; no edit buttons he might tap by mistake.

### CL-3 · Verify a sacrament against the book

- Sacraments: open a claim waiting for verification (a tagged one if there
  is one), verify it with a book / page reference, then take it back.
- **Watch for:** the record shows who verified and when; it's hard to verify
  the wrong person (name, birthday, parents shown).

### CL-4 · Sacrament requests

- Requests → Sacraments (OCIA / Pagdihog): process a tagged request. If none,
  ask: would he know where they appear? Check the empty state.
- **Watch for:** urgency (anointing of the sick is urgent) visible and
  sortable; contact details there when needed.

### CL-5 · Numbers for the homily and the bishop

- Reports: baptisms / marriages this year, members by GKK, activeness by GKK.
  Print preview (Escape).
- **Watch for:** plain-language labels; a printed report has the parish
  name, date and what's counted.

### CL-6 · Census overview

- Census: see overall progress and which GKKs are behind. He must not be
  able to get codes or change answers.

## Boundary checks

| Check | How | Expected |
|---|---|---|
| Edit a household or member | open one | no edit, no delete |
| Blood types | `/admin/blood`; a member's detail | page refused; blood type not shown |
| Exports | `/admin/exports` | refused |
| Census codes | a household on the Census page | no get / renew code |
| Website | `/admin/website` | refused |
| Activity log, Trash, Staff | their URLs | refused |
| Network | `read_network_requests` on a member detail | no `blood_type` value in responses |

## Ten minutes of free exploring

As Fr. Dodong with ten minutes before Mass: what would he try, where would
he give up? Each "I'd call Marites for this" is a finding.

## Cleanup

Undo any verification he made (CL-3). Close tagged requests he handled.
Sign out.
