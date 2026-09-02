-- Issue 52: resolve today's assignment-owned attendance readiness.

alter table public.attendance_records
  add column if not exists assignment_snapshot jsonb;

alter table public.attendance_records
  alter column context_id drop not null;

create or replace function public.clock_in_today()
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  now_at timestamptz;
  work_day date;
  existing_record public.attendance_records;
  resolution text;
  resolved_assignment_id uuid;
  resolved_policy_id uuid;
  selected_assignment public.work_assignments;
  selected_context public.work_contexts;
  selected_policy public.work_policies;
  context_snapshot jsonb;
  standard_start_at timestamptz;
  effective_start_at timestamptz;
  expected_end_at timestamptz;
  calculation jsonb;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
  end if;

  now_at := pg_catalog.clock_timestamp();
  work_day := (now_at at time zone 'Asia/Taipei')::date;

  select * into existing_record
  from public.attendance_records
  where user_id = owner_id and work_date = work_day
  for update;
  if found then
    return existing_record;
  end if;

  select r.resolution, r.assignment_id, r.policy_id
  into resolution, resolved_assignment_id, resolved_policy_id
  from public.resolve_work_assignment_policy(work_day) as r;

  if resolution = 'NO_ASSIGNMENT' then
    raise exception 'NO_ASSIGNMENT';
  end if;
  if resolution = 'MISSING_POLICY' then
    raise exception 'MISSING_POLICY';
  end if;
  if resolution is distinct from 'RESOLVED'
    or resolved_assignment_id is null
    or resolved_policy_id is null then
    raise exception 'work assignment policy resolution failed';
  end if;

  select * into selected_assignment
  from public.work_assignments
  where id = resolved_assignment_id and user_id = owner_id;
  if not found then
    raise exception 'resolved work assignment not found';
  end if;

  select * into selected_policy
  from public.work_policies
  where id = resolved_policy_id
    and user_id = owner_id
    and assignment_id = resolved_assignment_id;
  if not found then
    raise exception 'resolved work policy not found';
  end if;

  if selected_policy.context_id is not null then
    select * into selected_context
    from public.work_contexts
    where id = selected_policy.context_id and user_id = owner_id;
    if not found then
      raise exception 'resolved work policy context not found';
    end if;
    context_snapshot := pg_catalog.jsonb_build_object(
      'id', selected_context.id,
      'user_id', selected_context.user_id,
      'name', selected_context.name,
      'company_identifier', selected_context.company_identifier,
      'project_identifier', selected_context.project_identifier,
      'active', selected_context.active,
      'is_default', selected_context.is_default
    );
  else
    context_snapshot := '{}'::jsonb;
  end if;

  standard_start_at := ((work_day + selected_policy.standard_start_time)::timestamp at time zone 'Asia/Taipei');
  effective_start_at := public.calculate_effective_clock_in_at(
    now_at,
    work_day,
    standard_start_at,
    selected_policy.early_arrival_policy,
    selected_policy.clock_in_rounding_mode,
    selected_policy.clock_in_rounding_minutes
  );
  expected_end_at := effective_start_at
    + (selected_policy.work_minutes + selected_policy.fixed_break_minutes) * interval '1 minute';

  calculation := pg_catalog.jsonb_build_object(
    'calculation_version', 'v1',
    'calculated_at', now_at,
    'state', 'IN_PROGRESS',
    'actual_clock_in_at', now_at,
    'actual_clock_out_at', null,
    'effective_clock_in_at', effective_start_at,
    'effective_clock_out_at', null,
    'expected_clock_out_at', expected_end_at,
    'actual_elapsed_minutes', null,
    'net_worked_minutes', null,
    'regular_minutes', null,
    'overtime_minutes', null
  );

  perform pg_catalog.set_config('app.attendance_rpc', 'on', true);
  insert into public.attendance_records (
    user_id, work_date, assignment_id, context_id, work_policy_id,
    actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
    assignment_snapshot, context_snapshot, policy_snapshot, calculation_snapshot
  ) values (
    owner_id, work_day, selected_assignment.id, selected_policy.context_id, selected_policy.id,
    now_at, effective_start_at, expected_end_at,
    pg_catalog.jsonb_build_object(
      'id', selected_assignment.id,
      'user_id', selected_assignment.user_id,
      'staffing_employer', selected_assignment.staffing_employer,
      'client_company', selected_assignment.client_company,
      'project', selected_assignment.project,
      'effective_from', selected_assignment.effective_from,
      'effective_to', selected_assignment.effective_to
    ),
    context_snapshot,
    pg_catalog.jsonb_build_object(
      'id', selected_policy.id,
      'user_id', selected_policy.user_id,
      'assignment_id', selected_policy.assignment_id,
      'context_id', selected_policy.context_id,
      'name', selected_policy.name,
      'standard_start_time', selected_policy.standard_start_time,
      'work_minutes', selected_policy.work_minutes,
      'fixed_break_minutes', selected_policy.fixed_break_minutes,
      'early_arrival_policy', selected_policy.early_arrival_policy,
      'clock_in_rounding_mode', selected_policy.clock_in_rounding_mode,
      'clock_in_rounding_minutes', selected_policy.clock_in_rounding_minutes,
      'clock_out_rounding_mode', selected_policy.clock_out_rounding_mode,
      'clock_out_rounding_minutes', selected_policy.clock_out_rounding_minutes,
      'working_days', selected_policy.working_days,
      'effective_from', selected_policy.effective_from,
      'effective_to', selected_policy.effective_to,
      'timezone', selected_policy.timezone
    ),
    calculation
  )
  on conflict (user_id, work_date) do nothing
  returning * into existing_record;
  if not found then
    select * into existing_record
    from public.attendance_records
    where user_id = owner_id and work_date = work_day
    for update;
  end if;
  perform pg_catalog.set_config('app.attendance_rpc', '', true);

  return existing_record;
end;
$$;

create or replace function public.prevent_attendance_snapshot_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.work_date is distinct from old.work_date
    or new.created_source is distinct from old.created_source
    or new.assignment_id is distinct from old.assignment_id
    or new.assignment_snapshot is distinct from old.assignment_snapshot
    or current_setting('app.attendance_rpc', true) is distinct from 'on' then
    raise exception 'attendance history and snapshots are immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
