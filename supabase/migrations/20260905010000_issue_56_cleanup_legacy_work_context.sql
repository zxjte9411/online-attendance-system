-- Issue 56: cleanup legacy work context contract and active/default truth

-- 1. Drop trigger, functions, and policies that depend on active/is_default or mutate work_contexts
drop trigger if exists work_contexts_prevent_direct_default_change on public.work_contexts;
drop function if exists public.prevent_direct_default_context_change();

drop function if exists public.create_work_context(text, text, text, boolean);
drop function if exists public.activate_work_context(uuid, text, text, text);
drop function if exists public.set_default_work_context(uuid);

drop policy if exists work_contexts_owner_insert on public.work_contexts;
drop policy if exists work_contexts_owner_update on public.work_contexts;

revoke insert, update, delete
  on table public.work_contexts
  from public, anon, authenticated;

grant select on table public.work_contexts to authenticated;

-- 2. Drop active and is_default columns from work_contexts (retaining it as archival table for historical FK references)
alter table public.work_contexts
  drop constraint if exists work_contexts_default_requires_active;

drop index if exists public.work_contexts_one_active_default_per_user;

alter table public.work_contexts
  drop column if exists is_default,
  drop column if exists active;

-- 3. Update attendance RPCs: target date -> Work Assignment -> Work Policy (no context lookup or fallback)

create or replace function public.calculate_attendance_snapshots(
  p_work_date date,
  p_actual_clock_in_time time,
  p_actual_clock_out_time time,
  p_context public.work_contexts,
  p_policy public.work_policies,
  p_calculation_version text default 'v1',
  out out_actual_clock_in_at timestamptz,
  out out_actual_clock_out_at timestamptz,
  out out_effective_clock_in_at timestamptz,
  out out_effective_clock_out_at timestamptz,
  out out_expected_clock_out_at timestamptz,
  out out_actual_elapsed_minutes integer,
  out out_net_worked_minutes integer,
  out out_regular_minutes integer,
  out out_overtime_minutes integer,
  out out_context_snapshot jsonb,
  out out_policy_snapshot jsonb,
  out out_calculation_snapshot jsonb
)
language plpgsql
set search_path = ''
as $$
declare
  standard_start_at timestamptz;
  taipei_midnight timestamptz;
  rounding_mode text;
  rounding_minutes integer;
  calculation_state text;
  now_at timestamptz;
