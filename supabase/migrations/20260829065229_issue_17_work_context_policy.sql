-- attendance_records and its historical foreign-key coverage are deferred to Issue #18.

create extension if not exists btree_gist with schema public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Taipei' check (timezone = 'Asia/Taipei'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.work_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  company_identifier text not null check (btrim(company_identifier) <> ''),
  project_identifier text not null check (btrim(project_identifier) <> ''),
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_contexts_default_requires_active check (not is_default or active),
  unique (id, user_id)
);

create unique index work_contexts_one_active_default_per_user
  on public.work_contexts (user_id)
  where active and is_default;

create table public.work_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_id uuid not null,
  name text not null check (btrim(name) <> ''),
  standard_start_time time not null,
  work_minutes integer not null check (work_minutes >= 0),
  fixed_break_minutes integer not null check (fixed_break_minutes >= 0),
  early_arrival_policy text not null check (early_arrival_policy in ('STANDARD_START', 'ACTUAL')),
  clock_in_rounding_mode text not null default 'NONE'
    check (clock_in_rounding_mode in ('NONE', 'CEIL')),
  clock_in_rounding_minutes integer,
  clock_out_rounding_mode text not null default 'NONE'
    check (clock_out_rounding_mode in ('NONE', 'CEIL', 'FLOOR')),
  clock_out_rounding_minutes integer,
  working_days text[] not null default array['1', '2', '3', '4', '5'],
  timezone text not null default 'Asia/Taipei' check (timezone = 'Asia/Taipei'),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_policies_clock_in_minutes check (
    (clock_in_rounding_mode = 'NONE' and clock_in_rounding_minutes is null)
    or (clock_in_rounding_mode = 'CEIL' and clock_in_rounding_minutes > 0)
  ),
  constraint work_policies_clock_out_minutes check (
    (clock_out_rounding_mode = 'NONE' and clock_out_rounding_minutes is null)
    or (clock_out_rounding_mode in ('CEIL', 'FLOOR') and clock_out_rounding_minutes > 0)
  ),
  constraint work_policies_working_days_not_empty check (cardinality(working_days) > 0),
  constraint work_policies_working_days_values check (
    array_position(working_days, null::text) is null
    and working_days <@ array['0', '1', '2', '3', '4', '5', '6']::text[]
  ),
  constraint work_policies_effective_dates check (effective_to is null or effective_to >= effective_from),
  constraint work_policies_context_owner_fkey
    foreign key (context_id, user_id)
    references public.work_contexts (id, user_id)
    on delete restrict,
  constraint work_policies_no_overlapping_effective_dates
    exclude using gist (
      user_id with =,
      context_id with =,
      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
    )
);

alter table public.profiles enable row level security;
alter table public.work_contexts enable row level security;
alter table public.work_policies enable row level security;

grant select, insert, update, delete
  on table public.profiles, public.work_contexts, public.work_policies
  to authenticated;

create policy profiles_owner_select on public.profiles
  for select using (id = (select auth.uid()));
create policy profiles_owner_insert on public.profiles
  for insert with check (id = (select auth.uid()));
create policy profiles_owner_update on public.profiles
  for update using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy profiles_owner_delete on public.profiles
  for delete using (id = (select auth.uid()));

create policy work_contexts_owner_select on public.work_contexts
  for select using (user_id = (select auth.uid()));
create policy work_contexts_owner_insert on public.work_contexts
  for insert
  with check (user_id = (select auth.uid()) and not active and not is_default);
create policy work_contexts_owner_update on public.work_contexts
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy work_contexts_owner_delete on public.work_contexts
  for delete using (user_id = (select auth.uid()));

create policy work_policies_owner_select on public.work_policies
  for select using (user_id = (select auth.uid()));
create policy work_policies_owner_insert on public.work_policies
  for insert with check (user_id = (select auth.uid()));
create policy work_policies_owner_update on public.work_policies
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy work_policies_owner_delete on public.work_policies
  for delete using (user_id = (select auth.uid()));

