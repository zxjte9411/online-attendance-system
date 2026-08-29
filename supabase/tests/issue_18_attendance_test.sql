begin;

select plan(66);

select has_table('public', 'attendance_records', 'attendance_records table exists');
select has_column('public', 'attendance_records', 'work_date', 'work_date exists');
select has_column('public', 'attendance_records', 'context_id', 'context_id exists');
select has_column('public', 'attendance_records', 'work_policy_id', 'work_policy_id exists');
select has_column('public', 'attendance_records', 'actual_clock_in_at', 'actual_clock_in_at exists');
select has_column('public', 'attendance_records', 'actual_clock_out_at', 'actual_clock_out_at exists');
select has_column('public', 'attendance_records', 'effective_clock_in_at', 'effective_clock_in_at exists');
select has_column('public', 'attendance_records', 'effective_clock_out_at', 'effective_clock_out_at exists');
select has_column('public', 'attendance_records', 'expected_clock_out_at', 'expected_clock_out_at exists');
select has_column('public', 'attendance_records', 'actual_elapsed_minutes', 'actual_elapsed_minutes exists');
select has_column('public', 'attendance_records', 'net_worked_minutes', 'net_worked_minutes exists');
select has_column('public', 'attendance_records', 'regular_minutes', 'regular_minutes exists');
select has_column('public', 'attendance_records', 'overtime_minutes', 'overtime_minutes exists');
select has_column('public', 'attendance_records', 'context_snapshot', 'context_snapshot exists');
select has_column('public', 'attendance_records', 'policy_snapshot', 'policy_snapshot exists');
select has_column('public', 'attendance_records', 'calculation_snapshot', 'calculation_snapshot exists');
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.attendance_records'::regclass
     and contype = 'f'),
  3,
  'attendance_records has user, historical context, and historical policy foreign keys'
);
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.attendance_records'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%(user_id, work_date)%'),
  1,
  'one attendance record per user and Taipei work date'
);
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.work_policies'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%(id, user_id, context_id)%'),
  1,
  'work policies have the composite key required by the historical policy FK'
);
select ok(
  (select pg_get_constraintdef(oid) like '%(work_policy_id, user_id, context_id)%'
   from pg_constraint
   where conrelid = 'public.attendance_records'::regclass
     and conname = 'attendance_records_policy_owner_fkey'),
  'policy history FK includes the context owner key'
);
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.attendance_records'::regclass
     and contype = 'c'
     and conname like 'attendance_records_%'),
  6,
  'attendance_records has the required temporal, completion, minute, and snapshot checks'
);
select is(has_table_privilege('authenticated', 'public.attendance_records', 'SELECT'), true, 'authenticated can select attendance records');
select is(has_table_privilege('authenticated', 'public.attendance_records', 'INSERT'), false, 'authenticated cannot insert attendance records directly');
select is(has_table_privilege('authenticated', 'public.attendance_records', 'UPDATE'), false, 'authenticated cannot update attendance records directly');
select is(has_table_privilege('authenticated', 'public.attendance_records', 'DELETE'), false, 'authenticated cannot delete attendance records directly');
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.attendance_records'::regclass and polcmd = 'r'),
  1,
  'attendance records has one SELECT policy'
);
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.attendance_records'::regclass and polcmd in ('a', 'w', 'd')),
  0,
  'attendance records has no direct write policies'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  true,
  'clock_in_today is SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  array['search_path=""'],
  'clock_in_today uses an empty search_path'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.clock_out_today()'::regprocedure),
  true,
  'clock_out_today is SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.clock_out_today()'::regprocedure),
  array['search_path=""'],
  'clock_out_today uses an empty search_path'
);
select is(has_function_privilege('anon', 'public.clock_in_today()', 'EXECUTE'), false, 'anon cannot execute clock_in_today');
select is(has_function_privilege('authenticated', 'public.clock_in_today()', 'EXECUTE'), true, 'authenticated can execute clock_in_today');
select is(has_function_privilege('anon', 'public.clock_out_today()', 'EXECUTE'), false, 'anon cannot execute clock_out_today');
select is(has_function_privilege('authenticated', 'public.clock_out_today()', 'EXECUTE'), true, 'authenticated can execute clock_out_today');

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000018', 'issue18-a@example.test'),
  ('00000000-0000-0000-0000-000000000019', 'issue18-b@example.test'),
  ('00000000-0000-0000-0000-000000000020', 'issue18-c@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000018', 'Issue 18 A'),
  ('00000000-0000-0000-0000-000000000019', 'Issue 18 B'),
  ('00000000-0000-0000-0000-000000000020', 'Issue 18 C');

set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000018';

