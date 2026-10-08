-- Sacrament requests (OCIA, Anointing of the Sick) can be linked to the
-- person's member record, like certificate requests (0012). The member's
-- record then lists the request, so a finished OCIA or anointing shows
-- there. Run after 0073_census_edit_delete.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.sacrament_requests') is null then
    raise exception 'Run 0032_sacrament_requests.sql before this migration';
  end if;
end;
$$;

alter table sacrament_requests add column if not exists member_id integer references members(id) on delete set null;
create index if not exists sacrament_requests_member_idx on sacrament_requests (member_id);
