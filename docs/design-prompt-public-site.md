# Design prompt: Parish public website (Our Lady of Guadalupe Quasi-Parish, Mua-an)

Paste everything below the line into the AI designer. Attach `project/Registration Portal.dc.html` and `project/Admin Panel.dc.html` so it can match the existing look.

---

## Who you are designing for

Design the public-facing website for **Our Lady of Guadalupe Quasi-Parish, Mua-an, Kidapawan City, North Cotabato** (Philippines). Today the public side has only a landing page, a 5-step household registration wizard, and a census update portal. We want to turn it into a useful parish website that parishioners return to every week, while keeping every family's personal data private.

**Audience**
- Parishioners of all ages, including many older people and first-time smartphone users.
- Most visitors use **budget Android phones on slow mobile data**. Design mobile-first (360px wide) and scale up to desktop.
- Main language: **Bisaya (Cebuano)**. Use Bisaya for all labels and copy, with English only where people actually say it in English (e.g. "Mass", "GKK", "Census", "Blood type"). Mark any Bisaya you are unsure of with `[review]` so a native speaker can check it.
- Secondary audience: GKK coordinators and ministry heads checking how their group is doing.

**Tone:** warm, welcoming, reverent and plain-spoken. Not corporate, not churchy-ornate. Big readable text, generous tap targets (minimum 44px), one clear action per screen.

## Visual system (keep consistent with the existing app)

- **Fonts:** Cormorant Garamond (serif) for headings and big numbers; Source Sans 3 for body and UI.
- **Neutrals stay fixed:** parchment page background `#f7f2e8`, cards `#fffdf8`, borders `#ece2cd`, ink `#17263f`, muted text `#8a836f`, secondary text `#6b6552`.
- **Status colours stay fixed:** success `#2f6b48` on `#eaf4ee`; error `#a13d29` on `#fbeeea`.
- **Brand colours are themeable.** The site has 8 themes that only swap the accent variables `--p-blue`, `--p-blue-deep`, `--p-navy`, `--p-gold`, `--p-gold-light`, `--p-gold-deep`. The default is Gold & Navy (`#34589c` blue, `#c39b4e` gold, `#1a2b4a` navy). Use only these variables for brand colour so every theme works. There's a "Kolor" theme picker in the top-right corner. Keep it.
- **Existing patterns to reuse:** rounded-2xl cards with a soft navy shadow; small uppercase gold "eyebrow" labels with wide letter-spacing; serif stat numbers in brand blue; the parish logo (or a gold cross) above the parish name; a soft radial parchment gradient on the hero; fade-up entrance animation.
- **Technology:** React + Tailwind CSS, data from Supabase. Use plain HTML/CSS patterns that map cleanly to Tailwind. No heavy imagery: pages must load fast on 3G, so use SVG icons and optional lazy-loaded photos.

## Privacy rules (non-negotiable; reflect them in the design)

The registry holds personal data protected by the Philippine Data Privacy Act of 2012.
1. **No member names, birthdays, addresses, blood types, sacrament records or census status anywhere public.** The only exceptions are people who have explicitly agreed to be shown (officers, coordinators, contact persons).
2. **Counts only, and small counts are hidden.** Any number below 5 shows as "Ubos sa 5" ("fewer than 5") or as a dash, never the exact figure. Show this state in the designs.
3. Every request form has a short consent line and says who will see the information.
4. Opted-in people show a photo (or initials avatar), name, role and an optional contact button. Show the empty state for when nobody has opted in yet.

## Site structure

Design a public navigation that works on mobile (bottom tab bar or compact header with menu, your call) and on desktop (top nav). Suggested sections:

| Section | Pages |
|---|---|
| **Home** (`/`) | Hero, "Parish at a glance", next Masses today, latest announcements, upcoming events, quick links |
| **Misa ug Sakramento** | Mass & confession schedule, Events calendar |
| **Pahibalo ug Kalihokan** | Announcements list + detail, Weekly bulletin |
| **Mga Sakramento** | Requirements & steps per sacrament, Sacrament milestones |
| **Komunidad** | GKK directory + detail, Ministries & organizations + detail, Parish organization structure, Census progress |
| **Mga Serbisyo** | Check my registration, Certificate request, Prayer request, Blood donor call |
| **Kontak** | Office hours, contact, map |

