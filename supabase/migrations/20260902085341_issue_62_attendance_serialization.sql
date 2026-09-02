-- Issue 62: serialize attendance creation with assignment and policy updates.

create or replace function public.update_work_assignment(
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

  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
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

create or replace function public.update_work_policy(
  p_id uuid,
  p_name text,
  p_standard_start_time time,
  p_work_minutes integer,
  p_fixed_break_minutes integer,
  p_early_arrival_policy text,
  p_clock_in_rounding_mode text,
  p_clock_in_rounding_minutes integer,
  p_clock_out_rounding_mode text,
  p_clock_out_rounding_minutes integer,
  p_working_days text[],
  p_effective_from date,
  p_effective_to date default null,
  p_timezone text default 'Asia/Taipei'
)
returns public.work_policies
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  result_record public.work_policies;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
  end if;

  update public.work_policies
  set
    name = pg_catalog.btrim(p_name),
    standard_start_time = p_standard_start_time,
    work_minutes = p_work_minutes,
    fixed_break_minutes = p_fixed_break_minutes,
    early_arrival_policy = p_early_arrival_policy,
    clock_in_rounding_mode = p_clock_in_rounding_mode,
    clock_in_rounding_minutes = p_clock_in_rounding_minutes,
    clock_out_rounding_mode = p_clock_out_rounding_mode,
    clock_out_rounding_minutes = p_clock_out_rounding_minutes,
    working_days = p_working_days,
    effective_from = p_effective_from,
    effective_to = p_effective_to,
    timezone = p_timezone
  where id = p_id and user_id = owner_id
  returning * into result_record;

  if not found then
    raise exception 'work policy not found or not owned by user';
  end if;

  return result_record;
end;
$$;
