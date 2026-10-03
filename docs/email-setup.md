# Email: password reset through the parish Gmail

Staff who forget their password can press **Forgot password?** on the staff
sign-in page and get a reset link by email. Supabase's own login system
(Supabase Auth) sends that email through the parish Gmail account. It's free
and needs no custom domain.

Why not send from the site itself? Supabase Edge Functions can't open SMTP
connections (ports 25, 465 and 587 are blocked), so the site can't talk to
Gmail directly. Supabase Auth can, and it's the part that sends login
emails anyway.

Staff admins can still reset a password by hand under **Settings → Staff**
(a temporary password the person changes on their next sign-in). Use that
for staff whose account email isn't a real inbox: a reset link only reaches
a mailbox someone reads.

## 1. Run the migration

Run [`0036_email_integration.sql`](../supabase/migrations/0036_email_integration.sql)
in the Supabase SQL editor. It adds the parish email fields shown in
**Parish Config → Platform Integrations → Email** (staff admins only). No
password is stored in the database.

## 2. Create a Gmail App Password

On the parish Gmail account:

1. Google Account → **Security** → turn on **2-Step Verification** (App
   Passwords need it).
2. Google Account → **Security** → **App passwords** (or search "App
   passwords" in the account settings). Create one, e.g. named "Parish
   registry". Copy the 16-letter password; Google shows it once.

Gmail allows about 500 emails a day, far more than password resets need.

## 3. Point Supabase Auth at the parish Gmail

Supabase dashboard → your project → **Authentication → Emails → SMTP Settings**:

| Setting | Value |
| --- | --- |
| Enable custom SMTP | on |
| Sender email | the parish Gmail address |
| Sender name | e.g. Our Lady of Guadalupe Quasi-Parish |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the parish Gmail address |
| Password | the App Password from step 2 (no spaces) |

Use the same sender email and name as in Parish Config → Platform
Integrations → Email, so staff recognise the message.

Optional: **Authentication → Emails → Templates → Reset Password** lets you
reword the email (e.g. in Bisaya). Keep `{{ .ConfirmationURL }}` in it; that's
the link.

Supabase also limits how many auth emails go out per hour
(**Authentication → Rate Limits**). The default is fine for a parish office.

## 4. Allow the reset link to come back to the site

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://olgqp-registry.vercel.app`
- **Redirect URLs:** add `https://olgqp-registry.vercel.app/**`, and
  `http://localhost:5173/**` for local development.

Without these, the link in the email opens the home page in place of the
"Choose a new password" page.

## 5. Test it

Parish Config → **Platform Integrations** → Email → **Send test reset email**.
It goes to your own sign-in email. When it arrives, press **Yes, it arrived**;
the card then shows **Password reset working**. You don't have to use the
link; your password only changes if you do.

If it doesn't arrive: check the spam folder, that the App Password was pasted
without spaces, that the port is 465 and the sender email is the same Gmail.
**Authentication → Logs** in Supabase shows why an email failed.

## How the reset works

1. **Forgot password?** on `/admin/login` → enter the sign-in email → **Send
   reset link**. The reply is the same whether or not the email is a staff
   account, so nobody can use it to find out who has an account.
2. The email's link signs the person in for that purpose only and opens
   `/admin/change-password?reset=1`, where they choose a new password
   (at least 10 characters) without the old one. The link works once, for an
   hour.
3. That page only skips the old password for a session that came from a reset
   link (Supabase marks it in the sign-in token). Someone at an unattended,
   signed-in computer can't use it to change the password; Parish Config →
   Change password still asks for the current one.