select * into temporary issue_18_a_context from public.create_work_context('Issue 18 A', 'Company A', 'Project A');
insert into public.work_policies (
  user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_out_rounding_mode,
  working_days, effective_from, effective_to
)
select
  '00000000-0000-0000-0000-000000000018', id, 'Issue 18 A policy', '00:00', 480, 60,
  'STANDARD_START', 'NONE', 'NONE', array['0', '1', '2', '3', '4', '5', '6'],
  (clock_timestamp() at time zone 'Asia/Taipei')::date,
  (clock_timestamp() at time zone 'Asia/Taipei')::date
from public.work_contexts
where user_id = '00000000-0000-0000-0000-000000000018';

select * into temporary issue_18_a_clock_in from public.clock_in_today();
select is((select count(*)::integer from issue_18_a_clock_in), 1, 'clock-in creates one record');
select ok((select actual_clock_in_at between clock_timestamp() - interval '1 minute' and clock_timestamp() from issue_18_a_clock_in), 'clock-in stores DB time');
select ok((select expected_clock_out_at = effective_clock_in_at + interval '540 minutes' from issue_18_a_clock_in), 'clock-in returns expected clock-out');
select ok(
  (select calculation_snapshot->>'calculation_version' = 'v1'
    and calculation_snapshot->>'state' = 'IN_PROGRESS'
    and calculation_snapshot->>'actual_clock_in_at' is not null
    and calculation_snapshot->>'actual_clock_out_at' is null
    and calculation_snapshot->>'calculated_at' is not null
   from issue_18_a_clock_in),
  'clock-in calculation snapshot contains version, state, calculated time, and actual inputs'
);
select is((select context_snapshot->>'name' from issue_18_a_clock_in), 'Issue 18 A', 'clock-in stores context snapshot');
select is((select context_snapshot->>'project_identifier' from issue_18_a_clock_in), 'Project A', 'context snapshot stores explicit context fields');
select is((select policy_snapshot->>'work_minutes' from issue_18_a_clock_in), '480', 'clock-in stores policy snapshot');
select is((select policy_snapshot->>'clock_out_rounding_mode' from issue_18_a_clock_in), 'NONE', 'policy snapshot stores explicit policy fields');
select is((select (calculation_snapshot->>'effective_clock_in_at')::timestamptz from issue_18_a_clock_in), (select effective_clock_in_at from issue_18_a_clock_in), 'clock-in stores calculation snapshot');

select * into temporary issue_18_a_retry from public.clock_in_today();
select is((select id from issue_18_a_retry), (select id from issue_18_a_clock_in), 'clock-in retry returns the existing record');
select is((select actual_clock_in_at from issue_18_a_retry), (select actual_clock_in_at from issue_18_a_clock_in), 'clock-in retry does not replace DB time');
select throws_ok(
  $$insert into public.attendance_records (user_id, work_date, context_id, work_policy_id, actual_clock_in_at, context_snapshot, policy_snapshot, calculation_snapshot)
    select user_id, work_date, context_id, work_policy_id, actual_clock_in_at, context_snapshot, policy_snapshot, calculation_snapshot from issue_18_a_clock_in$$,
  '42501', null, 'direct attendance insert is rejected'
);
select throws_ok(
  $$update public.attendance_records set policy_snapshot = '{}' where id = (select id from issue_18_a_clock_in)$$,
  '42501', null, 'direct attendance update is rejected'
);
select throws_ok(
  $$delete from public.attendance_records where id = (select id from issue_18_a_clock_in)$$,
  '42501', null, 'direct attendance delete is rejected'
);

select * into temporary issue_18_a_clock_out from public.clock_out_today();
select is((select actual_clock_out_at from issue_18_a_clock_out), (select effective_clock_out_at from issue_18_a_clock_out), 'NONE keeps actual clock-out unchanged');
select is((select (calculation_snapshot->>'effective_clock_out_at')::timestamptz from issue_18_a_clock_out), (select effective_clock_out_at from issue_18_a_clock_out), 'clock-out updates the calculation snapshot');
select is((select calculation_snapshot->>'state' from issue_18_a_clock_out), 'COMPLETED', 'clock-out records a completed calculation state');
select ok((select calculation_snapshot->>'actual_clock_in_at' is not null and calculation_snapshot->>'actual_clock_out_at' is not null from issue_18_a_clock_out), 'clock-out calculation snapshot contains actual inputs');
select is((select context_snapshot from issue_18_a_clock_out), (select context_snapshot from issue_18_a_clock_in), 'clock-out does not change context snapshot');
select is((select policy_snapshot from issue_18_a_clock_out), (select policy_snapshot from issue_18_a_clock_in), 'clock-out does not change policy snapshot');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000019';
select * into temporary issue_18_b_context from public.create_work_context('Issue 18 B', 'Company B', 'Project B');
insert into public.work_policies (
  user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
  clock_out_rounding_mode, clock_out_rounding_minutes, working_days, effective_from, effective_to
)
select
  '00000000-0000-0000-0000-000000000019', id, 'Issue 18 B policy', '00:00', 480, 0,
  'STANDARD_START', 'NONE', null, 'CEIL', 60, array['0', '1', '2', '3', '4', '5', '6'],
  (clock_timestamp() at time zone 'Asia/Taipei')::date,
  (clock_timestamp() at time zone 'Asia/Taipei')::date
