-- Men-only ministries: only male members may be added to Kaabag. Run after
-- 0037_notify_member_requests.sql. Safe to re-run.
--
-- The rule lives on the ministry (men_only), so it follows a rename. The
-- admin's pickers grey the choice out (client/src/lib/ministries.js); this
-- trigger refuses it when a member's ministries are changed (the roster's
-- Add member, the member window). Members already in a men-only ministry stay
-- in it, a correction to their sex still saves, and a Trash restore (an
-- insert) puts them back as they were: only a new joining is refused. New
-- households (also an insert) are gated in the New Household panel.

alter table ministries add column if not exists men_only boolean not null default false;

update ministries set men_only = true where lower(trim(name)) = 'kaabag' and not men_only;

create or replace function public.members_men_only_ministries() returns trigger
language plpgsql set search_path = public as $$
declare
  refused text;
begin
  -- Men, and the rename below (it rewrites the name on every member), pass.
  if coalesce(new.sex, '') = 'Male' or current_setting('app.renaming_ministry', true) = 'on' then
    return new;
  end if;
  select string_agg(m.name, ', ' order by m.name) into refused
  from ministries m
  where m.men_only
    and m.name = any(coalesce(new.ministries, '{}'))
    and not (m.name = any(coalesce(old.ministries, '{}')));
  if refused is not null then
    raise exception '% is for men only.', refused using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_members_men_only on members;
create trigger trg_members_men_only before update of ministries on members
for each row execute function public.members_men_only_ministries();

-- As in 0003, and it tells the trigger above that this is a rename, so a
-- men-only ministry can be renamed while a woman is still listed in it.
create or replace function public.rename_ministry(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update ministries set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  perform set_config('app.renaming_ministry', 'on', true);
  update members set ministries = array_replace(ministries, old_name, trim(new_name))
  where old_name = any(ministries);
  perform set_config('app.renaming_ministry', 'off', true);
end;
$$;