The existing **"Irehistro ang Inyong Pamilya"** (register your family) call to action must stay the most prominent action on Home. Keep the existing census-update button too ("Narehistro na? I-update ang inyong rekord"); it only appears while a census is open. Keep the "Kawani sa parokya? Mag-sign in" staff link in the footer.

---

## Part 1: Pages built from data we already have

### 1.1 Parish at a glance (Home section + optional full page)
Stat cards for: **members, households, GKKs, ministries, organizations, registrations this year**. Big serif number, small uppercase label. Optional small "updated today" timestamp. Design the loading skeleton and the "Ubos sa 5" state.

### 1.2 GKK directory
- List or grid of all GKKs (roughly 10–30). Each card shows: GKK name, area / puroks covered, number of registered households, meeting or Bible-sharing schedule (e.g. "Matag Huwebes, 7:00 PM"), and the coordinator (photo, name, contact button) **only if they opted in**. Otherwise show "Pangutan-a ang opisina sa parokya" ("ask the parish office").
- Search box: "Asa ka nagpuyo?" ("where do you live?"), which matches puroks/areas, to help families find their GKK.
- GKK detail page: the same info, larger, plus a "Mao ni ang akong GKK, magparehistro" ("this is my GKK, register") button that opens the registration wizard with this GKK pre-selected.
- In the registration wizard's GKK step, add a small "Dili sigurado? Tan-awa ang GKK directory" ("not sure? see the GKK directory") helper that opens the directory in a bottom sheet.

### 1.3 Census progress by GKK
- Only visible while a census is open (and optionally for 30 days after it closes, showing final results).
- Headline: "Census 2026: 62% sa mga pamilya na-update na" with one large progress ring or bar.
- One horizontal bar per GKK showing the percentage of households updated, sortable by name or progress. Show percentages only, no household names. Gently celebrate GKKs at 100% (gold badge "Kompleto!").
- Encouraging, non-shaming copy. Low GKKs are not shown in red; use neutral colours.
- A clear button to the census update portal.

### 1.4 Ministries & organizations
- Two tabs or filters: **Ministries** and **Organizations**. Card per group: icon, name, one-line purpose, member count (respecting the "fewer than 5" rule).
- Detail page: what the group does, who can join (age, requirements), when and where it meets, contact person (opted-in only), member count, and an **"Interesado ko" ("I'm interested")** button.
- "I'm interested" opens a short form: name, mobile number, GKK, optional message, consent checkbox. Success screen: "Salamat! Kontakon ka sa among kawani." The submission goes to a staff follow-up queue (see Part 4).

### 1.5 Parish organization structure
- An org chart: Parish Priest / Administrator at the top, then the Parish Pastoral Council officers, then committee and ministry heads. Each node: photo (or initials avatar), name, position.
- Only opted-in people appear; positions with no opted-in holder show the position title with "—".
- On mobile, collapse the chart into a nested, indented list grouped by level. A horizontal-scrolling tree is not acceptable on phones.

### 1.6 Check my registration
- Single input: reference number (format like the one printed on the confirmation slip; show where to find it with a small illustration of the slip).
- Results:
  - **Nadawat (Received):** "Nadawat namo ang inyong rehistro sa [date]. Gisusi pa sa kawani."
  - **Napamatud-an (Verified):** green check, "Napamatud-an na ang inyong rehistro."
  - **Kinahanglan og koreksyon (Needs correction):** amber, short staff note, and a button to the census/update portal or the office contact.
  - **Not found:** friendly help text and the office contact.
- Show only the household name and status, never member details. Add rate-limit/error copy ("Daghan na kaayo nga pagsulay. Sulayi pag-usab sa ulahi.", "too many tries, please try again later").