from public.work_contexts
where user_id = '00000000-0000-0000-0000-000000000019';
select * into temporary issue_18_b_clock_in from public.clock_in_today();
select * into temporary issue_18_b_clock_out from public.clock_out_today();
select ok((select effective_clock_out_at >= actual_clock_out_at from issue_18_b_clock_out), 'CEIL clock-out rounds upward');
select ok((select extract(minute from effective_clock_out_at at time zone 'Asia/Taipei') = 0 from issue_18_b_clock_out), 'CEIL clock-out uses the Taipei calendar boundary');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000020';
select * into temporary issue_18_c_context from public.create_work_context('Issue 18 C', 'Company C', 'Project C');
insert into public.work_policies (
  user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_out_rounding_mode,
  clock_out_rounding_minutes, working_days, effective_from, effective_to
)
select
  '00000000-0000-0000-0000-000000000020', id, 'Issue 18 C policy', '00:00', 480, 0,
  'STANDARD_START', 'NONE', 'FLOOR', 60, array['0', '1', '2', '3', '4', '5', '6'],
  (clock_timestamp() at time zone 'Asia/Taipei')::date,
  (clock_timestamp() at time zone 'Asia/Taipei')::date
from public.work_contexts
where user_id = '00000000-0000-0000-0000-000000000020';
select * into temporary issue_18_c_clock_in from public.clock_in_today();
select * into temporary issue_18_c_clock_out from public.clock_out_today();
select ok((select effective_clock_out_at <= actual_clock_out_at from issue_18_c_clock_out), 'FLOOR clock-out rounds downward');
select ok((select extract(minute from effective_clock_out_at at time zone 'Asia/Taipei') = 0 from issue_18_c_clock_out), 'FLOOR clock-out uses the Taipei calendar boundary');

select is((select count(*)::integer from public.attendance_records), 1, 'owner SELECT sees only the owner record');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000018';
select is((select count(*)::integer from public.attendance_records), 1, 'attendance owner can see its own record');
set local role postgres;
select throws_ok(
  $$update public.attendance_records set context_snapshot = '{}' where id = (select id from issue_18_a_clock_in)$$,
  'P0001', null, 'historical snapshots are immutable to the database table owner'
);
set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000019';
select is((select count(*)::integer from public.attendance_records), 1, 'attendance SELECT is isolated by owner');

set role postgres;
select throws_ok(
  $$insert into public.attendance_records (
      user_id, work_date, context_id, work_policy_id, actual_clock_in_at,
      effective_clock_in_at, expected_clock_out_at,
      context_snapshot, policy_snapshot, calculation_snapshot
    ) select user_id, work_date + 1, context_id, work_policy_id, actual_clock_in_at,
      effective_clock_in_at, expected_clock_out_at,
      context_snapshot, policy_snapshot, calculation_snapshot from issue_18_a_clock_in$$,
  '23514', null, 'work_date must match the Taipei date of clock-in'
);
select throws_ok(
  $$insert into public.attendance_records (
      user_id, work_date, context_id, work_policy_id, actual_clock_in_at, actual_clock_out_at,
      effective_clock_in_at, expected_clock_out_at,
      context_snapshot, policy_snapshot, calculation_snapshot
    ) select user_id, work_date, context_id, work_policy_id, actual_clock_in_at,
      actual_clock_in_at + interval '1 minute', effective_clock_in_at, expected_clock_out_at,
      context_snapshot, policy_snapshot, calculation_snapshot
    from issue_18_a_clock_in$$,
  '23514', null, 'completed records require all effective and minute results'
);
select throws_ok(
  $$insert into public.attendance_records (
      user_id, work_date, context_id, work_policy_id, actual_clock_in_at, actual_clock_out_at,
      effective_clock_in_at, effective_clock_out_at, expected_clock_out_at,
      actual_elapsed_minutes, net_worked_minutes, regular_minutes, overtime_minutes,
      context_snapshot, policy_snapshot, calculation_snapshot
    ) select user_id, work_date, context_id, work_policy_id, actual_clock_in_at,
      actual_clock_in_at + interval '1 minute', effective_clock_in_at,
      effective_clock_in_at + interval '1 minute', expected_clock_out_at, -1, 0, 0, 0,
      context_snapshot, policy_snapshot, calculation_snapshot
    from issue_18_a_clock_in$$,
  '23514', null, 'completed minute results must be non-negative'
);

set role authenticated;
select * from finish();

rollback;
