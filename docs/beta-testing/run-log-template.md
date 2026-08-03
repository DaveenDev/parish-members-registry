# Beta test run log

One log per testing round. Copy this file, fill it in as you go, and attach it
to the round's ticket when you are done.

---

## Round details

| | |
|---|---|
| Round | e.g. Beta 2 |
| Date(s) | |
| Build / commit | |
| Environment URL | |
| Database state at start | `db:setup` + `db:demo`, or describe |
| Automated suite (`npm test`) | pass / fail — paste the summary line |

## Testers and coverage

| Tester | Browser + version | Device / OS | Width(s) | Playbooks run |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |

Browser matrix coverage for this round:

- [ ] Chrome (Windows)
- [ ] Chrome (Android)
- [ ] Edge (Windows)
- [ ] Firefox
- [ ] Safari (macOS)
- [ ] Safari (iOS)

---

## Results by playbook

Mark each check **P** (pass), **F** (fail), **N** (not applicable) or **–** (not
run). Put the issue number next to every F.

### 1 — Public registration

| PR-01 | PR-02 | PR-03 | PR-04 | PR-05 | PR-06 | PR-07 | PR-08 | PR-09 |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

| PR-10 | PR-11 | PR-12 | PR-13 | PR-14 | PR-15 | PR-16 | PR-17 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

| PR-18 | PR-19 | PR-20 | PR-21 | PR-22 | PR-23 | PR-24 | PR-25 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### 2 — Admin access & navigation

| AA-01 | AA-02 | AA-03 | AA-04 | AA-05 | AA-06 | AA-07 | AA-08 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

| AA-09 | AA-10 | AA-11 | AA-12 | AA-13 | AA-14 | AA-15 | AA-16 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### 3 — Households

| HH-01 | HH-02 | HH-03 | HH-04 | HH-05 | HH-06 | HH-07 | HH-08 | HH-09 |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

| HH-10 | HH-11 | HH-12 | HH-13 | HH-14 | HH-15 | HH-16 | HH-17 | HH-18 |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

### 4 — Members & sacraments

| ME-01 | ME-02 | ME-03 | ME-04 | ME-05 | ME-06 | ME-07 | ME-08 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

| ME-09 | ME-10 | ME-11 | ME-12 | ME-13 | ME-14 | ME-15 |
|---|---|---|---|---|---|---|
| | | | | | | |

| SA-01 | SA-02 | SA-03 | SA-04 |
|---|---|---|---|
| | | | |

### 5 — Ministries, organizations & parish config

| GR-01 | GR-02 | GR-03 | GR-04 | GR-05 | GR-06 | GR-07 | GR-08 | GR-09 |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

| GR-10 | GR-11 | GR-12 | GR-13 | GR-14 | GR-15 | GR-16 | GR-17 |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

### 6 — Dashboard, reports & exports

| DB-01 | DB-02 | DB-03 | DB-04 | DB-05 | DB-06 |
|---|---|---|---|---|---|
| | | | | | |

| RP-01 | RP-02 | RP-03 | RP-04 | RP-05 | RP-06 | RP-07 | RP-08 | RP-09 |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

| EX-01 | EX-02 | EX-03 | EX-04 | EX-05 | EX-06 | EX-07 | EX-08 | EX-09 |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

### 7 — Cross-cutting

| CC-01 | CC-02 | CC-03 | CC-04 | CC-05 | CC-06 | CC-07 | CC-08 | CC-09 | CC-10 |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

| CC-11 | CC-12 | CC-13 | CC-14 | CC-15 | CC-16 | CC-17 | CC-18 | CC-19 | CC-20 |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

---

## Issues raised

| # | Check | Severity | Title | Status |
|---|---|---|---|---|
| | | | | |
| | | | | |

## Notes and observations

Things that were not failures but are worth a decision — wording, missing
features, anything that confused a tester even though it worked.

-

## Environment changes made during the round

Passwords changed, GKKs or groups added, sample data reloaded — anything the
next tester needs to know.

-

---

## Exit criteria

- [ ] Every playbook run at least once on desktop
- [ ] Every playbook run at least once on a phone
- [ ] Playbooks 1 and 2 run on every browser in the matrix
- [ ] No open S1 issues
- [ ] No open S2 issues, or each has a written decision to ship with it
- [ ] `npm test` passes on the tested build
- [ ] Demo credentials removed from the sign-in page (release candidates only)

**Round outcome:** ☐ Ready to release ☐ Fix and retest ☐ Blocked

**Signed off by:** ____________  **Date:** ____________