### 1.7 Sacrament milestones for the year
- One celebratory strip or card: "Karong 2026: 84 ang nabunyagan · 23 ang nakasal · 140 ang nakumpirmahan · …". Include First Communion too.
- Optional small month-by-month sparkline per sacrament. Totals only, with the "fewer than 5" rule applied.

---

## Part 2: Content staff will type in

Design both the **public view** and a **simple staff editing screen** for each (see Part 4 for the admin style).

### 2.1 Mass & confession schedule
- Weekly grid grouped by day: time, type (Sunday Mass, weekday Mass, Anticipated Mass, Confession, Adoration), **location** (main church or a named chapel), **language** badge (Bisaya / English).
- Filters: location and language. On Home, a "Misa karong adlawa" ("Masses today") card shows the next 1–3 times, with "next" highlighted.
- A "special schedule" banner for Holy Week, fiesta, Christmas (Simbang Gabi) and cancellations.

### 2.2 Sacrament requirements & steps
- Index of sacraments and services: **Bunyag (Baptism), Kumpil (Confirmation), Unang Kalawat (First Communion), Kasal (Wedding), Lubong (Funeral), Panalangin (Blessings of house, vehicle, business)**.
- Each page: short intro, **step-by-step timeline** (e.g. wedding: inquire → seminar → interview → banns → rehearsal → wedding), **checklist of documents** (tickable on the page, purely for the visitor's own use), fees/stipend note if the parish chooses to publish it, schedule of seminars, "how far ahead to book", and a contact button.
- Must be printable and easy to screenshot and share on Facebook Messenger.

### 2.3 Announcements & weekly bulletin
- Announcement card: title, date, category tag (Parokya, GKK, Ministry, Urgent), short excerpt, optional image. Urgent announcements get a dismissible banner on Home.
- Detail page with share button.
- Weekly bulletin: archive list by week; each opens a readable page or a PDF download (show file size, since data is expensive).

### 2.4 Events calendar
- Month view on desktop; on mobile, an agenda (list) view grouped by date.
- Event types with colour + icon: Fiesta, Novena, Recollection/Retreat, GKK rotation (e.g. "Bisita sa Birhen sa GKK 5"), Seminar, Meeting.
- Event detail: date/time, location, description, organizer, "Add to calendar" (.ics) button.
- Multi-day events (novenas: 9 days) render as a span.

### 2.5 Office hours, contact & map
- Office hours table with "Abli karon" / "Sirado karon" (open/closed now) live badge.
- Mobile number(s) with tap-to-call and tap-to-text, Facebook page link, email.
- Embedded map (lightweight static map image that opens Google Maps on tap) plus a written address and landmark directions.
- Emergency sick-call / anointing number highlighted separately.

---

## Part 3: Request forms that feed a staff queue

All forms: short, one column, big inputs, mobile number as the main contact (email optional), consent line, a summary on a review step before sending, and a success screen with a **request reference number** and what happens next. Design validation errors and an offline/failed-submit state.

### 3.1 Certificate request
- Type: Baptismal, Confirmation, Marriage certificate.
- Fields: name on the record, date (or approximate year) and place of the sacrament, parents' names (baptismal), spouse's name (marriage), purpose (school, employment, marriage, other), number of copies, pick-up preference, requester name and mobile, relationship to the person.
- Note: "Kinahanglan og ID inig kuha" ("bring an ID at pick-up"), plus processing time and fee note.
- Success screen: reference number plus "Check status" link (re-use the 1.6 lookup pattern for request status: Nadawat → Giandam → Andam na kuhaon / Received → Being prepared → Ready for pick-up).

### 3.2 Prayer request
- Fields: intention (text), type (para sa masakiton (for the sick), pasalamat (thanksgiving), para sa namatay (for the departed), uban pa (other)), optional name, and "Ipahibalo sa publiko?" ("make public?"), default **No**.
- Explain clearly who reads it (the parish priest / prayer ministry). Gentle, quiet visual treatment.

### 3.3 Blood donor call
- **Public side has two entry points:**
  1. **"Nanginahanglan og dugo" ("need blood")**: request form with patient's blood type, hospital, units needed, needed-by date, contact person and mobile, and consent to be contacted.
  2. **"Gusto ko mo-donate" ("I want to donate")**: opt-in for registered parishioners to be contacted for blood calls (name, mobile, blood type if known, consent, and a note that they can opt out anytime).
- **No donor list, no counts by blood type and no names are ever shown publicly.** Copy should say: "Ang among kawani ang mokontak sa mga donor nga mohaum, sa pribado." ("our staff will privately contact matching donors").
- Optional: public "urgent call" banner (blood type + hospital only, no patient name) shown **only if the requester consented**.

---

## Part 4: Staff (admin) screens for the new content

The admin panel already exists (attached `Admin Panel.dc.html`): dark themed sidebar using `--p-sidebar-a` / `--p-sidebar-b`, parchment content area, cards, side-panel drawers for editing. Add these screens in the same style:

1. **Website content**: sub-pages for Mass schedule, Sacrament guides, Announcements, Bulletin, Events, Office & contact. Simple list + side-panel editor; "Published / Draft" toggle; preview-as-public button.
2. **GKK & group details**: extra fields on existing GKK, ministry and organization records (area/puroks, schedule, description, who can join, contact person) and an **"Ipakita sa publiko" ("show publicly") consent toggle** per person with the date consent was given.
3. **Requests inbox**: one queue with tabs: Interested (ministry sign-ups), Certificates, Prayer requests, Blood requests, Blood donors. Each row: reference, type, date, status chip, assigned staff. Detail drawer with status changes, notes, and call/SMS buttons. Badge counts on the sidebar item and a card on the existing dashboard.
4. **Blood call matching**: from a blood request, show the count of matching opted-in donors and a "contact list" for staff only, with mark-as-contacted / agreed / declined per donor.
5. **Registration status**: a "Needs correction" status with a note field, alongside the existing Verify / Unverify.

---

## Deliverables

1. Mobile (360px) and desktop (1280px) designs for: Home, Mass schedule, GKK directory + detail, Census progress, Ministry list + detail with "I'm interested" flow, Org structure, Check my registration (all 4 result states), one Sacrament guide (Wedding), Announcements list + detail, Events (month + agenda), Contact, Certificate request flow, Prayer request, Blood donor call (both forms).
2. Admin: Website content editor (Mass schedule + Announcement), Requests inbox + detail drawer, Blood call matching.
3. For every data-driven component, show **loading, empty, "fewer than 5", and error** states.
4. A short component inventory: nav, stat card, schedule row, progress bar, person card (opted-in), status chip, request form step, banner.
5. Check every screen in at least two themes (Gold & Navy and Emerald & Champagne; values in Appendix A) to prove the accent variables are used correctly.
6. Accessibility: WCAG AA contrast on parchment, visible focus rings, labels on every input, no information conveyed by colour alone.

---

## Appendix A: Theme palettes

Every theme sets the same nine CSS variables. Design with **Gold & Navy** and check with **Emerald & Champagne**; the other six are listed so you can spot-check.

| Variable | Used for | Gold & Navy (default) | Emerald & Champagne (second) |
|---|---|---|---|
| `--p-blue` | primary buttons, links, stat numbers | `#34589c` | `#1f6d4c` |
| `--p-blue-deep` | button hover/pressed, strong headings | `#26436f` | `#155038` |
| `--p-blue-light` | secondary accents, chart fills | `#4a71b8` | `#3f9c74` |
| `--p-navy` | page titles, darkest brand text | `#1a2b4a` | `#123726` |
| `--p-gold` | cross/logo, highlights, badges | `#c39b4e` | `#c2a45a` |
| `--p-gold-light` | soft highlights, celebration accents | `#e4c06a` | `#e6c97e` |
| `--p-gold-deep` | eyebrow labels (gold text on parchment) | `#a98a3f` | `#96793a` |
| `--p-sidebar-a` | admin sidebar gradient top | `#20406b` | `#12432f` |
| `--p-sidebar-b` | admin sidebar gradient bottom | `#152c4c` | `#0c2e20` |

Derived tints (computed from the theme, so they follow it automatically):
- `--p-blue-tint` = 9% `--p-blue` mixed into white (selected rows, soft panels)
- `--p-blue-tint-strong` = 16% `--p-blue` into white
- `--p-blue-border` = 40% `--p-blue` into white
- `--p-gold-tint` = 14% `--p-gold` into white

Other themes (`--p-blue` / `--p-blue-deep` / `--p-blue-light` / `--p-navy` / `--p-gold` / `--p-gold-light` / `--p-gold-deep` / `--p-sidebar-a` / `--p-sidebar-b`):

| Theme | Values |
|---|---|
| Burgundy & Champagne | `#7a2e3a` `#5c2029` `#a85361` `#3a151b` `#c9a45c` `#e8c886` `#a17d3d` `#5c1d27` `#3a121a` |
| Royal Purple & Gold | `#5b3a8a` `#402768` `#8163b3` `#2c1a4d` `#c9a24c` `#e8c977` `#a17c34` `#3f2668` `#28174a` |
| Ocean Teal & Sand | `#14707a` `#0d525a` `#3f97a1` `#0c3a40` `#c79a5a` `#e6c185` `#9c7638` `#0d525a` `#083a40` |
| Terracotta & Sage | `#b0563a` `#8a3f28` `#cd7a5d` `#5c2c1c` `#8a9a5b` `#aebd7e` `#657240` `#8a3f28` `#5c2c1c` |
| Slate & Copper | `#3d5166` `#2b3a4a` `#66809c` `#1e2833` `#b5651d` `#d98a44` `#8a4c15` `#2b3a4a` `#1a232c` |
| Rose & Charcoal | `#9c3f60` `#742c47` `#c06e8b` `#3f1926` `#b99a6a` `#d9c093` `#8f7449` `#742c47` `#4a1c2d` |

Note: in Terracotta & Sage the "gold" slot is a sage green, so never write copy or meaning that depends on the accent being literally gold.

Fixed colours (the same in every theme):

| Token | Value | Use |
|---|---|---|
| page background | `#f7f2e8` | parchment page |
| hero gradient | `radial-gradient(120% 90% at 50% -10%, #fefcf7 0%, #f7f2e8 55%, #f1ead9 100%)` | landing hero |
| card | `#fffdf8` | cards and panels |
| border | `#ece2cd` (soft: `#e0d6c1`, landing cards: `#e7dcc4`) | card and divider lines |
| ink | `#17263f` | body text |
| text 2 | `#6b6552` | secondary text |
| muted | `#8a836f` | captions, labels |
| success | text `#2f6b48`, bg `#eaf4ee`, border `#bfe0cc` | Verified, Open now |
| error | text `#a13d29`, bg `#fbeeea`, border `#f0cec3` | errors, urgent |
| card shadow | `0 12px 34px -22px rgba(23,38,63,.35)` | cards |
| button shadow | `0 10px 22px -10px rgba(52,88,156,.6)` | primary button |

There is no amber/warning token yet. Propose one for "Needs correction" and "Pending" that sits well on parchment, and show it in the component inventory.

---

## Appendix B: Real content to use

These lists come from the live parish database (the admin Settings pages). Use them exactly as written, including the spacing and hyphens.

**Parish**
- Name: **Our Lady of Guadalupe Quasi-Parish**
- Address: Purok 3, Mua-an, Kidapawan City, North Cotabato
- Landing eyebrow: "Rehistro sa mga Miyembro sa Parokya"
- Landing subtitle: "Quasi-Parish · Mua-an"
- Landing welcome text: "Maayong pag-abot! Irehistro ang inyong pamilya sa parokya aron kita magpabiling magkasinabot, magkauban sa pagsaulog sa mga sakramento, ug mag-alagaray sa usag usa diha sa pagtuo."
- Phone, email, office hours, Facebook page: **not yet in the database.** Use clearly fake placeholders (e.g. `0900 000 0000`) and label them as placeholders.

**GKKs (16).** Each name is "Patron saint / title -Area". The part after the hyphen is the barangay or sitio, so the GKK directory can **group GKKs by area** and use the area for the "Asa ka nagpuyo?" search:

| Area | GKKs |
|---|---|
| Mua-an | Birhen sa Fatima -Mua-an · Birhen sa Lourdes -Mua-an · Immaculada Conception -Mua-an |
| Balabag | San Pedro Calungsod -Balabag · Sto. Niño -Balabag |
| Birada Center | San Isidro Labrador -Birada Center · Sr. San Roque -Birada Center |
| Birada Martinez | Santa Monica -Birada Martinez · Sto. Niño -Birada Martinez |
| Ginatilan | San Jose -Ginatilan · Sto. Niño -Ginatilan |
| Meohao | San Juan Bautista -Meohao · Santo Rosario -Meohao · Sr. San Roque -Meohao |
| Lumot | Inahan sa Kanunayng Panabang -Lumot |
| Ilomavis | Sagrada Pamilya -Ilomavis |

Note that several patrons repeat across areas (three "Sto. Niño", two "Sr. San Roque"), so cards must always show the area, not just the patron.

**Ministries (7)** (the starting list; the live list may have changed in admin Settings): Choir · Lector & Commentator · Catechist · Altar Servers · Ushers & Collectors · Sacristan / Money Counters · Kaabag

**Organizations (8):** Catholic Women's League · Couples for Christ (CFC) · KFC -CFC · Knights of Columbus · Legion of Mary · Parish Pastoral Council · SFC -CFC · YFC -CFC

(KFC, SFC and YFC are the Kids, Singles and Youth branches of Couples for Christ, so the design can group them under CFC.)

**Parish organization structure: positions (13)**
- Leadership: PPC President · PPC Vice-President · PPC Secretary · PPC Treasurer · PPC Officer
- Commission heads: Worship Head · Formation Head · Service Head · Bible Apostolate Head · Family & Life Apostolate Head
- Coordinators: Catechist Diocese Coordinator · Youth Diocese Coordinator · GKK Cluster Head

Put the Parish Priest / Administrator above the PPC President. There is no name for this person in the database; use a placeholder.

**Sacraments recorded in the registry:** Bunyag (Baptism) · Unang Kalawat (First Communion) · Kumpil (Confirmation) · Kasal (Matrimony). Wedding types: "Kasal sa Simbahang Katoliko", "Kasal sa Huwes (Civil)", "Kasal sa Laing Relihiyon".

**Census member statuses** (staff-only; never shown publicly, listed so you know what the census progress counts): Active, Inactive, Moved away, Deceased, Left the Church.

**Numbers:** the live database only has test registrations so far (3 households), so use these realistic sample figures and label them as sample data:
- Members 2,340 · Households 612 · GKKs 16 · Ministries 7 · Organizations 8 · Registered this year 148
- Census progress: overall 62%; per-GKK values between 18% and 100%, with at least one GKK at 100% and one below 25%
- Sacraments this year: 84 Bunyag · 37 Unang Kalawat · 140 Kumpil · 23 Kasal
- At least one GKK household count of 3 so the "Ubos sa 5" state is visible

**No real data exists yet for:** Mass and confession times, chapels, announcements, events, sacrament requirements, fees, office hours or ministry descriptions. Write plausible Philippine-parish placeholder content (e.g. Sunday Masses 6:00 AM Bisaya, 8:00 AM English, 5:00 PM Bisaya; chapels named after the GKK areas above; Fiesta of Our Lady of Guadalupe on 12 December with a 9-day novena from 3 December; Simbang Gabi 16–24 December) and mark it as placeholder.