begin
  if p_work_date is null then
    raise exception 'work date required';
  end if;
  if p_actual_clock_in_time is null then
    raise exception 'actual clock-in time required';
  end if;
  if p_policy is null then
    raise exception 'work policy required';
  end if;

  out_actual_clock_in_at := ((p_work_date + p_actual_clock_in_time)::timestamp at time zone 'Asia/Taipei');
  if p_actual_clock_out_time is not null then
    out_actual_clock_out_at := ((p_work_date + p_actual_clock_out_time)::timestamp at time zone 'Asia/Taipei');
    if out_actual_clock_out_at < out_actual_clock_in_at then
      raise exception 'clock out cannot be earlier than clock in';
    end if;
  else
    out_actual_clock_out_at := null;
  end if;

  standard_start_at := ((p_work_date + p_policy.standard_start_time)::timestamp at time zone 'Asia/Taipei');
  out_effective_clock_in_at := public.calculate_effective_clock_in_at(
    out_actual_clock_in_at,
    p_work_date,
    standard_start_at,
    p_policy.early_arrival_policy,
    p_policy.clock_in_rounding_mode,
    p_policy.clock_in_rounding_minutes
  );
  out_expected_clock_out_at := out_effective_clock_in_at
    + (p_policy.work_minutes + p_policy.fixed_break_minutes) * interval '1 minute';

  now_at := pg_catalog.clock_timestamp();
  if out_actual_clock_out_at is not null then
    rounding_mode := coalesce(p_policy.clock_out_rounding_mode, 'NONE');
    rounding_minutes := nullif(p_policy.clock_out_rounding_minutes, null);
    taipei_midnight := (p_work_date::timestamp at time zone 'Asia/Taipei');
    out_effective_clock_out_at := case rounding_mode
      when 'CEIL' then taipei_midnight
        + pg_catalog.ceil(
            extract(epoch from (out_actual_clock_out_at - taipei_midnight)) / 60 / rounding_minutes
          ) * interval '1 minute' * rounding_minutes
      when 'FLOOR' then taipei_midnight
        + pg_catalog.floor(
            extract(epoch from (out_actual_clock_out_at - taipei_midnight)) / 60 / rounding_minutes
          ) * interval '1 minute' * rounding_minutes
      else out_actual_clock_out_at
    end;
    out_actual_elapsed_minutes := pg_catalog.floor(extract(epoch from (out_actual_clock_out_at - out_actual_clock_in_at)) / 60);
    out_net_worked_minutes := greatest(
      0,
      pg_catalog.floor(extract(epoch from (out_effective_clock_out_at - out_effective_clock_in_at)) / 60)::integer
        - p_policy.fixed_break_minutes
    );
    out_regular_minutes := least(out_net_worked_minutes, p_policy.work_minutes);
    out_overtime_minutes := greatest(0, out_net_worked_minutes - p_policy.work_minutes);
    calculation_state := 'COMPLETED';
  else
    out_effective_clock_out_at := null;
    out_actual_elapsed_minutes := null;
    out_net_worked_minutes := null;
    out_regular_minutes := null;
    out_overtime_minutes := null;
    calculation_state := 'IN_PROGRESS';
  end if;

  out_context_snapshot := '{}'::jsonb;
  out_policy_snapshot := pg_catalog.jsonb_build_object(
    'id', p_policy.id,
    'user_id', p_policy.user_id,
    'assignment_id', p_policy.assignment_id,
    'name', p_policy.name,
    'standard_start_time', p_policy.standard_start_time,
    'work_minutes', p_policy.work_minutes,
    'fixed_break_minutes', p_policy.fixed_break_minutes,
    'early_arrival_policy', p_policy.early_arrival_policy,
    'clock_in_rounding_mode', p_policy.clock_in_rounding_mode,
    'clock_in_rounding_minutes', p_policy.clock_in_rounding_minutes,
    'clock_out_rounding_mode', p_policy.clock_out_rounding_mode,
    'clock_out_rounding_minutes', p_policy.clock_out_rounding_minutes,
    'working_days', p_policy.working_days,
    'effective_from', p_policy.effective_from,
    'effective_to', p_policy.effective_to,
    'timezone', p_policy.timezone
  );
  out_calculation_snapshot := pg_catalog.jsonb_build_object(
    'calculation_version', coalesce(p_calculation_version, 'v1'),
    'calculated_at', now_at,
    'state', calculation_state,
    'actual_clock_in_at', out_actual_clock_in_at,
    'actual_clock_out_at', out_actual_clock_out_at,
    'effective_clock_in_at', out_effective_clock_in_at,
    'effective_clock_out_at', out_effective_clock_out_at,
    'expected_clock_out_at', out_expected_clock_out_at,
    'actual_elapsed_minutes', out_actual_elapsed_minutes,
    'net_worked_minutes', out_net_worked_minutes,
    'regular_minutes', out_regular_minutes,
    'overtime_minutes', out_overtime_minutes
  );
end;
$$;

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
  selected_policy public.work_policies;
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
    owner_id, work_day, selected_assignment.id, null, selected_policy.id,
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
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'id', selected_policy.id,
      'user_id', selected_policy.user_id,
      'assignment_id', selected_policy.assignment_id,
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
  returning * into existing_record;
  perform pg_catalog.set_config('app.attendance_rpc', '', true);

  return existing_record;
end;
$$;

