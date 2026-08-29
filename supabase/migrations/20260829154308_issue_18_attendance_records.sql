alter table public.work_policies
  add constraint work_policies_id_user_id_context_id_key unique (id, user_id, context_id);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  context_id uuid not null,
  work_policy_id uuid not null,
  actual_clock_in_at timestamptz not null,
  actual_clock_out_at timestamptz,
  effective_clock_in_at timestamptz not null,
  effective_clock_out_at timestamptz,
  expected_clock_out_at timestamptz not null,
  actual_elapsed_minutes integer,
  net_worked_minutes integer,
  regular_minutes integer,
  overtime_minutes integer,
  context_snapshot jsonb not null,
  policy_snapshot jsonb not null,
  calculation_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_context_owner_fkey
    foreign key (context_id, user_id)
    references public.work_contexts (id, user_id)
    on delete restrict,
  constraint attendance_records_policy_owner_fkey
    foreign key (work_policy_id, user_id, context_id)
    references public.work_policies (id, user_id, context_id)
    on delete restrict,
  constraint attendance_records_one_per_user_date unique (user_id, work_date),
  constraint attendance_records_work_date_taipei check (
    work_date = (actual_clock_in_at at time zone 'Asia/Taipei')::date
  ),
  constraint attendance_records_same_taipei_day check (
    actual_clock_out_at is null
    or (actual_clock_out_at at time zone 'Asia/Taipei')::date = work_date
  ),
  constraint attendance_records_time_order check (
    actual_clock_out_at is null or actual_clock_out_at >= actual_clock_in_at
  ),
  constraint attendance_records_completion_nullability check (
    (actual_clock_out_at is null
      and effective_clock_out_at is null
      and actual_elapsed_minutes is null
      and net_worked_minutes is null
      and regular_minutes is null
      and overtime_minutes is null)
    or (actual_clock_out_at is not null
      and effective_clock_out_at is not null
      and actual_elapsed_minutes is not null
      and net_worked_minutes is not null
      and regular_minutes is not null
      and overtime_minutes is not null)
  ),
  constraint attendance_records_nonnegative_minutes check (
    (actual_elapsed_minutes is null or actual_elapsed_minutes >= 0)
    and (net_worked_minutes is null or net_worked_minutes >= 0)
    and (regular_minutes is null or regular_minutes >= 0)
    and (overtime_minutes is null or overtime_minutes >= 0)
  ),
  constraint attendance_records_snapshot_objects check (
    jsonb_typeof(context_snapshot) = 'object'
    and jsonb_typeof(policy_snapshot) = 'object'
    and jsonb_typeof(calculation_snapshot) = 'object'
  )
);

create index attendance_records_user_id_idx
  on public.attendance_records (user_id);
create index attendance_records_context_owner_idx
  on public.attendance_records (context_id, user_id);
create index attendance_records_policy_owner_idx
  on public.attendance_records (work_policy_id, user_id, context_id);

alter table public.attendance_records enable row level security;

revoke all on table public.attendance_records from public, anon, authenticated;
grant select on table public.attendance_records to authenticated;

create policy attendance_records_owner_select on public.attendance_records
  for select to authenticated
  using (user_id = (select auth.uid()));

create function public.prevent_attendance_snapshot_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.work_date is distinct from old.work_date
    or new.context_id is distinct from old.context_id
    or new.work_policy_id is distinct from old.work_policy_id
    or new.actual_clock_in_at is distinct from old.actual_clock_in_at
    or new.context_snapshot is distinct from old.context_snapshot
    or new.policy_snapshot is distinct from old.policy_snapshot
    or (
      new.calculation_snapshot is distinct from old.calculation_snapshot
      and current_setting('app.attendance_rpc', true) is distinct from 'on'
    ) then
    raise exception 'attendance history and snapshots are immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger attendance_records_prevent_history_update
  before update on public.attendance_records
  for each row execute function public.prevent_attendance_snapshot_update();
create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function public.set_updated_at();

revoke all on function public.prevent_attendance_snapshot_update() from public;

