# PRO 09: Advertising PRO inside the free app

> **Status:** proposed 2026-11-05, not started.
> **Where the code lives:** the **free** repo (it's what free parishes run).
> **Migration (free):** `supabase/migrations/0119_staff_dismissals.sql`
> (next free number at build time).
> **Ship it** in the free release that follows PRO v1 (plans 01 and 02),
> once there's something to sell and a PRO demo to show.

## Context

- Free parishes are the people most likely to buy PRO, and the admin panel
  is where their parish secretary and priest spend their time.
- The free app is used by a parish office and a priest. Advertising has to
  feel like a helpful note from the developer, never like a pop-up ad.
- Two formats, as asked:
  1. **PRO tip cards:** small, quiet cards on a few pages, each about the
     PRO module that would help on that page.
  2. **The monthly showcase:** one bigger pop-up that the decision makers
     see once, can hide for a month, and see again after that month.

## Rules that keep it respectful (decisions)

1. **Staff admin panel only.** Never on the public website, the registration
   or census pages, printed sheets or exports. Parishioners never see an ad
   on their parish's site.
2. **Only to the people who can decide:**

   | Access | Tip cards | Monthly showcase |
   |---|---|---|
   | Full access (the secretary, staff admins) | yes | yes |
   | Clergy (the parish priest) | yes | yes |
   | Website & requests | only on the Requests pages | no |
   | Read only, GKK leader | no | no |
   | Demo (shared demo login) | yes | yes, remembered per device |

3. **Never in the way.**
   - One tip card at a time, at most.
   - Nothing while a drawer, dialog or the command palette (Ctrl+K) is open,
     or while a form has unsaved changes. If one opens, the card goes away.
   - Never during a sign-in, a password change or the idle sign-out warning.
   - No sounds, no countdowns, no "limited time", no blinking.
   - Hidden when printing (`@media print`).
4. **New parishes get a quiet start.** Nothing at all for the first 21 days
   after an account is created, so setup and training aren't interrupted.
5. **PRO parishes aren't nagged.** No monthly showcase. Tip cards only for
   modules the parish doesn't have yet (e.g. Columbarium for a parish with
   Registers and Intentions).
6. **No prices and no tracking in the app.** The cards and the showcase link
   to your own page (`daveendev.vercel.app/pro`) for prices and the
   founding offer, so prices change without a release. The app never
   reports back who saw or clicked what.
7. **English** in the admin (like the rest of the admin panel).

## 1. PRO tip cards (the gentle ones)

### What it looks like

