-- Issue 19: Attendance Record manual creation, editing, and delete semantics

alter table public.attendance_records
  add column created_source text not null default 'CLOCK',
  add column manually_adjusted boolean not null default false,
  add column last_manual_edit_at timestamptz,
  add column status_note text;

alter table public.attendance_records
  add constraint attendance_created_source_check
    check (created_source in ('CLOCK', 'MANUAL'));

create or replace function public.prevent_attendance_snapshot_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.work_date is distinct from old.work_date
    or new.created_source is distinct from old.created_source
    or current_setting('app.attendance_rpc', true) is distinct from 'on' then
    raise exception 'attendance history and snapshots are immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create function public.calculate_attendance_snapshots(
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

  if p_context is null then
    raise exception 'work context required';
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

  out_context_snapshot := pg_catalog.jsonb_build_object(
    'id', p_context.id,
    'user_id', p_context.user_id,
    'name', p_context.name,
    'company_identifier', p_context.company_identifier,
    'project_identifier', p_context.project_identifier,
    'active', p_context.active,
    'is_default', p_context.is_default
  );

  out_policy_snapshot := pg_catalog.jsonb_build_object(
    'id', p_policy.id,
    'user_id', p_policy.user_id,
    'context_id', p_policy.context_id,
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

create function public.create_manual_attendance(
  p_work_date date,
  p_context_id uuid,
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
  selected_context public.work_contexts;
  selected_policy public.work_policies;
  calc record;
  new_record public.attendance_records;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_work_date is null then
    raise exception 'work date required';
  end if;

  if p_actual_clock_in_time is null then
    raise exception 'actual clock-in time required';
  end if;

  if p_context_id is null then
    raise exception 'work context required';
  end if;

  select * into selected_context
  from public.work_contexts
  where id = p_context_id and user_id = owner_id;
  if not found then
    raise exception 'work context not found or not owned by user';
  end if;

  select * into selected_policy
  from public.work_policies
  where user_id = owner_id
    and context_id = selected_context.id
    and effective_from <= p_work_date
    and (effective_to is null or effective_to >= p_work_date)
  order by effective_from desc
  limit 1;
  if not found then
    raise exception 'applicable work policy required for date %', p_work_date;
  end if;

  select * into calc
  from public.calculate_attendance_snapshots(
    p_work_date,
    p_actual_clock_in_time,
    p_actual_clock_out_time,
    selected_context,
    selected_policy,
    'v1'
  );

  perform pg_catalog.set_config('app.attendance_rpc', 'on', true);
  insert into public.attendance_records (
    user_id, work_date, context_id, work_policy_id,
    actual_clock_in_at, actual_clock_out_at,
    effective_clock_in_at, effective_clock_out_at, expected_clock_out_at,
    actual_elapsed_minutes, net_worked_minutes, regular_minutes, overtime_minutes,
    context_snapshot, policy_snapshot, calculation_snapshot,
    created_source, manually_adjusted, last_manual_edit_at, status_note
  ) values (
    owner_id, p_work_date, selected_context.id, selected_policy.id,
    calc.out_actual_clock_in_at, calc.out_actual_clock_out_at,
    calc.out_effective_clock_in_at, calc.out_effective_clock_out_at, calc.out_expected_clock_out_at,
    calc.out_actual_elapsed_minutes, calc.out_net_worked_minutes, calc.out_regular_minutes, calc.out_overtime_minutes,
    calc.out_context_snapshot, calc.out_policy_snapshot, calc.out_calculation_snapshot,
    'MANUAL', false, null, nullif(trim(p_status_note), '')
  )
  returning * into new_record;
  perform pg_catalog.set_config('app.attendance_rpc', '', true);

  return new_record;
end;
$$;

create function public.edit_attendance_record(
  p_id uuid,
  p_context_id uuid,
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
  existing_record public.attendance_records;
  selected_context public.work_contexts;
  selected_policy public.work_policies;
  p_work_date date;
  calc record;
  calc_version text;
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

  if p_context_id is null then
    raise exception 'work context required';
  end if;

  select * into existing_record
  from public.attendance_records
  where id = p_id and user_id = owner_id
  for update;
  if not found then
    raise exception 'attendance record not found or not owned by user';
  end if;

  p_work_date := existing_record.work_date;

  select * into selected_context
  from public.work_contexts
  where id = p_context_id and user_id = owner_id;
  if not found then
    raise exception 'work context not found or not owned by user';
  end if;

  select * into selected_policy
  from public.work_policies
  where user_id = owner_id
    and context_id = selected_context.id
    and effective_from <= p_work_date
    and (effective_to is null or effective_to >= p_work_date)
  order by effective_from desc
  limit 1;
  if not found then
    raise exception 'applicable work policy required for date %', p_work_date;
  end if;

  calc_version := coalesce(existing_record.calculation_snapshot->>'calculation_version', 'v1');

  select * into calc
  from public.calculate_attendance_snapshots(
    p_work_date,
    p_actual_clock_in_time,
    p_actual_clock_out_time,
    selected_context,
    selected_policy,
    calc_version
  );

  perform pg_catalog.set_config('app.attendance_rpc', 'on', true);
  update public.attendance_records
  set
    context_id = selected_context.id,
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
    context_snapshot = calc.out_context_snapshot,
    policy_snapshot = calc.out_policy_snapshot,
    calculation_snapshot = calc.out_calculation_snapshot,
    manually_adjusted = true,
    last_manual_edit_at = pg_catalog.clock_timestamp(),
    status_note = nullif(trim(p_status_note), '')
  where id = existing_record.id
  returning * into existing_record;
  perform pg_catalog.set_config('app.attendance_rpc', '', true);

  return existing_record;
end;
$$;

create function public.delete_attendance_record(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_id is null then
    raise exception 'attendance record id required';
  end if;

  delete from public.attendance_records
  where id = p_id and user_id = owner_id;

  if not found then
    raise exception 'attendance record not found or not owned by user';
  end if;
end;
$$;

revoke all on function public.calculate_attendance_snapshots(date, time, time, public.work_contexts, public.work_policies, text) from public;
revoke execute on function public.calculate_attendance_snapshots(date, time, time, public.work_contexts, public.work_policies, text) from anon;
revoke execute on function public.calculate_attendance_snapshots(date, time, time, public.work_contexts, public.work_policies, text) from authenticated;

revoke all on function public.create_manual_attendance(date, uuid, time, time, text) from public;
revoke execute on function public.create_manual_attendance(date, uuid, time, time, text) from anon;
grant execute on function public.create_manual_attendance(date, uuid, time, time, text) to authenticated;

revoke all on function public.edit_attendance_record(uuid, uuid, time, time, text) from public;
revoke execute on function public.edit_attendance_record(uuid, uuid, time, time, text) from anon;
grant execute on function public.edit_attendance_record(uuid, uuid, time, time, text) to authenticated;

revoke all on function public.delete_attendance_record(uuid) from public;
revoke execute on function public.delete_attendance_record(uuid) from anon;
grant execute on function public.delete_attendance_record(uuid) to authenticated;
