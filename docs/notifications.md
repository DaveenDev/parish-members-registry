# Staff notifications

The parish office hears about it when someone sends something from the
website:

| From the website | Notification | Urgent |
|---|---|---|
| Anointing of the Sick (Pangayo ug Dihog Iskedyul) | Anointing of the Sick request / gravely ill | Yes |
| Blood request | Blood request: O+ | Yes |
| Certificate request | Certificate request: Baptismal | |
| OCIA enrolment | OCIA enrolment | |
| Household registration | New household registration | |
| Census update from the family portal | Census update to review | |

Requests staff type in themselves (walk-ins, phone calls) don't notify anyone.

There are three ways staff get them:

1. **The bell** in the admin panel (top of the sidebar; top bar on phones). It
   updates live, plays a short chime and shows a toast with **Open**, and the
   browser tab shows the count, e.g. `(2) Parish Registry`.
2. **Phone and computer notifications** (Web Push), even when the admin panel
   is closed. Each staff member turns them on per device under
   **Settings → Notifications**.
3. **The 7:00 AM summary**: one notification with what's still waiting (and
   how many have waited over 3 days). Nothing is sent when nothing is waiting.

Who sees what follows the staff access levels: full, read-only and clergy
accounts get registrations, census updates and requests; "Website &
requests" accounts get requests; GKK leaders get registrations
and census updates for their own GKK only. Disabled accounts get nothing.
Full-access accounts also get the GKK histories and GKK structures waiting
for them (0060, 0081); a GKK leader gets told when the office approves their
structure or sends it back, and nobody else sees that one.

**Privacy.** A phone's lock screen only shows the kind of request and its
reference number (e.g. *Anointing of the Sick: gravely ill — SR-2026-7KX4QM*),
never names, addresses or mobile numbers. Those stay inside the admin panel.
The morning summary only has counts.

Everything here runs on the free Supabase and Vercel plans.

## Setup

### 1. Run the migration

In the Supabase SQL editor, run
[`supabase/migrations/0034_staff_notifications.sql`](../supabase/migrations/0034_staff_notifications.sql).

That's all the bell needs. The migration also turns on two extensions that
come with every Supabase project: **pg_net** (lets the database call the Edge
Function) and **pg_cron** (runs the 7:00 AM summary). If the SQL editor says
either one isn't available, turn it on under **Database → Extensions** and run
the migration again.

### 2. Deploy the Edge Function

```bash
npx supabase functions deploy notify-staff --no-verify-jwt --project-ref <your-project-ref>
```

`--no-verify-jwt` matters: the database calls this function without a login
(it sends a secret instead), and the function checks staff logins itself.
Deploying from the dashboard instead: **Edge Functions → Deploy a new
function**, name it `notify-staff`, paste in
[`index.ts`](../supabase/functions/notify-staff/index.ts),
[`handler.js`](../supabase/functions/notify-staff/handler.js) and
[`webpush.js`](../supabase/functions/notify-staff/webpush.js), and turn
**Enforce JWT verification** off.

There are no keys or secrets to set. The first time a staff member turns
notifications on, the function makes its push keys and records its own
address in `notify_config`, which nobody signed in can read.

### 3. Turn them on, on each device

Each staff member, on each phone or computer:

- **Android or a computer** (Chrome, Edge, Firefox): open the admin panel,
  **Settings → Notifications → Turn on notifications on this device**, and
  allow them when the browser asks. A test notification arrives right away.
- **iPhone or iPad** (iOS 16.4 or newer): Apple only allows notifications for
  web apps on the Home Screen. In Safari, open the admin panel, tap
  **Share → Add to Home Screen**, open **Parish Admin** from the Home Screen,
  sign in, then **Settings → Notifications → Turn on**.

On the same page each person chooses what reaches their devices, and whether
to get the morning summary:

- **Member requests only** (the default, from
  [`0037_notify_member_requests.sql`](../supabase/migrations/0037_notify_member_requests.sql)):
  requests for Dihog (Anointing of the Sick), certificates and OCIA, the
  blood donor call (blood requests and new donors) and census updates from
  families.
- **Every new request**: the same, plus new household registrations.
- **Urgent ones only**: Anointing of the Sick and blood requests.
- **None**: nothing as it comes in.

The bell in the admin panel lists everything whatever the choice. **My devices**
lists where they're turned on; remove an old phone there.

A shared office computer belongs to whoever turned notifications on last.

## Checking it works

- **Send a test** on Settings → Notifications sends one to that device.
- Send a request from the website (e.g. a certificate request): the bell
  should ring within a second, and phones within a few seconds.
- The summary job: in the SQL editor, `select * from cron.job;` should list
  `staff-morning-digest` at `0 23 * * *` (23:00 UTC is 7:00 AM in the
  Philippines). To see a summary now: `select public.send_morning_digest();`
- If phones get nothing: **Edge Functions → notify-staff → Logs**, and in the
  SQL editor `select * from net._http_response order by created desc limit 5;`
  shows the database's calls to the function. A 401 there means the function
  was deployed with JWT verification on.

## Changing it

- **Another kind of request**: add a branch for its table in
  `notify_new_request()` and its name to the trigger list below it (both in a
  new migration), and an icon in `client/src/lib/notifications.js`.
- **Summary time**: `select cron.schedule('staff-morning-digest', '0 22 * * *', 'select public.send_morning_digest()');`
  (times are UTC; this is 6:00 AM in the Philippines).
- **No summary at all**: `select cron.unschedule('staff-morning-digest');`