On a computer: a small card that slides in at the **bottom-right**, about
4 seconds after the page opens, 320 px wide, over nothing important (it
sits above the page's bottom padding). On a phone or tablet: the same card
**in the page flow**, at the bottom of the page, never floating over content.

```
┌──────────────────────────────────────┐
│ PRO TIP                           ✕  │
│ Print the certificate straight from  │
│ the register                         │
│ Find the Book/Page/No. entry and     │
│ print it with the parish template.   │
│                                      │
│ [ See how it works ]   Not now       │
└──────────────────────────────────────┘
```

- **See how it works** opens the in-app PRO page on that module
  (`/admin/pro#registers`).
- **Not now** or **✕** hides **that card** for 30 days for this account.
- **Don't show PRO tips** (a small link on the PRO page) turns off every tip
  card for this account for 90 days.
- If the card isn't touched, it slides away by itself after 20 seconds and
  doesn't come back during that session.

### Where they appear (one card per page)

| Page | Card | Module |
|---|---|---|
| Requests → Certificates | Print the certificate straight from the register | 01 Registers |
| Sacraments | Keep the Baptism, Confirmation, Marriage and Burial books in the app | 01 Registers |
| Parish Website → Mass schedule | Take Mass intentions and print the list for each Mass | 02 Intentions |
| Requests → Blood calls | Text every compatible donor at once | 03 SMS |
| Parish Website → Announcements | Send the announcement by text to every household | 03 SMS |
| Parish Website → Sacrament guides | Let families book baptism dates online | 04 Bookings |
| Reports | A monthly financial report for the Finance Council | 05 Cashbook |
| Dashboard | One of the above, the one shown least recently | any |

### How often

- At most **once per page per session**, and at most **3 cards a day** per
  account.
- When several cards fit, the one shown least recently goes first.
- Nothing on pages where people do data entry for long stretches: the
  household and member drawers, Census recording, New household.

## 2. The monthly showcase (the "annoying" one)

### What it looks like

A centered dialog (a bottom sheet on phones), shown on the **Dashboard**,
a moment after the page loads.

```
┌───────────────────────────────────────────────────────────┐
│                                                        ✕  │
│  Do more with your registry: PRO modules                  │
│  Made by DaveenDev, the developer of this registry.       │
│                                                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ [screenshot] │ │ [screenshot] │ │ [screenshot] │       │
│  │ Registers &  │ │ Mass         │ │ Texts (SMS)  │       │
│  │ certificates │ │ intentions   │ │ to parishion-│       │
│  │ Print from   │ │ Counter entry│ │ ers, GKKs,   │       │
│  │ the Libro    │ │ and the list │ │ donors       │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                           │
│  Your current registry stays free. PRO adds to it; it     │
│  never takes anything away.                               │
│                                                           │
│  [ See PRO modules ]  [ Try the PRO demo ]                │
│                                    Remind me in a month   │
└───────────────────────────────────────────────────────────┘
```

- **See PRO modules** → the in-app PRO page.
- **Try the PRO demo** → the PRO demo site in a new tab (its "Login to Demo
  Site" button needs no password).
- **Remind me in a month**, **✕**, Esc and clicking outside all do the same
  thing: hide it for **30 days** for this account.
- Every button also counts as "seen": it won't show again for 30 days,
  whichever button was pressed.

### When it shows

All of these must be true:

- the account is Full access or Clergy (or the shared Demo login);
- the account is at least 21 days old;
- the parish has no PRO license (no PRO modules installed);
- it hasn't been hidden in the last 30 days;
- it hasn't shown in this session;
- no drawer or dialog is open (if one is, it waits for the next time the
  Dashboard opens).

The three modules shown are the three most useful the parish doesn't have,
in the order 01, 02, 03, 04, 05.

## 3. The in-app PRO page

`/admin/pro` (sidebar: **Settings → PRO modules**, no badge, no count):

- One section per module (01–07): what it does in two lines, a screenshot,
  "Try it on the PRO demo".
- "How it works": your registry stays free and keeps every feature; PRO is a
  separate license per parish; the parish keeps its own accounts and data;
  one update adds PRO, with nothing to set up again.
- **Ask about PRO:** opens an email to you with the parish's name and the
  modules ticked on the page already filled in (`mailto:`), plus a link to
  `daveendev.vercel.app/pro` for prices.
- "Don't show PRO tips" (for this account, 90 days).
- On a PRO parish, the same page shows which modules it has, its
  `updates_until` date, and the modules it could still add.

## Data model: `0119_staff_dismissals.sql` (free)

Hiding has to follow the account, not the device: staff sign in on the office
computer and on their phones.

```sql
-- What each staff account has hidden, and until when. Used by the PRO tips
-- and the monthly showcase (and free for any other "don't show again").
create table if not exists staff_dismissals (
  user_id      uuid not null references auth.users(id) on delete cascade,
  key          text not null,            -- 'pro-showcase', 'pro-tip:registers-certificates', 'pro-tips-all'
  hidden_until timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, key)
);

alter table staff_dismissals enable row level security;
drop policy if exists staff_dismissals_own on staff_dismissals;
create policy staff_dismissals_own on staff_dismissals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on staff_dismissals to authenticated;
```

- The **Demo** login is shared by everyone trying the demo, so for it the
  hiding is kept in the browser instead (`localStorage`, wrapped in
  try/catch), per device.
- If saving fails (offline), the browser's copy is used for that device and
  the save is tried again next time.
- Shown-this-session and the 3-a-day count live in `sessionStorage` /
  `localStorage`; nothing about them is sent anywhere.
- Not in the activity log (it's a personal preference, like
  `staff_notify_prefs`).

## Code (free repo)

```
client/src/lib/proPromo.js              the cards and showcase content, and the rules
                                         (who, where, how often, hidden until)
client/src/components/promo/ProTipCard.jsx
client/src/components/promo/ProShowcaseDialog.jsx
client/src/pages/admin/ProInfo.jsx       the /admin/pro page
client/public/pro/*.webp                 small screenshots from the PRO demo (lazy-loaded)
client/test/proPromo.test.js
```

- **One place decides everything:** `AdminLayout.jsx` renders one
  `<ProTipCard />` and one `<ProShowcaseDialog />`; `proPromo.js` picks what
  (if anything) to show for the current route, account and parish. No page
  gets its own ad code, so tuning or removing it is one file.
- **Which modules a parish already has** comes from the foundation's
  `client/src/pro/index.js` registry (the module folders present). A free
  parish has none, so it sees everything; a PRO parish sees only what it's
  missing. No database call is needed for this.
- Content (titles, two-line texts, screenshot names, the PRO page text) is
  plain data in `proPromo.js`, updated with releases.
- Links out (`daveendev.vercel.app/pro`, the PRO demo address) are constants
  in one place.
- The dialog uses the existing dialog styles (`components/ConfirmDialog.jsx`,
  `components/ui.jsx`), traps focus, and closes with Esc. The card has
  `role="complementary"` and an accessible label, and the ✕ button has
  `aria-label="Hide this tip"`.
- Works in dark mode and every parish colour theme (`ThemeContext.jsx`).

## README and licence

- README, "Free for your parish": add one line: "The admin panel shows the
  occasional note about PRO modules, which staff can hide." The free
  licence doesn't require keeping them; only the "Built For Free by
  DaveenDev" credit is required, as now.
- Self-managed copies get the same notes. A parish that removes them may;
  they're a convenience, not a condition.

## Steps

1. `0119_staff_dismissals.sql`; run on demo.
2. `proPromo.js` with the rules, and its tests (below), before any UI.
3. `ProTipCard` and its place in `AdminLayout`; the seven page cards.
4. `ProShowcaseDialog` on the Dashboard.
5. `/admin/pro` page and the sidebar item.
6. Screenshots from the PRO demo, compressed (`webp`, under 80 KB each).
7. Your page `daveendev.vercel.app/pro`: modules, prices, the founding
   offer, the PRO demo link, how to ask.
8. README line, release notes (the free release that ships it), and
   `docs/beta-testing/` checks (below).

## Testing

`client/test/proPromo.test.js` (Node's test runner, like the other client
tests), for the rules in `proPromo.js`:

- PROMO-01 Read only and GKK leader accounts get no card and no showcase.
- PROMO-02 Website & requests gets cards only on the Requests pages, never
  the showcase.
- PROMO-03 An account 20 days old gets nothing; 21 days, it does.
- PROMO-04 Showcase hidden on day 0 → not shown on day 29 → shown on day 30.
- PROMO-05 A card hidden for 30 days doesn't stop the other cards.
- PROMO-06 "Don't show PRO tips" hides every card for 90 days, not the
  showcase.
- PROMO-07 A PRO parish with Registers and Intentions: no showcase; no
  Registers or Intentions cards; the SMS card still shows on Blood calls.
- PROMO-08 Three cards in a day, then none until the next day.

Browser checks (`docs/beta-testing/`):

- PROMO-B1 Open a household drawer while a card is showing: the card goes
  away and doesn't come back on that page.
- PROMO-B2 Phone width: the card sits at the bottom of the page and covers
  nothing; the showcase is a bottom sheet that scrolls.
- PROMO-B3 Hide the showcase on the office computer: it doesn't show on the
  same account's phone.
- PROMO-B4 Demo login on two browsers: hiding on one doesn't hide it on the
  other.
- PROMO-B5 Print a household sheet and a report with a card on screen:
  neither the card nor the dialog prints.
- PROMO-B6 The public website, registration and census pages never show
  either, signed in or not.
- PROMO-B7 Dark mode and two colour themes: readable.

## Open questions

- Should the parish priest (Clergy) get the showcase, or only full access?
  (Default: both, since the priest usually decides.)
- 30 days for the showcase and for a hidden card, 90 for "Don't show PRO
  tips": right, or longer for the cards?
- Your PRO page on `daveendev.vercel.app`: ready before this ships?
