create extension if not exists pgtap with schema extensions;

begin;

select plan(29);

-- Test 1-3: Table structure and constraints
select has_table('public', 'dgpa_calendar_cache', 'dgpa_calendar_cache table exists');
select col_is_pk('public', 'dgpa_calendar_cache', 'calendar_date', 'calendar_date is primary key');
select col_type_is('public', 'dgpa_calendar_cache', 'fetched_at', 'timestamp with time zone', 'fetched_at is timestamptz');

-- Create test users
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000021', 'user21a@example.com'),
  ('00000000-0000-0000-0000-000000000022', 'user21b@example.com')
on conflict do nothing;

-- Insert baseline test data directly as superuser/service_role
insert into public.dgpa_calendar_cache (calendar_date, day_type, name, source, fetched_at)
values
  ('2026-01-01', 'HOLIDAY', '中華民國開國紀念日', 'https://data.gov.tw/dataset/14718/test', '2026-01-01 00:00:00+00'),
  ('2026-01-02', 'WORKDAY', null, 'https://data.gov.tw/dataset/14718/test', '2026-01-01 00:00:00+00');

-- Test Check Constraint on day_type
select throws_ok(
  $$insert into public.dgpa_calendar_cache (calendar_date, day_type, name, source, fetched_at) values ('2026-01-03', 'INVALID', null, 'test', now())$$,
  '23514',
  NULL,
  'Invalid day_type is rejected by check constraint'
);

-- Test RLS as Authenticated user
set local role authenticated;
set local "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000021", "role": "authenticated"}';

select is(
  (select count(*)::int from public.dgpa_calendar_cache where calendar_date in ('2026-01-01', '2026-01-02')),
  2,
  'Authenticated user can select dgpa_calendar_cache'
);

select throws_ok(
  $$insert into public.dgpa_calendar_cache (calendar_date, day_type, name, source, fetched_at) values ('2026-01-04', 'WORKDAY', null, 'test', now())$$,
  '42501',
  NULL,
  'Authenticated user cannot insert into dgpa_calendar_cache directly'
);

select throws_ok(
  $$update public.dgpa_calendar_cache set name = 'Hacked' where calendar_date = '2026-01-01'$$,
  '42501',
  NULL,
  'Authenticated user cannot update dgpa_calendar_cache directly'
);

select throws_ok(
  $$delete from public.dgpa_calendar_cache where calendar_date = '2026-01-01'$$,
  '42501',
  NULL,
  'Authenticated user cannot delete from dgpa_calendar_cache directly'
);

-- Authenticated cannot execute sync RPC
select throws_ok(
  $$select public.sync_dgpa_calendar_year(2026, 'test', now(), '[]'::jsonb)$$,
  '42501',
  NULL,
  'Authenticated user cannot execute sync_dgpa_calendar_year RPC'
);

-- Test as Anon
set local role anon;
set local "request.jwt.claims" = '{"role": "anon"}';

select throws_ok(
  $$select count(*) from public.dgpa_calendar_cache$$,
  '42501',
  NULL,
  'Anon user cannot select dgpa_calendar_cache'
);

select throws_ok(
  $$insert into public.dgpa_calendar_cache (calendar_date, day_type, name, source, fetched_at) values ('2026-01-04', 'WORKDAY', null, 'test', now())$$,
  '42501',
  NULL,
  'Anon user cannot insert into dgpa_calendar_cache'
);

select throws_ok(
  $$select public.sync_dgpa_calendar_year(2026, 'test', now(), '[]'::jsonb)$$,
  '42501',
  NULL,
  'Anon user cannot execute sync_dgpa_calendar_year RPC'
);

-- Reset role to postgres (trusted service role seam)
reset role;

-- Helper to generate full year jsonb array for testing
-- Non-leap year 2025: 365 days
create or replace function pg_temp.make_test_year_jsonb(p_year int, p_count int default null)
returns jsonb
language plpgsql
as $$
declare
  v_start date := make_date(p_year, 1, 1);
  v_days int := coalesce(p_count, case when (p_year % 4 = 0 and p_year % 100 <> 0) or (p_year % 400 = 0) then 366 else 365 end);
  v_arr jsonb := '[]'::jsonb;
  v_d int;
  v_cur date;
begin
  for v_d in 0..(v_days - 1) loop
    v_cur := v_start + v_d;
    v_arr := v_arr || jsonb_build_object(
      'calendar_date', to_char(v_cur, 'YYYY-MM-DD'),
      'day_type', case when extract(dow from v_cur) in (0, 6) then 'HOLIDAY' else 'WORKDAY' end,
      'name', case when v_d = 0 then '元旦' else null end
    );
  end loop;
  return v_arr;
end;
$$;

