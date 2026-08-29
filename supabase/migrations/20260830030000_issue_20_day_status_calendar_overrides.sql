create table public.day_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  status text not null check (status in ('LEAVE', 'REMOTE', 'BUSINESS_TRIP')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint day_statuses_one_per_user_date unique (user_id, work_date)
);

alter table public.day_statuses enable row level security;

create policy day_statuses_select_policy
  on public.day_statuses
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy day_statuses_insert_policy
  on public.day_statuses
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy day_statuses_update_policy
  on public.day_statuses
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy day_statuses_delete_policy
  on public.day_statuses
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create function public.normalize_day_status_note()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.note is not null then
    new.note := nullif(pg_catalog.btrim(new.note), '');
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_day_status_note() from public;

create trigger day_statuses_normalize_note
  before insert or update on public.day_statuses
  for each row execute function public.normalize_day_status_note();

create trigger day_statuses_set_updated_at
  before update on public.day_statuses
  for each row execute function public.set_updated_at();

revoke all on table public.day_statuses from public, anon;
grant select, insert, update, delete on public.day_statuses to authenticated;

create table public.calendar_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_date date not null,
  day_type text not null check (day_type in ('WORKDAY', 'HOLIDAY')),
  name text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_overrides_one_per_user_date unique (user_id, calendar_date)
);

alter table public.calendar_overrides enable row level security;

create policy calendar_overrides_select_policy
  on public.calendar_overrides
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy calendar_overrides_insert_policy
  on public.calendar_overrides
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy calendar_overrides_update_policy
  on public.calendar_overrides
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy calendar_overrides_delete_policy
  on public.calendar_overrides
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create function public.normalize_calendar_override_fields()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.name is not null then
    new.name := nullif(pg_catalog.btrim(new.name), '');
  end if;
  if new.note is not null then
    new.note := nullif(pg_catalog.btrim(new.note), '');
  end if;
  return new;
end;
$$;

revoke all on function public.normalize_calendar_override_fields() from public;

create trigger calendar_overrides_normalize_fields
  before insert or update on public.calendar_overrides
  for each row execute function public.normalize_calendar_override_fields();

create trigger calendar_overrides_set_updated_at
  before update on public.calendar_overrides
  for each row execute function public.set_updated_at();

revoke all on table public.calendar_overrides from public, anon;
grant select, insert, update, delete on public.calendar_overrides to authenticated;
