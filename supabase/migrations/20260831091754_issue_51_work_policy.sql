-- Issue 51: assignment-owned work policy lifecycle and resolution

alter table public.work_policies
  drop constraint work_policies_no_overlapping_effective_dates;

alter table public.work_policies
  alter column context_id drop not null;

alter table public.work_policies
  add constraint work_policies_assignment_no_overlapping_effective_dates
    exclude using gist (
      assignment_id with =,
      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
    );

drop trigger work_policies_prevent_update on public.work_policies;
drop function public.prevent_work_policy_update();

create function public.validate_work_policy_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  assignment_record public.work_assignments;
  has_attendance boolean;
  max_attendance_date date;
begin
  if tg_op = 'INSERT' and new.assignment_id is null then
    raise exception 'work policy assignment is required'
      using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id is distinct from old.user_id then
      raise exception 'cannot change work policy owner'
        using errcode = 'P0001';
    end if;

    if new.assignment_id is distinct from old.assignment_id then
      raise exception 'cannot change work policy assignment'
        using errcode = 'P0001';
    end if;

    if new.context_id is distinct from old.context_id then
      raise exception 'cannot change work policy context'
        using errcode = 'P0001';
    end if;

    if new.assignment_id is null then
      raise exception 'work policy assignment is required'
        using errcode = 'P0001';
    end if;
  end if;

  if new.assignment_id is not null then
    select * into assignment_record
    from public.work_assignments
    where id = new.assignment_id and user_id = new.user_id
    for update;

    if not found then
      raise exception 'work policy assignment must belong to its owner'
        using errcode = 'P0001';
    end if;

    if new.effective_from < assignment_record.effective_from
      or (assignment_record.effective_to is not null
          and (new.effective_to is null or new.effective_to > assignment_record.effective_to)) then
      raise exception 'work policy period must be within assignment period'
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from public.attendance_records
      where work_policy_id = old.id
        and user_id = old.user_id
    ) into has_attendance;

    if has_attendance then
      if new.standard_start_time is distinct from old.standard_start_time
        or new.work_minutes is distinct from old.work_minutes
        or new.fixed_break_minutes is distinct from old.fixed_break_minutes
        or new.early_arrival_policy is distinct from old.early_arrival_policy
        or new.clock_in_rounding_mode is distinct from old.clock_in_rounding_mode
        or new.clock_in_rounding_minutes is distinct from old.clock_in_rounding_minutes
        or new.clock_out_rounding_mode is distinct from old.clock_out_rounding_mode
        or new.clock_out_rounding_minutes is distinct from old.clock_out_rounding_minutes
        or new.working_days is distinct from old.working_days
        or new.timezone is distinct from old.timezone
        or new.effective_from is distinct from old.effective_from then
        raise exception 'used work policy core fields cannot be changed'
          using errcode = 'P0001';
      end if;

      if new.effective_to is distinct from old.effective_to then
        select max(work_date) into max_attendance_date
        from public.attendance_records
        where work_policy_id = old.id
          and user_id = old.user_id;

        if new.effective_to is not null and new.effective_to < max_attendance_date then
          raise exception 'work policy effective_to cannot exclude attendance records'
            using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger work_policies_validate_write
  before insert or update on public.work_policies
  for each row execute function public.validate_work_policy_write();

revoke all on function public.validate_work_policy_write() from public;

drop policy if exists work_policies_owner_insert on public.work_policies;
drop policy if exists work_policies_owner_update on public.work_policies;

revoke insert, update, delete
  on table public.work_policies
  from public, anon, authenticated;
grant select on table public.work_policies to authenticated;

create function public.create_work_policy(
  p_assignment_id uuid,
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
  assignment_record public.work_assignments;
  result_record public.work_policies;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
  end if;

  if p_assignment_id is null then
    raise exception 'work policy assignment required';
  end if;

  select * into assignment_record
  from public.work_assignments
  where id = p_assignment_id and user_id = owner_id
  for update;

  if not found then
    raise exception 'work assignment not found or not owned by user';
  end if;

  insert into public.work_policies (
    user_id, assignment_id, name, standard_start_time, work_minutes,
    fixed_break_minutes, early_arrival_policy, clock_in_rounding_mode,
    clock_in_rounding_minutes, clock_out_rounding_mode,
    clock_out_rounding_minutes, working_days, effective_from, effective_to,
    timezone
  ) values (
    owner_id, p_assignment_id, pg_catalog.btrim(p_name), p_standard_start_time,
    p_work_minutes, p_fixed_break_minutes, p_early_arrival_policy,
    p_clock_in_rounding_mode, p_clock_in_rounding_minutes,
    p_clock_out_rounding_mode, p_clock_out_rounding_minutes, p_working_days,
    p_effective_from, p_effective_to, p_timezone
  )
  returning * into result_record;

  return result_record;
end;
$$;

create function public.update_work_policy(
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

create function public.has_attendance_records_for_work_policy(p_id uuid)
returns boolean
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

  return exists (
    select 1
    from public.work_policies p
    join public.attendance_records a
      on a.work_policy_id = p.id and a.user_id = p.user_id
    where p.id = p_id and p.user_id = owner_id
  );
end;
$$;

create function public.resolve_work_assignment_policy(p_target_date date)
returns table (resolution text, assignment_id uuid, policy_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  assignment_count integer;
  policy_count integer;
  selected_assignment_id uuid;
  selected_policy_id uuid;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;
  if p_target_date is null then
    raise exception 'target date required';
  end if;

  select count(*)::integer, (array_agg(wa.id))[1]
  into assignment_count, selected_assignment_id
  from public.work_assignments wa
  where wa.user_id = owner_id
    and wa.effective_from <= p_target_date
    and (wa.effective_to is null or wa.effective_to >= p_target_date);

  if assignment_count = 0 then
    return query select 'NO_ASSIGNMENT'::text, null::uuid, null::uuid;
    return;
  end if;
  if assignment_count > 1 then
    raise exception 'multiple work assignments resolve for target date'
      using errcode = 'P0001';
  end if;

  select count(*)::integer, (array_agg(wp.id))[1]
  into policy_count, selected_policy_id
  from public.work_policies wp
  where wp.user_id = owner_id
    and wp.assignment_id = selected_assignment_id
    and wp.effective_from <= p_target_date
    and (wp.effective_to is null or wp.effective_to >= p_target_date);

  if policy_count = 0 then
    return query select 'MISSING_POLICY'::text, selected_assignment_id, null::uuid;
    return;
  end if;
  if policy_count > 1 then
    raise exception 'multiple work policies resolve for assignment and target date'
      using errcode = 'P0001';
  end if;

  return query select 'RESOLVED'::text, selected_assignment_id, selected_policy_id;
end;
$$;

revoke all on function public.create_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text) from public;
revoke execute on function public.create_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text) from anon;
grant execute on function public.create_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text) to authenticated;

revoke all on function public.update_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text) from public;
revoke execute on function public.update_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text) from anon;
grant execute on function public.update_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text) to authenticated;

revoke all on function public.has_attendance_records_for_work_policy(uuid) from public;
revoke execute on function public.has_attendance_records_for_work_policy(uuid) from anon;
grant execute on function public.has_attendance_records_for_work_policy(uuid) to authenticated;

revoke all on function public.resolve_work_assignment_policy(date) from public;
revoke execute on function public.resolve_work_assignment_policy(date) from anon;
grant execute on function public.resolve_work_assignment_policy(date) to authenticated;
