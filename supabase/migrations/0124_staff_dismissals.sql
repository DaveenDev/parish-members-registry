-- What each staff account has hidden, and until when. Used by the PRO tip
-- cards and the monthly PRO showcase in the admin panel (and free for any
-- other "don't show this again"). Hiding follows the account, not the
-- device: staff sign in on the office computer and on their phones.
-- Run after 0123_ofw_occupation_groups.sql. Safe to re-run.
--
-- keys: 'pro-showcase', 'pro-tip:<tip id>', 'pro-tips-all'
-- A personal preference, like staff_notify_prefs: not in the activity log.

create table if not exists staff_dismissals (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key          text not null check (char_length(key) between 1 and 80),
  hidden_until timestamptz not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, key)
);

alter table staff_dismissals enable row level security;
drop policy if exists staff_dismissals_own on staff_dismissals;
create policy staff_dismissals_own on staff_dismissals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on staff_dismissals from anon;
grant select, insert, update, delete on staff_dismissals to authenticated;
