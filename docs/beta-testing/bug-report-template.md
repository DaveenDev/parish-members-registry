# Bug report template

Copy everything below into a new issue, one issue per problem. If you are not
sure whether something is a bug, file it — a duplicate costs a minute, a missed
data-loss bug costs a parish record.

---

**Title:** `[CHECK-ID] one line saying what is wrong`

*Examples:*
`[HH-14] Deleting a household leaves its members in the Members directory`
`[PR-07] ZIP code drops the leading zero on iOS Safari`

---

## Severity

- [ ] **S1 Blocker** — the task cannot be completed, data is lost, or private
      data is exposed
- [ ] **S2 Major** — wrong data is shown or saved, or a workaround is needed
- [ ] **S3 Minor** — annoying, but the task still completes
- [ ] **S4 Cosmetic** — looks wrong, works fine

## Where

| | |
|---|---|
| Playbook / check ID | e.g. `03-households` / `HH-14` |
| Page or URL | e.g. `/admin/households` |
| Browser and version | e.g. Chrome 141 |
| Device and OS | e.g. iPhone 13, iOS 18 |
| Window width | e.g. 390 px |
| Signed in as | e.g. `admin@parishregistry.org` |
| Date and time | so the server log can be matched up |
| Data state | fresh `db:demo`, or describe what you had changed |

## What happened

One or two sentences, in plain language.

## What should have happened

Quote the **Expected** text from the playbook if it covers this.

## Steps to reproduce

1.
2.
3.

**Does it happen every time?**  Yes / No / Sometimes — if sometimes, say how
often (e.g. 2 times out of 5).

## Evidence

- Screenshot or screen recording (drag it in). A recording is worth far more
  than a description for anything involving timing, scrolling or animation.
- If the record is identifiable, include its reference number
  (`OLG-2026-XXXXXX`) or the family name rather than a description.

## Console output (optional but very helpful)

Press **F12** → **Console** tab, reproduce the problem, and paste anything in
red. On the **Network** tab, a failing request's status code and response are
just as useful.

```
paste here
```

## Anything else

Does it also happen in another browser? Did it work before? Did it start after a
particular action?

---

### Before you file

- [ ] I checked the [test data reference](test-data.md) — the numbers I expected
      really are what the sample data says
- [ ] I searched the existing issues for the same problem
- [ ] I included the check ID in the title
- [ ] I said which browser, device and width
- [ ] For anything involving data, I said whether the change survived a reload

### Do not include

Real parishioner names, real addresses, real contact numbers, or a real
password. Beta testing runs on fictional data; if you found a problem with real
data, describe it without reproducing the data itself.
