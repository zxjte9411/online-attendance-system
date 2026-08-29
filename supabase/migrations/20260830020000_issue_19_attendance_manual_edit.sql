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
  v_actual_clock_in_at timestamptz;
  v_actual_clock_out_at timestamptz;
  selected_context public.work_contexts;
  selected_policy public.work_policies;
  standard_start_at timestamptz;
  effective_start_at timestamptz;
  expected_end_at timestamptz;
  effective_end_at timestamptz;
  taipei_midnight timestamptz;
  rounding_mode text;
  rounding_minutes integer;
  actual_elapsed integer;
  net_worked integer;
  regular_mins integer;
  overtime_mins integer;
  calculation_state text;
  calculation jsonb;
  new_record public.attendance_records;
  now_at timestamptz;
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

  v_actual_clock_in_at := ((p_work_date + p_actual_clock_in_time)::timestamp at time zone 'Asia/Taipei');
  if p_actual_clock_out_time is not null then
    v_actual_clock_out_at := ((p_work_date + p_actual_clock_out_time)::timestamp at time zone 'Asia/Taipei');
    if v_actual_clock_out_at < v_actual_clock_in_at then
      raise exception 'clock out cannot be earlier than clock in';
    end if;
  else
    v_actual_clock_out_at := null;
  end if;

  standard_start_at := ((p_work_date + selected_policy.standard_start_time)::timestamp at time zone 'Asia/Taipei');
  effective_start_at := public.calculate_effective_clock_in_at(
    v_actual_clock_in_at,
    p_work_date,
    standard_start_at,
    selected_policy.early_arrival_policy,
    selected_policy.clock_in_rounding_mode,
    selected_policy.clock_in_rounding_minutes
  );
  expected_end_at := effective_start_at
    + (selected_policy.work_minutes + selected_policy.fixed_break_minutes) * interval '1 minute';

  now_at := pg_catalog.clock_timestamp();

  if v_actual_clock_out_at is not null then
    rounding_mode := coalesce(selected_policy.clock_out_rounding_mode, 'NONE');
    rounding_minutes := nullif(selected_policy.clock_out_rounding_minutes, null);
    taipei_midnight := (p_work_date::timestamp at time zone 'Asia/Taipei');
    effective_end_at := case rounding_mode
      when 'CEIL' then taipei_midnight
        + pg_catalog.ceil(
            extract(epoch from (v_actual_clock_out_at - taipei_midnight)) / 60 / rounding_minutes
          ) * interval '1 minute' * rounding_minutes
      when 'FLOOR' then taipei_midnight
        + pg_catalog.floor(
            extract(epoch from (v_actual_clock_out_at - taipei_midnight)) / 60 / rounding_minutes
          ) * interval '1 minute' * rounding_minutes
      else v_actual_clock_out_at
    end;

    actual_elapsed := pg_catalog.floor(extract(epoch from (v_actual_clock_out_at - v_actual_clock_in_at)) / 60);
    net_worked := greatest(
      0,
      pg_catalog.floor(extract(epoch from (effective_end_at - effective_start_at)) / 60)::integer
        - selected_policy.fixed_break_minutes
    );
    regular_mins := least(net_worked, selected_policy.work_minutes);
    overtime_mins := greatest(0, net_worked - selected_policy.work_minutes);
    calculation_state := 'COMPLETED';
  else
    effective_end_at := null;
    actual_elapsed := null;
    net_worked := null;
    regular_mins := null;
    overtime_mins := null;
    calculation_state := 'IN_PROGRESS';
  end if;

  calculation := pg_catalog.jsonb_build_object(
    'calculation_version', 'v1',
    'calculated_at', now_at,
    'state', calculation_state,
    'actual_clock_in_at', v_actual_clock_in_at,
    'actual_clock_out_at', v_actual_clock_out_at,
    'effective_clock_in_at', effective_start_at,
    'effective_clock_out_at', effective_end_at,
    'expected_clock_out_at', expected_end_at,
    'actual_elapsed_minutes', actual_elapsed,
    'net_worked_minutes', net_worked,
    'regular_minutes', regular_mins,
    'overtime_minutes', overtime_mins
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
    v_actual_clock_in_at, v_actual_clock_out_at,
    effective_start_at, effective_end_at, expected_end_at,
    actual_elapsed, net_worked, regular_mins, overtime_mins,
    pg_catalog.jsonb_build_object(
      'id', selected_context.id,
      'user_id', selected_context.user_id,
      'name', selected_context.name,
      'company_identifier', selected_context.company_identifier,
      'project_identifier', selected_context.project_identifier,
      'active', selected_context.active,
      'is_default', selected_context.is_default
    ),
    pg_catalog.jsonb_build_object(
      'id', selected_policy.id,
      'user_id', selected_policy.user_id,
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
    calculation,
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
  v_actual_clock_in_at timestamptz;
  v_actual_clock_out_at timestamptz;
  standard_start_at timestamptz;
  effective_start_at timestamptz;
  expected_end_at timestamptz;
  effective_end_at timestamptz;
  taipei_midnight timestamptz;
  rounding_mode text;
  rounding_minutes integer;
  actual_elapsed integer;
  net_worked integer;
  regular_mins integer;
  overtime_mins integer;
  calculation_state text;
  calculation jsonb;
  now_at timestamptz;
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

  v_actual_clock_in_at := ((p_work_date + p_actual_clock_in_time)::timestamp at time zone 'Asia/Taipei');
  if p_actual_clock_out_time is not null then
    v_actual_clock_out_at := ((p_work_date + p_actual_clock_out_time)::timestamp at time zone 'Asia/Taipei');
    if v_actual_clock_out_at < v_actual_clock_in_at then
      raise exception 'clock out cannot be earlier than clock in';
    end if;
  else
    v_actual_clock_out_at := null;
  end if;

  standard_start_at := ((p_work_date + selected_policy.standard_start_time)::timestamp at time zone 'Asia/Taipei');
  effective_start_at := public.calculate_effective_clock_in_at(
    v_actual_clock_in_at,
    p_work_date,
    standard_start_at,
    selected_policy.early_arrival_policy,
    selected_policy.clock_in_rounding_mode,
    selected_policy.clock_in_rounding_minutes
  );
  expected_end_at := effective_start_at
    + (selected_policy.work_minutes + selected_policy.fixed_break_minutes) * interval '1 minute';

  now_at := pg_catalog.clock_timestamp();
  calc_version := coalesce(existing_record.calculation_snapshot->>'calculation_version', 'v1');

  if v_actual_clock_out_at is not null then
    rounding_mode := coalesce(selected_policy.clock_out_rounding_mode, 'NONE');
    rounding_minutes := nullif(selected_policy.clock_out_rounding_minutes, null);
    taipei_midnight := (p_work_date::timestamp at time zone 'Asia/Taipei');
    effective_end_at := case rounding_mode
      when 'CEIL' then taipei_midnight
        + pg_catalog.ceil(
            extract(epoch from (v_actual_clock_out_at - taipei_midnight)) / 60 / rounding_minutes
          ) * interval '1 minute' * rounding_minutes
      when 'FLOOR' then taipei_midnight
        + pg_catalog.floor(
            extract(epoch from (v_actual_clock_out_at - taipei_midnight)) / 60 / rounding_minutes
          ) * interval '1 minute' * rounding_minutes
      else v_actual_clock_out_at
    end;

    actual_elapsed := pg_catalog.floor(extract(epoch from (v_actual_clock_out_at - v_actual_clock_in_at)) / 60);
    net_worked := greatest(
      0,
      pg_catalog.floor(extract(epoch from (effective_end_at - effective_start_at)) / 60)::integer
        - selected_policy.fixed_break_minutes
    );
    regular_mins := least(net_worked, selected_policy.work_minutes);
    overtime_mins := greatest(0, net_worked - selected_policy.work_minutes);
    calculation_state := 'COMPLETED';
  else
    effective_end_at := null;
    actual_elapsed := null;
    net_worked := null;
    regular_mins := null;
    overtime_mins := null;
    calculation_state := 'IN_PROGRESS';
  end if;

  calculation := pg_catalog.jsonb_build_object(
    'calculation_version', calc_version,
    'calculated_at', now_at,
    'state', calculation_state,
    'actual_clock_in_at', v_actual_clock_in_at,
    'actual_clock_out_at', v_actual_clock_out_at,
    'effective_clock_in_at', effective_start_at,
    'effective_clock_out_at', effective_end_at,
    'expected_clock_out_at', expected_end_at,
    'actual_elapsed_minutes', actual_elapsed,
    'net_worked_minutes', net_worked,
    'regular_minutes', regular_mins,
    'overtime_minutes', overtime_mins
  );

  perform pg_catalog.set_config('app.attendance_rpc', 'on', true);
  update public.attendance_records
  set
    context_id = selected_context.id,
    work_policy_id = selected_policy.id,
    actual_clock_in_at = v_actual_clock_in_at,
    actual_clock_out_at = v_actual_clock_out_at,
    effective_clock_in_at = effective_start_at,
    effective_clock_out_at = effective_end_at,
    expected_clock_out_at = expected_end_at,
    actual_elapsed_minutes = actual_elapsed,
    net_worked_minutes = net_worked,
    regular_minutes = regular_mins,
    overtime_minutes = overtime_mins,
    context_snapshot = pg_catalog.jsonb_build_object(
      'id', selected_context.id,
      'user_id', selected_context.user_id,
      'name', selected_context.name,
      'company_identifier', selected_context.company_identifier,
      'project_identifier', selected_context.project_identifier,
      'active', selected_context.active,
      'is_default', selected_context.is_default
    ),
    policy_snapshot = pg_catalog.jsonb_build_object(
      'id', selected_policy.id,
      'user_id', selected_policy.user_id,
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
    calculation_snapshot = calculation,
    manually_adjusted = true,
    last_manual_edit_at = now_at,
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

revoke all on function public.create_manual_attendance(date, uuid, time, time, text) from public;
revoke execute on function public.create_manual_attendance(date, uuid, time, time, text) from anon;
grant execute on function public.create_manual_attendance(date, uuid, time, time, text) to authenticated;

revoke all on function public.edit_attendance_record(uuid, uuid, time, time, text) from public;
revoke execute on function public.edit_attendance_record(uuid, uuid, time, time, text) from anon;
grant execute on function public.edit_attendance_record(uuid, uuid, time, time, text) to authenticated;

revoke all on function public.delete_attendance_record(uuid) from public;
revoke execute on function public.delete_attendance_record(uuid) from anon;
grant execute on function public.delete_attendance_record(uuid) to authenticated;