create function public.prevent_direct_default_context_change()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' and new.is_default
    and current_setting('app.work_context_default_rpc', true) is distinct from 'on' then
    raise exception 'is_default can only be changed through the default context RPC';
  end if;

  if tg_op = 'UPDATE' and new.is_default is distinct from old.is_default
    and current_setting('app.work_context_default_rpc', true) is distinct from 'on' then
    raise exception 'is_default can only be changed through the default context RPC';
  end if;

  if tg_op = 'UPDATE' and not old.active and new.active
    and not exists (
      select 1 from public.work_contexts
      where user_id = new.user_id and active and is_default
    )
    and current_setting('app.work_context_default_rpc', true) is distinct from 'on' then
    raise exception 'the first active work context must be created through the RPC';
  end if;

  return new;
end;
$$;

create trigger work_contexts_prevent_direct_default_change
  before insert or update on public.work_contexts
  for each row execute function public.prevent_direct_default_context_change();

revoke all on function public.prevent_direct_default_context_change() from public;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

create function public.prevent_work_policy_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.context_id is distinct from old.context_id
    or new.name is distinct from old.name
    or new.standard_start_time is distinct from old.standard_start_time
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
    raise exception 'work policy fields cannot be changed after creation'
      using errcode = 'P0001';
  end if;

  if old.effective_to is not null then
    if new.effective_to is distinct from old.effective_to then
      raise exception 'effective_to can only be set once'
        using errcode = 'P0001';
    end if;
  elsif new.effective_to is not null and new.effective_to < old.effective_from then
    raise exception 'effective_to cannot precede effective_from'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger work_contexts_set_updated_at
  before update on public.work_contexts
  for each row execute function public.set_updated_at();
create trigger work_policies_prevent_update
  before update on public.work_policies
  for each row execute function public.prevent_work_policy_update();
create trigger work_policies_set_updated_at
  before update on public.work_policies
  for each row execute function public.set_updated_at();

revoke all on function public.set_updated_at() from public;
revoke all on function public.prevent_work_policy_update() from public;

create function public.create_work_context(
  p_name text,
  p_company_identifier text,
  p_project_identifier text,
  p_active boolean default true
)
returns public.work_contexts
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  has_active_context boolean;
  created_context public.work_contexts;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
  end if;

  select exists(
    select 1 from public.work_contexts
    where user_id = owner_id and active
  ) into has_active_context;

  perform pg_catalog.set_config('app.work_context_default_rpc', 'on', true);
  insert into public.work_contexts (
    user_id, name, company_identifier, project_identifier, active, is_default
  )
  values (
    owner_id, p_name, p_company_identifier, p_project_identifier,
    p_active, p_active and not has_active_context
  )
  returning * into created_context;

  perform pg_catalog.set_config('app.work_context_default_rpc', '', true);
  return created_context;
end;
$$;

create function public.set_default_work_context(p_context_id uuid)
returns public.work_contexts
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  selected_context public.work_contexts;
begin
  if owner_id is null then
    raise exception 'authenticated user required';
  end if;

  perform 1 from public.profiles where id = owner_id for update;
  if not found then
    raise exception 'profile required for user %', owner_id;
  end if;

  select * into selected_context
  from public.work_contexts
  where id = p_context_id and user_id = owner_id and active
  for update;

  if not found then
    raise exception 'active work context not found';
  end if;

  perform pg_catalog.set_config('app.work_context_default_rpc', 'on', true);
  update public.work_contexts
  set is_default = false
  where user_id = owner_id and is_default;

  update public.work_contexts
  set is_default = true
  where id = p_context_id and user_id = owner_id;

  perform pg_catalog.set_config('app.work_context_default_rpc', '', true);
  select * into selected_context
  from public.work_contexts
  where id = p_context_id;
  return selected_context;
end;
$$;

revoke all on function public.create_work_context(text, text, text, boolean) from public;
grant execute on function public.create_work_context(text, text, text, boolean) to authenticated;
revoke all on function public.set_default_work_context(uuid) from public;
grant execute on function public.set_default_work_context(uuid) to authenticated;
