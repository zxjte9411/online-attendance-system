-- Issue 50: Work Assignment domain model and validation

create table public.work_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  staffing_employer text not null,
  client_company text not null,
  project text not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_assignments_staffing_employer_not_empty check (btrim(staffing_employer) <> ''),
  constraint work_assignments_client_company_not_empty check (btrim(client_company) <> ''),
  constraint work_assignments_project_not_empty check (btrim(project) <> ''),
  constraint work_assignments_effective_dates check (effective_to is null or effective_to >= effective_from),
  constraint work_assignments_user_id_id_key unique (id, user_id),
  constraint work_assignments_no_overlapping_effective_dates
    exclude using gist (
      user_id with =,
      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
    )
);

create index work_assignments_user_id_idx on public.work_assignments (user_id);

alter table public.work_policies
  add column if not exists assignment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'work_policies_assignment_owner_fkey'
  ) then
    alter table public.work_policies
      add constraint work_policies_assignment_owner_fkey
        foreign key (assignment_id, user_id)
        references public.work_assignments (id, user_id)
        on delete restrict;
  end if;
end $$;

create index if not exists work_policies_assignment_owner_idx
  on public.work_policies (assignment_id, user_id);

alter table public.attendance_records
  add column if not exists assignment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'attendance_records_assignment_owner_fkey'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_assignment_owner_fkey
        foreign key (assignment_id, user_id)
        references public.work_assignments (id, user_id)
        on delete restrict;
  end if;
end $$;

create index if not exists attendance_records_assignment_owner_idx
  on public.attendance_records (assignment_id, user_id);

create function public.validate_work_assignment_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  has_attendance boolean;
  min_policy_from date;
  max_policy_to date;
  has_open_policy boolean;
  min_attendance_date date;
  max_attendance_date date;
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'cannot change work assignment owner'
      using errcode = 'P0001';
  end if;

  if (new.staffing_employer is distinct from old.staffing_employer
      or new.client_company is distinct from old.client_company
      or new.project is distinct from old.project) then
    select exists (
      select 1 from public.attendance_records
      where user_id = old.user_id
        and assignment_id = old.id
    ) into has_attendance;

    if has_attendance then
      raise exception 'cannot modify staffing employer, client company, or project after attendance records exist'
        using errcode = 'P0001';
    end if;
  end if;

  select
    min(effective_from),
    max(effective_to),
    exists (select 1 from public.work_policies where user_id = old.user_id and assignment_id = old.id and effective_to is null)
  into min_policy_from, max_policy_to, has_open_policy
  from public.work_policies
  where user_id = old.user_id and assignment_id = old.id;

  if min_policy_from is not null and new.effective_from > min_policy_from then
    raise exception 'assignment period cannot exclude existing work policies'
      using errcode = 'P0001';
  end if;

  if new.effective_to is not null then
    if has_open_policy then
      raise exception 'assignment period cannot exclude existing work policies'
        using errcode = 'P0001';
    end if;
    if max_policy_to is not null and new.effective_to < max_policy_to then
      raise exception 'assignment period cannot exclude existing work policies'
        using errcode = 'P0001';
    end if;
  end if;

  select min(work_date), max(work_date)
  into min_attendance_date, max_attendance_date
  from public.attendance_records
  where user_id = old.user_id and assignment_id = old.id;

  if min_attendance_date is not null and new.effective_from > min_attendance_date then
    raise exception 'assignment period cannot exclude existing attendance records'
      using errcode = 'P0001';
  end if;

  if new.effective_to is not null and max_attendance_date is not null and new.effective_to < max_attendance_date then
    raise exception 'assignment period cannot exclude existing attendance records'
      using errcode = 'P0001';
  end if;

  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create trigger work_assignments_validate_update
  before update on public.work_assignments
  for each row execute function public.validate_work_assignment_update();

revoke all on function public.validate_work_assignment_update() from public;

alter table public.work_assignments enable row level security;

revoke all on table public.work_assignments from public, anon, authenticated;
grant select on table public.work_assignments to authenticated;

create policy work_assignments_owner_select on public.work_assignments
  for select to authenticated
  using (user_id = (select auth.uid()));

create function public.create_work_assignment(
  p_staffing_employer text,
  p_client_company text,
  p_project text,
  p_effective_from date,
  p_effective_to date default null
)
returns public.work_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  renewal_record public.work_assignments;
  result_record public.work_assignments;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
  end if;

  if btrim(coalesce(p_staffing_employer, '')) = '' then
    raise exception 'staffing employer required';
  end if;
  if btrim(coalesce(p_client_company, '')) = '' then
    raise exception 'client company required';
  end if;
  if btrim(coalesce(p_project, '')) = '' then
    raise exception 'project required';
  end if;
  if p_effective_from is null then
    raise exception 'effective_from required';
  end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'effective_to cannot precede effective_from';
  end if;

  select * into renewal_record
  from public.work_assignments
  where user_id = owner_id
    and staffing_employer = btrim(p_staffing_employer)
    and client_company = btrim(p_client_company)
    and project = btrim(p_project)
    and effective_to is not null
    and effective_to = (p_effective_from - interval '1 day')::date
  for update;

  if found then
    update public.work_assignments
    set effective_to = p_effective_to
    where id = renewal_record.id and user_id = owner_id
    returning * into result_record;
    return result_record;
  end if;

  insert into public.work_assignments (
    user_id, staffing_employer, client_company, project, effective_from, effective_to
  ) values (
    owner_id, btrim(p_staffing_employer), btrim(p_client_company), btrim(p_project),
    p_effective_from, p_effective_to
  )
  returning * into result_record;

  return result_record;
end;
$$;

create function public.update_work_assignment(
  p_id uuid,
  p_staffing_employer text,
  p_client_company text,
  p_project text,
  p_effective_from date,
  p_effective_to date default null
)
returns public.work_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  result_record public.work_assignments;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_id is null then
    raise exception 'work assignment id required';
  end if;
  if btrim(coalesce(p_staffing_employer, '')) = '' then
    raise exception 'staffing employer required';
  end if;
  if btrim(coalesce(p_client_company, '')) = '' then
    raise exception 'client company required';
  end if;
  if btrim(coalesce(p_project, '')) = '' then
    raise exception 'project required';
  end if;
  if p_effective_from is null then
    raise exception 'effective_from required';
  end if;
  if p_effective_to is not null and p_effective_to < p_effective_from then
    raise exception 'effective_to cannot precede effective_from';
  end if;

  update public.work_assignments
  set
    staffing_employer = btrim(p_staffing_employer),
    client_company = btrim(p_client_company),
    project = btrim(p_project),
    effective_from = p_effective_from,
    effective_to = p_effective_to
  where id = p_id and user_id = owner_id
  returning * into result_record;

  if not found then
    raise exception 'work assignment not found or not owned by user';
  end if;

  return result_record;
end;
$$;

revoke all on function public.create_work_assignment(text, text, text, date, date) from public;
revoke execute on function public.create_work_assignment(text, text, text, date, date) from anon;
grant execute on function public.create_work_assignment(text, text, text, date, date) to authenticated;

revoke all on function public.update_work_assignment(uuid, text, text, text, date, date) from public;
revoke execute on function public.update_work_assignment(uuid, text, text, text, date, date) from anon;
grant execute on function public.update_work_assignment(uuid, text, text, text, date, date) to authenticated;
