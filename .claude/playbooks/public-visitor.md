# Role playbook — Public visitor (parish website)

| | |
|---|---|
| Access level | none: not signed in (the anon key only) |
| Starts at | `/` (the parish website home) |
| Device | phone first (390 × 844), then desktop for one mission |
| Time budget | about 35 minutes |
| Run tag | `PB<MMDD>PV` · findings `PV-1`, `PV-2` … |
| Result file | `results/public-visitor-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first. Make sure you are **signed out** (open
`/admin/login`; if it goes straight into the admin panel, sign out first).

## Persona

**Jun**, 34, a tricycle driver and a parishioner who goes to Mass most
Sundays. He found the parish website from a link on the parish Facebook page.
Budget Android phone, prepaid data, reads Bisaya first. He's not looking to
"browse a website"; he wants a quick answer: what time is Mass, is there
an announcement, how does he get his baptismal certificate for a job
application. His mother wants to ask for prayers for his sick father.

## What the role should allow

Read **published** website content; submit registrations and requests
through the public forms (rate-limited). Never see a household, member,
request or census row, or any draft website item.

## Missions

### PV-1 · First impression

*"Is this our parish? What can I do here?"*

- Open `/` at phone width. Without scrolling, what does Jun see? Then scroll
  the whole home page once.
- **Watch for:** parish name and photo clear; the most common needs (Mass
  times, announcements, services) reachable in one tap; load time on first
  open (note it); anything broken, cut off, overlapping, or in English only
  where it matters; heavy animations that would hurt a budget phone.

### PV-2 · "What time is Mass this Sunday?"

- From the home page only, find this Sunday's Mass schedule and the readings
  (Pagbasa).
- **Watch for:** the number of taps it takes; whether the schedule says
  which church/chapel and which day clearly; today's readings actually for
  today (Asia/Manila date).

### PV-3 · Announcements and events

- Find the latest announcement, open it, then find the next event and the
  latest bulletin. Use the share button if there is one (cancel the share
  sheet).
- **Watch for:** dates in a format Jun reads easily; old announcements
  clearly marked old; a bulletin that is a PDF or image is readable on the
  phone; Back returns to the list where he was.

### PV-4 · Ask for a baptismal certificate

*"My employer wants my baptismal certificate."*

- Find the service and fill in the certificate request (`Pangayo og
  Sertipiko`) for a fictional person: last name `Dela Cruz PB<MMDD>PV`,
  mobile `0917 555 0101`. Submit. Keep the reference number (CR-…).
- Try the human mistakes on the way: skip a required field, type the year as
  "98", go Back a step and forward again, double-tap Submit.
- **Watch for:** Does he know what to bring and how long it takes before he
  starts? Are errors in Bisaya and next to the field? Does double-tap make
  two requests? Is the reference number easy to save (screenshot hint, copy)?

### PV-5 · Check the request's status

- From the site's menus, find where to check a request (`Susiha`) and look
  up the CR- number from PV-4. Then try a made-up number (`CR-2026-9999`).
- **Watch for:** only the status is shown, no personal details; a clear
  message for a wrong number.

### PV-6 · A prayer request for his father

- Submit a prayer request (tag it in the name or intention text,
  `PB<MMDD>PV`). Choose the option that keeps it **off** the public prayer
  wall if there is one; submit a second one that asks to be shown, if offered.
- Then open the prayer wall (Komunidad → Pag-ampo).
- **Watch for:** is it clear who will see the request? Does an unapproved
  one appear on the wall right away (it shouldn't, if the office approves
  them)?

### PV-7 · Find his GKK and a parish group

- Find his GKK's page (Komunidad) and a ministry or organization he could join.
  Use the "interested" form if there is one (tagged).
- **Watch for:** can he find his GKK by his barangay/purok? Are leaders'
  contact details shown, and should they be?

### PV-8 · Downloads and songs

- Find a song's lyrics for Mass (Downloads → Kanta) and a downloadable file.
  Don't download (just check the link works and says what it is and how big).

### PV-9 · Contact the office (desktop)

- Switch to desktop width. Find office hours, phone, and the map/address.
  Check the footer links all work. Visit the Developer page from the footer.

### PV-10 · Blood donation

- Find the blood donation page. Read what happens if he registers as a donor.
  Fill the donor form only as far as the last step; submit only if the result
  file will record it for cleanup (tag it).

## Boundary checks (he must not)

| Check | How | Expected |
|---|---|---|
| Admin pages | type `/admin`, `/admin/members` | sign-in page, no data requests answered with rows |
| Census portal without a code | `/census` | asks for reference no. + code; nothing else |
| Someone else's request | `Susiha` with another plausible number | status at most, no names, no mobile |
| Draft website items | compare the public announcement list with the admin view (if a later run allows) | drafts never appear |
| Prayer wall | after PV-6 | private request absent |
| Network | `read_network_requests` across all missions | no `households`, `members`, `certificate_requests` rows in any response |

## Ten minutes of free exploring

As Jun on a slow evening: tap the things that catch his eye, switch the
theme, try the site with the phone sideways, look up a saint's day on the
Kalendaryo, open an old article. Note what feels slow, confusing or great.

## Cleanup

Public visitors can't delete what they sent. List the CR- number, prayer
requests, interest and donor entries (all tagged) under **Left for staff
admin**; the website-staff run handles them in its queues.
