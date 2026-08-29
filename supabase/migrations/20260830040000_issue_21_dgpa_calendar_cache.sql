-- Issue #21: DGPA Calendar Cache & Privileged Sync Seam

create table if not exists public.dgpa_calendar_cache (
  calendar_date date primary key,
  day_type text not null check (day_type in ('WORKDAY', 'HOLIDAY')),
  name text,
  source text not null,
  fetched_at timestamptz not null
);

alter table public.dgpa_calendar_cache enable row level security;

drop policy if exists dgpa_calendar_cache_select_policy on public.dgpa_calendar_cache;
create policy dgpa_calendar_cache_select_policy
  on public.dgpa_calendar_cache
  for select
  to authenticated
  using (true);

revoke all on table public.dgpa_calendar_cache from public, anon, authenticated;
grant select on public.dgpa_calendar_cache to authenticated;
grant all on table public.dgpa_calendar_cache to service_role;

create or replace function public.sync_dgpa_calendar_year(
  target_year integer,
  p_source text,
  p_fetched_at timestamptz,
  rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_expected_days integer;
  v_inserted_count integer;
  v_distinct_count integer;
begin
  if target_year is null or target_year < 1900 or target_year > 2100 then
    raise exception 'Invalid target year: %', target_year;
  end if;

  if p_source is null or pg_catalog.btrim(p_source) = '' then
    raise exception 'Source must not be empty';
  end if;

  if p_fetched_at is null then
    raise exception 'Fetched_at must not be null';
  end if;

  if jsonb_typeof(rows) <> 'array' then
    raise exception 'Rows must be a JSON array';
  end if;

  -- Leap year check: divisible by 4 and not by 100, or divisible by 400
  if (target_year % 4 = 0 and target_year % 100 <> 0) or (target_year % 400 = 0) then
    v_expected_days := 366;
  else
    v_expected_days := 365;
  end if;

  if jsonb_array_length(rows) <> v_expected_days then
    raise exception 'Expected % rows for year %, got %', v_expected_days, target_year, jsonb_array_length(rows);
  end if;

  -- Check if any row has non-matching year or invalid day_type or invalid date format
  if exists (
    select 1
    from jsonb_array_elements(rows) as elem
    where (elem->>'calendar_date') is null
       or not (elem->>'calendar_date' ~ '^\d{4}-\d{2}-\d{2}$')
       or pg_catalog.date_part('year', (elem->>'calendar_date')::date) <> target_year
       or (elem->>'day_type') not in ('WORKDAY', 'HOLIDAY')
  ) then
    raise exception 'Invalid date or day_type found in sync payload';
  end if;

  -- Check unique dates count
  select count(distinct (elem->>'calendar_date')::date)
  into v_distinct_count
  from jsonb_array_elements(rows) as elem;

  if v_distinct_count <> v_expected_days then
    raise exception 'Unique date count mismatch: expected %, got %', v_expected_days, v_distinct_count;
  end if;

  -- Atomic delete existing target year rows
  delete from public.dgpa_calendar_cache
  where calendar_date >= pg_catalog.make_date(target_year, 1, 1)
    and calendar_date <= pg_catalog.make_date(target_year, 12, 31);

  -- Insert validated rows
  insert into public.dgpa_calendar_cache (
    calendar_date,
    day_type,
    name,
    source,
    fetched_at
  )
  select
    (elem->>'calendar_date')::date,
    elem->>'day_type',
    nullif(pg_catalog.btrim(elem->>'name'), ''),
    p_source,
    p_fetched_at
  from jsonb_array_elements(rows) as elem;

  get diagnostics v_inserted_count = row_count;

  if v_inserted_count <> v_expected_days then
    raise exception 'Insert count mismatch: expected %, got %', v_expected_days, v_inserted_count;
  end if;

  return v_inserted_count;
end;
$$;

revoke all on function public.sync_dgpa_calendar_year(integer, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.sync_dgpa_calendar_year(integer, text, timestamptz, jsonb) to service_role;
