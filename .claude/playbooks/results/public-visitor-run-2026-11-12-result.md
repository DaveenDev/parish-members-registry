# Public visitor run, 2026-11-12 (PARTIAL)

| | |
|---|---|
| Role / persona | Public visitor, Jun |
| Account | none (signed out) |
| App | http://localhost:5173 (vite dev) |
| Database | LOCAL Supabase (127.0.0.1:54321), not the shared demo project and not live. Demo banner shown; all requests went to 127.0.0.1:54321 |
| Browser | Playwright MCP (headless Chromium), 390 x 844 |
| Run tag | PB1112PV |

## Summary
Jun can read the home page, request a baptismal certificate, check its status and send prayer requests without trouble. Wording is Bisaya, errors are next to the field, and a double-tap on Submit made one request. Private data stayed private. Mass times, readings, downloads, songs, GKK detail pages, the Kalendaryo and blood-donor submission were **not exercised**: the seeded local data has no Mass schedule or downloads, and the run was cut short. Treat this as a partial run.

Top things to look at: (1) certificate form never says what to bring or how long it takes before he starts; (2) some headings/labels still English ("Prayer Request Form", "Upcoming Mass Scheduled", "Daily Readings", "Forms and Song Lyrics"); (3) re-run PV-2/3/7/8/10 once Mass, downloads and GKK data are seeded.

## Mission results
| Mission | Result | Findings |
|---|---|---|
| PV-1 First impression | PASS WITH ISSUES | PV-1, PV-2 |
| PV-2 Mass this Sunday | BLOCKED (no mass_schedules seeded; home says no Mass scheduled) | |
| PV-3 Announcements/events | SKIPPED (home list seen: dates read "12 Nob 2026", expiry shown) | |
| PV-4 Certificate request | PASS WITH ISSUES | PV-3 |
| PV-5 Status check | PASS | |
| PV-6 Prayer request | PASS WITH ISSUES | PV-4 |
| PV-7 GKK / group | SKIPPED (GKK list seen on Komunidad, search box present) | |
| PV-8 Downloads / songs | SKIPPED (page loads, nothing seeded to open) | |
| PV-9 Contact office (desktop) | SKIPPED | |
| PV-10 Blood donation | SKIPPED (landing page seen, private-by-design wording good) | |

## Findings
- **PV-1 · P3 · Copy** · Home: "Upcoming Mass Scheduled" and "Daily Readings" are English for a Bisaya-first reader; the Bible verse is the English WEB text.
- **PV-2 · P3 · Gap** · Home page: with no schedule published the Mass card just says none is scheduled; consider showing the standing weekly times or the office number.
- **PV-3 · P2 · Gap** · Certificate form (steps 1-5): nowhere before submitting does it say what to bring, how many days it takes or any fee. Only "Kinahanglan og ID inig kuha" appears at step 4. Jun doesn't know the effort before he starts.
- **PV-4 · P3 · Copy** · Prayer form heading "Prayer Request Form" is English; also the status page keeps `?ref=` of the old number in the URL after looking up another.
- Good: required-field and "98" year errors in Bisaya beside the field (see PV-4 notes); Back then forward kept the answers; submit is idempotent on double-click; reference number shown large with "I-screenshot o isulat kini".

## Boundary checks
| Check | Result |
|---|---|
| `/admin/members` signed out | redirected to `/admin/login`, no data |
| `/census` without a code | "Wala pay bukas nga census", nothing else |
| Status lookup with `CR-2026-9999` | clear "Wala namo makit-i" message, no details |
| Prayer wall after PV-6 | neither request appears |
| Network | no response containing `households`, `members` or `certificate_requests` rows |
| Draft items | not checked |

## Cleanup / left for staff admin (local DB only)
- Certificate request `CR-2026-ZLTLM2` (Dela Cruz PB1112PV)
- Prayer requests id 1 (private) and id 2 (asked to be shown; unapproved, not public)
- Seed data (6 households, website sample) is local and not part of the run.
