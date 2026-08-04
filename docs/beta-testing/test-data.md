# Test data reference

What `npm run db:demo` loads, so you can tell "the app is wrong" apart from
"that is simply what the sample data says".

All names, addresses and contact numbers are fictional.

## Load, reset, reload

```bash
npm run db:demo                  # loads the sample set into an empty register
npm run db:demo -- --replace --yes   # wipes and reloads it
npm run db:reset -- --yes        # empties households and members only
npm run db:reset -- --all --yes  # also restores stock GKKs, ministries, orgs and the seed admin
```

`db:demo` refuses to run if the register already has records, so sample data can
never end up mixed into real parishioner entries. Nothing destructive runs
without `--yes`.

## Totals

| | Count |
|---|---|
| Households | 6 |
| Members | 16 |
| Verified households | 3 |
| Pending households | 3 |

If any screen disagrees with these numbers on a freshly loaded database, that is
a bug worth reporting.

## Households

| Household | GKK | Status | Members |
|---|---|---|---|
| Dela Cruz Family | GKK San Isidro | Verified | 4 |
| Reyes Family | GKK San Isidro | Pending | 3 |
| Santos Family | GKK San Lorenzo Ruiz | Verified | 2 |
| Mendoza Family | GKK San Pedro Calungsod | Pending | 2 |
| Tan Family | GKK Sto. Niño | Verified | 3 |
| Bautista Family | GKK San Lorenzo Ruiz | Pending | 2 |

## Sacraments across the 16 members

| Sacrament | Recorded | Missing |
|---|---|---|
| Baptism | 16 | 0 |
| First Communion | 14 | 2 |
| Confirmation | 10 | 6 |
| Matrimony | 8 | 8 |

## Groups in use

**Ministries:** Choir · Lector & Commentator · Catechist · Altar Servers ·
Ushers & Collectors · Sacristan / Money Counters · Kaabag

**Organizations:** Youth Ministry · Knights of Columbus · Catholic Women's
League · Legion of Mary · Parish Pastoral Council · Couples for Christ (CFC)

The pick-lists also contain groups nobody is assigned to — those are the ones to
use when a playbook asks you to delete an unused group.

## Blood types

Every type from A+ to O− appears at least once, and at least one member has none
recorded, so the blood-type directory and the *Unknown* filter both have
something to show.

## Reference numbers

Reference numbers look like `OLG-2026-K7P2XM`:

- `OLG` — the parish
- the year of registration
- six characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`

`0`, `O`, `1` and `I` are deliberately excluded so the number can be read aloud
and copied off paper without ambiguity. A reference number containing any of
those four characters is a bug.

## Values worth testing with

When a playbook asks you to invent a record, these are useful because they have
caught problems before:

| Kind | Value |
|---|---|
| Name with a comma | `Bautista, Jr. Family` |
| Name with an apostrophe | `O'Brien Family` |
| Name with ñ | `GKK Sto. Niño`, `Peña` |
| Long single word | `Kabankalanguemadeupname` |
| Long address | `Purok 3, Blk 14 Lot 22, Sitio Mahayahay` |
| ZIP with leading zero | `09400` |
| Very old date of birth | `1925-03-04` |
| Newborn | today's date |
| Leap day | `2000-02-29` |
| Formula-looking text | `=SUM(A1,A2)` — for CSV export checks |
| Script-looking text | `<b>Test</b>` — must display as literal text, never as bold |