-- Test sync_dgpa_calendar_year RPC input validation
select throws_ok(
  $$select public.sync_dgpa_calendar_year(1899, 'https://test', now(), '[]'::jsonb)$$,
  'P0001',
  NULL,
  'Invalid target year < 1900 is rejected'
);

select throws_ok(
  $$select public.sync_dgpa_calendar_year(2025, '', now(), '[]'::jsonb)$$,
  'P0001',
  NULL,
  'Empty source is rejected'
);

select throws_ok(
  $$select public.sync_dgpa_calendar_year(2025, 'https://test', now(), '{"not": "an array"}'::jsonb)$$,
  'P0001',
  NULL,
  'Non-array rows payload is rejected'
);

select throws_ok(
  $$select public.sync_dgpa_calendar_year(2025, 'https://test', now(), pg_temp.make_test_year_jsonb(2025, 364))$$,
  'P0001',
  NULL,
  'Incomplete year (364 days for 2025) is rejected'
);

select throws_ok(
  $$select public.sync_dgpa_calendar_year(2024, 'https://test', now(), pg_temp.make_test_year_jsonb(2024, 365))$$,
  'P0001',
  NULL,
  'Leap year (2024) with only 365 days is rejected'
);

-- Test foreign year date inside array
select throws_ok(
  $$select public.sync_dgpa_calendar_year(
    2025,
    'https://test',
    now(),
    jsonb_set(pg_temp.make_test_year_jsonb(2025), '{0,calendar_date}', '"2024-12-31"')
  )$$,
  'P0001',
  NULL,
  'Row with foreign year date is rejected'
);

-- Test invalid day_type inside array
select throws_ok(
  $$select public.sync_dgpa_calendar_year(
    2025,
    'https://test',
    now(),
    jsonb_set(pg_temp.make_test_year_jsonb(2025), '{0,day_type}', '"WEEKEND"')
  )$$,
  'P0001',
  NULL,
  'Row with invalid day_type is rejected'
);

-- Test successful full year sync for 2025 (365 days)
select is(
  public.sync_dgpa_calendar_year(2025, 'https://data.gov.tw/resource/2025', '2025-01-01 12:00:00+00', pg_temp.make_test_year_jsonb(2025)),
  365,
  'Sync 2025 inserts 365 days'
);

select is(
  (select count(*)::int from public.dgpa_calendar_cache where calendar_date >= '2025-01-01' and calendar_date <= '2025-12-31'),
  365,
  '2025 has exactly 365 rows in dgpa_calendar_cache'
);

-- Test successful full year sync for 2024 leap year (366 days)
select is(
  public.sync_dgpa_calendar_year(2024, 'https://data.gov.tw/resource/2024', '2024-01-01 12:00:00+00', pg_temp.make_test_year_jsonb(2024)),
  366,
  'Sync 2024 leap year inserts 366 days'
);

select is(
  (select count(*)::int from public.dgpa_calendar_cache where calendar_date >= '2024-01-01' and calendar_date <= '2024-12-31'),
  366,
  '2024 has exactly 366 rows in dgpa_calendar_cache'
);

-- Verify cross-year isolation: syncing 2025 again with updated source does not affect 2024
select is(
  public.sync_dgpa_calendar_year(2025, 'https://data.gov.tw/resource/2025-v2', '2025-06-01 12:00:00+00', pg_temp.make_test_year_jsonb(2025)),
  365,
  'Re-sync 2025 succeeds'
);

select is(
  (select count(*)::int from public.dgpa_calendar_cache where calendar_date >= '2024-01-01' and calendar_date <= '2024-12-31'),
  366,
  '2024 rows remain 366 after re-syncing 2025'
);

select is(
  (select source from public.dgpa_calendar_cache where calendar_date = '2025-01-01'),
  'https://data.gov.tw/resource/2025-v2',
  '2025 source was updated to new source'
);

select is(
  (select source from public.dgpa_calendar_cache where calendar_date = '2024-01-01'),
  'https://data.gov.tw/resource/2024',
  '2024 source was unchanged'
);

-- Test failed sync preserves existing rows (atomic rollback)
select throws_ok(
  $$select public.sync_dgpa_calendar_year(
    2025,
    'https://test',
    now(),
    jsonb_set(pg_temp.make_test_year_jsonb(2025), '{1,calendar_date}', '"2025-01-01"')
  )$$,
  'P0001',
  NULL,
  'Sync with duplicate date throws error'
);

select is(
  (select count(*)::int from public.dgpa_calendar_cache where calendar_date >= '2025-01-01' and calendar_date <= '2025-12-31'),
  365,
  'Failed sync rolls back, 2025 still has 365 rows'
);

select finish();

rollback;