create or replace function public.create_manual_attendance(
  p_work_date date,
  p_actual_clock_in_time time,
  p_actual_clock_out_time time default null,
  p_status_note text default null
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  resolution text;
  resolved_assignment_id uuid;
  resolved_policy_id uuid;
  selected_assignment public.work_assignments;
  selected_policy public.work_policies;
  calc record;
  new_record public.attendance_records;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;
  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
  end if;
  if p_work_date is null then
    raise exception 'work date required';
  end if;
  if p_actual_clock_in_time is null then
    raise exception 'actual clock-in time required';
  end if;

  select r.resolution, r.assignment_id, r.policy_id
  into resolution, resolved_assignment_id, resolved_policy_id
  from public.resolve_work_assignment_policy(p_work_date) as r;
  if resolution = 'NO_ASSIGNMENT' then
    raise exception '% 沒有可用的 Work Assignment（NO_ASSIGNMENT）。', p_work_date;
  end if;
  if resolution = 'MISSING_POLICY' then
    raise exception '% 沒有適用的 Work Policy（MISSING_POLICY）。', p_work_date;
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

  select * into calc
  from public.calculate_attendance_snapshots(
    p_work_date, p_actual_clock_in_time, p_actual_clock_out_time,
    null::public.work_contexts, selected_policy, 'v1'
  );

  perform pg_catalog.set_config('app.attendance_rpc', 'on', true);
  insert into public.attendance_records (
    user_id, work_date, assignment_id, context_id, work_policy_id,
    actual_clock_in_at, actual_clock_out_at,
    effective_clock_in_at, effective_clock_out_at, expected_clock_out_at,
    actual_elapsed_minutes, net_worked_minutes, regular_minutes, overtime_minutes,
    created_source, status_note,
    assignment_snapshot, context_snapshot, policy_snapshot, calculation_snapshot
  ) values (
    owner_id, p_work_date, selected_assignment.id, null, selected_policy.id,
    calc.out_actual_clock_in_at, calc.out_actual_clock_out_at,
    calc.out_effective_clock_in_at, calc.out_effective_clock_out_at, calc.out_expected_clock_out_at,
    calc.out_actual_elapsed_minutes, calc.out_net_worked_minutes, calc.out_regular_minutes, calc.out_overtime_minutes,
    'MANUAL', p_status_note,
    pg_catalog.jsonb_build_object(
      'id', selected_assignment.id,
      'user_id', selected_assignment.user_id,
      'staffing_employer', selected_assignment.staffing_employer,
      'client_company', selected_assignment.client_company,
      'project', selected_assignment.project,
      'effective_from', selected_assignment.effective_from,
      'effective_to', selected_assignment.effective_to
    ),
    '{}'::jsonb,
    calc.out_policy_snapshot,
    calc.out_calculation_snapshot
  )
  returning * into new_record;
  perform pg_catalog.set_config('app.attendance_rpc', '', true);

  return new_record;
end;
$$;

create or replace function public.edit_attendance_record(
  p_id uuid,
  p_actual_clock_in_time time,
  p_actual_clock_out_time time default null,
  p_status_note text default null
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  work_day date;
  existing_record public.attendance_records;
  resolution text;
  resolved_assignment_id uuid;
  resolved_policy_id uuid;
  selected_assignment public.work_assignments;
  selected_policy public.work_policies;
  calc_version text;
  calc record;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;
  if p_id is null then
    raise exception 'attendance record id required';
  end if;
  if p_actual_clock_in_time is null then
    raise exception 'actual clock-in time required';
  end if;

  select * into existing_record
  from public.attendance_records
  where id = p_id and user_id = owner_id
  for update;
  if not found then
    raise exception 'attendance record not found or not owned by user';
  end if;
  work_day := existing_record.work_date;

  select r.resolution, r.assignment_id, r.policy_id
  into resolution, resolved_assignment_id, resolved_policy_id
  from public.resolve_work_assignment_policy(work_day) as r;
  if resolution = 'NO_ASSIGNMENT' then
    raise exception '% 沒有可用的 Work Assignment（NO_ASSIGNMENT）。', work_day;
  end if;
  if resolution = 'MISSING_POLICY' then
    raise exception '% 沒有適用的 Work Policy（MISSING_POLICY）。', work_day;
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

  calc_version := coalesce(existing_record.calculation_snapshot->>'calculation_version', 'v1');
  select * into calc
  from public.calculate_attendance_snapshots(
    work_day, p_actual_clock_in_time, p_actual_clock_out_time,
    null::public.work_contexts, selected_policy, calc_version
  );

  perform pg_catalog.set_config('app.attendance_rpc', 'on', true);
  update public.attendance_records
  set
    assignment_id = selected_assignment.id,
    context_id = null,
    work_policy_id = selected_policy.id,
    actual_clock_in_at = calc.out_actual_clock_in_at,
    actual_clock_out_at = calc.out_actual_clock_out_at,
    effective_clock_in_at = calc.out_effective_clock_in_at,
    effective_clock_out_at = calc.out_effective_clock_out_at,
    expected_clock_out_at = calc.out_expected_clock_out_at,
    actual_elapsed_minutes = calc.out_actual_elapsed_minutes,
    net_worked_minutes = calc.out_net_worked_minutes,
    regular_minutes = calc.out_regular_minutes,
    overtime_minutes = calc.out_overtime_minutes,
    manually_adjusted = true,
    last_manual_edit_at = pg_catalog.clock_timestamp(),
    status_note = nullif(trim(p_status_note), ''),
    assignment_snapshot = pg_catalog.jsonb_build_object(
      'id', selected_assignment.id,
      'user_id', selected_assignment.user_id,
      'staffing_employer', selected_assignment.staffing_employer,
      'client_company', selected_assignment.client_company,
      'project', selected_assignment.project,
      'effective_from', selected_assignment.effective_from,
      'effective_to', selected_assignment.effective_to
    ),
    context_snapshot = '{}'::jsonb,
    policy_snapshot = calc.out_policy_snapshot,
    calculation_snapshot = calc.out_calculation_snapshot
  where id = existing_record.id
  returning * into existing_record;
  perform pg_catalog.set_config('app.attendance_rpc', '', true);

  return existing_record;
end;
$$;

create or replace function public.prevent_attendance_snapshot_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  resolution text;
  resolved_assignment_id uuid;
  resolved_policy_id uuid;
  expected_assignment_snapshot jsonb;
  expected_policy_snapshot jsonb;
begin
  if new.user_id is distinct from old.user_id
    or new.work_date is distinct from old.work_date
    or new.created_source is distinct from old.created_source then
    raise exception 'attendance history and snapshots are immutable'
      using errcode = 'P0001';
  end if;

  if current_setting('app.attendance_rpc', true) is distinct from 'on' then
    raise exception 'attendance history and snapshots are immutable'
      using errcode = 'P0001';
  end if;

  if (select auth.uid()) is distinct from old.user_id then
    raise exception 'attendance RPC owner mismatch'
      using errcode = 'P0001';
  end if;

  if new.assignment_id is distinct from old.assignment_id
    or new.assignment_snapshot is distinct from old.assignment_snapshot
    or new.context_id is distinct from old.context_id
    or new.context_snapshot is distinct from old.context_snapshot
    or new.work_policy_id is distinct from old.work_policy_id
    or new.policy_snapshot is distinct from old.policy_snapshot then
    select r.resolution, r.assignment_id, r.policy_id
    into resolution, resolved_assignment_id, resolved_policy_id
    from public.resolve_work_assignment_policy(old.work_date) as r;

    if resolution is distinct from 'RESOLVED'
      or resolved_assignment_id is null
      or resolved_policy_id is null then
      raise exception 'attendance update resolution failed'
        using errcode = 'P0001';
    end if;

    select pg_catalog.jsonb_build_object(
      'id', wa.id,
      'user_id', wa.user_id,
      'staffing_employer', wa.staffing_employer,
      'client_company', wa.client_company,
      'project', wa.project,
      'effective_from', wa.effective_from,
      'effective_to', wa.effective_to
    )
    into expected_assignment_snapshot
    from public.work_assignments wa
    where wa.id = resolved_assignment_id and wa.user_id = old.user_id;

    select pg_catalog.jsonb_build_object(
      'id', wp.id,
      'user_id', wp.user_id,
      'assignment_id', wp.assignment_id,
      'name', wp.name,
      'standard_start_time', wp.standard_start_time,
      'work_minutes', wp.work_minutes,
      'fixed_break_minutes', wp.fixed_break_minutes,
      'early_arrival_policy', wp.early_arrival_policy,
      'clock_in_rounding_mode', wp.clock_in_rounding_mode,
      'clock_in_rounding_minutes', wp.clock_in_rounding_minutes,
      'clock_out_rounding_mode', wp.clock_out_rounding_mode,
      'clock_out_rounding_minutes', wp.clock_out_rounding_minutes,
      'working_days', wp.working_days,
      'effective_from', wp.effective_from,
      'effective_to', wp.effective_to,
      'timezone', wp.timezone
    )
    into expected_policy_snapshot
    from public.work_policies wp
    where wp.id = resolved_policy_id and wp.user_id = old.user_id;

    if new.assignment_id is distinct from resolved_assignment_id
      or new.context_id is not null
      or new.work_policy_id is distinct from resolved_policy_id
      or new.assignment_snapshot is distinct from expected_assignment_snapshot
      or new.context_snapshot is distinct from '{}'::jsonb
      or new.policy_snapshot is distinct from expected_policy_snapshot then
      raise exception 'attendance identity must match resolved assignment and policy'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.create_manual_attendance(date, time, time, text) from public;
revoke execute on function public.create_manual_attendance(date, time, time, text) from anon;
grant execute on function public.create_manual_attendance(date, time, time, text) to authenticated;

revoke all on function public.edit_attendance_record(uuid, time, time, text) from public;
revoke execute on function public.edit_attendance_record(uuid, time, time, text) from anon;
grant execute on function public.edit_attendance_record(uuid, time, time, text) to authenticated;