create function public.clock_in_today()
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
  selected_context public.work_contexts;
  selected_policy public.work_policies;
  standard_start_at timestamptz;
  taipei_midnight timestamptz;
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

  select * into selected_context
  from public.work_contexts
  where user_id = owner_id and active and is_default;
  if not found then
    raise exception 'active default work context required';
  end if;

  select * into selected_policy
  from public.work_policies
  where user_id = owner_id
    and context_id = selected_context.id
    and effective_from <= work_day
    and (effective_to is null or effective_to >= work_day)
  order by effective_from desc
  limit 1;
  if not found then
    raise exception 'applicable work policy required';
  end if;

  taipei_midnight := (work_day::timestamp at time zone 'Asia/Taipei');
  standard_start_at := ((work_day + selected_policy.standard_start_time)::timestamp at time zone 'Asia/Taipei');
  effective_start_at := case
    when now_at <= standard_start_at and selected_policy.early_arrival_policy = 'STANDARD_START'
      then standard_start_at
    when now_at > standard_start_at and selected_policy.clock_in_rounding_mode = 'CEIL'
      then taipei_midnight
        + pg_catalog.ceil(
            extract(epoch from (now_at - taipei_midnight)) / 60
            / selected_policy.clock_in_rounding_minutes
          ) * interval '1 minute' * selected_policy.clock_in_rounding_minutes
    else now_at
  end;
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
    user_id, work_date, context_id, work_policy_id,
    actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
    context_snapshot, policy_snapshot, calculation_snapshot
  ) values (
    owner_id, work_day, selected_context.id, selected_policy.id,
    now_at, effective_start_at, expected_end_at,
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

create function public.clock_out_today()
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
  effective_end_at timestamptz;
  taipei_midnight timestamptz;
  rounding_mode text;
  rounding_minutes integer;
  actual_elapsed integer;
  net_worked integer;
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
  if not found then
    raise exception 'today attendance record not found';
  end if;
  if existing_record.actual_clock_out_at is not null then
    return existing_record;
  end if;

  rounding_mode := coalesce(existing_record.policy_snapshot->>'clock_out_rounding_mode', 'NONE');
  rounding_minutes := nullif(existing_record.policy_snapshot->>'clock_out_rounding_minutes', '')::integer;
  taipei_midnight := (work_day::timestamp at time zone 'Asia/Taipei');
  effective_end_at := case rounding_mode
    when 'CEIL' then taipei_midnight
      + pg_catalog.ceil(
          extract(epoch from (now_at - taipei_midnight)) / 60 / rounding_minutes
        ) * interval '1 minute' * rounding_minutes
    when 'FLOOR' then taipei_midnight
      + pg_catalog.floor(
          extract(epoch from (now_at - taipei_midnight)) / 60 / rounding_minutes
        ) * interval '1 minute' * rounding_minutes
    else now_at
  end;

  actual_elapsed := pg_catalog.floor(extract(epoch from (now_at - existing_record.actual_clock_in_at)) / 60);
  net_worked := greatest(
    0,
    pg_catalog.floor(extract(epoch from (effective_end_at - existing_record.effective_clock_in_at)) / 60)::integer
      - (existing_record.policy_snapshot->>'fixed_break_minutes')::integer
  );
  calculation := pg_catalog.jsonb_build_object(
    'calculation_version', existing_record.calculation_snapshot->>'calculation_version',
    'calculated_at', now_at,
    'state', 'COMPLETED',
    'actual_clock_in_at', existing_record.actual_clock_in_at,
    'actual_clock_out_at', now_at,
    'effective_clock_in_at', existing_record.effective_clock_in_at,
    'effective_clock_out_at', effective_end_at,
    'expected_clock_out_at', existing_record.expected_clock_out_at,
    'actual_elapsed_minutes', actual_elapsed,
    'net_worked_minutes', net_worked,
    'regular_minutes', least(net_worked, (existing_record.policy_snapshot->>'work_minutes')::integer),
    'overtime_minutes', greatest(0, net_worked - (existing_record.policy_snapshot->>'work_minutes')::integer)
  );

  perform pg_catalog.set_config('app.attendance_rpc', 'on', true);
  update public.attendance_records
  set
    actual_clock_out_at = now_at,
    effective_clock_out_at = effective_end_at,
    actual_elapsed_minutes = actual_elapsed,
    net_worked_minutes = net_worked,
    regular_minutes = least(net_worked, (existing_record.policy_snapshot->>'work_minutes')::integer),
    overtime_minutes = greatest(0, net_worked - (existing_record.policy_snapshot->>'work_minutes')::integer),
    calculation_snapshot = calculation
  where id = existing_record.id
  returning * into existing_record;
  perform pg_catalog.set_config('app.attendance_rpc', '', true);

  return existing_record;
end;
$$;

revoke all on function public.clock_in_today() from public;
revoke execute on function public.clock_in_today() from anon;
grant execute on function public.clock_in_today() to authenticated;
revoke all on function public.clock_out_today() from public;
revoke execute on function public.clock_out_today() from anon;
grant execute on function public.clock_out_today() to authenticated;
