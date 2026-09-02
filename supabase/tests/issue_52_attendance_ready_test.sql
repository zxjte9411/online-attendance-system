begin;

select plan(23);

select has_column('public', 'attendance_records', 'assignment_id', 'attendance keeps canonical assignment_id');
select has_column('public', 'attendance_records', 'assignment_snapshot', 'attendance stores an optional assignment snapshot');
select is(
  (select prosecdef from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  true,
  'clock_in_today remains SECURITY DEFINER'
);
select is(
  (select proconfig from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  array['search_path=""'],
  'clock_in_today keeps an empty search_path'
);
select is(
  has_function_privilege('authenticated', 'public.clock_in_today()', 'EXECUTE'),
  true,
  'authenticated can execute clock_in_today'
);
select ok(
  (select position('resolve_work_assignment_policy' in prosrc) > 0
   from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  'clock_in_today uses the canonical assignment policy resolver'
);
select ok(
  (select position('for update' in prosrc) > 0
   from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  'clock_in_today locks an existing attendance record before returning it'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000520', 'issue52-no-assignment@example.test'),
  ('00000000-0000-0000-0000-000000000521', 'issue52-missing-policy@example.test'),
  ('00000000-0000-0000-0000-000000000522', 'issue52-ready@example.test'),
  ('00000000-0000-0000-0000-000000000523', 'issue52-existing@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000520', 'Issue 52 No Assignment'),
  ('00000000-0000-0000-0000-000000000521', 'Issue 52 Missing Policy'),
  ('00000000-0000-0000-0000-000000000522', 'Issue 52 Ready'),
  ('00000000-0000-0000-0000-000000000523', 'Issue 52 Existing');

create temp table issue_52_assignments (
  user_id uuid primary key,
  id uuid not null
) on commit drop;

create temp table issue_52_policies (
  user_id uuid primary key,
  id uuid not null
) on commit drop;

grant all on issue_52_assignments, issue_52_policies to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000520';
select throws_ok(
  $$select public.clock_in_today()$$,
  'P0001',
  'NO_ASSIGNMENT',
  'clock-in rejects a user without an assignment with the canonical error message'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000521';
insert into issue_52_assignments (user_id, id)
select '00000000-0000-0000-0000-000000000521', id
from public.create_work_assignment(
  'Issue 52 Employer B', 'Issue 52 Client B', 'Issue 52 Project B',
  (clock_timestamp() at time zone 'Asia/Taipei')::date, null
);
select throws_ok(
  $$select public.clock_in_today()$$,
  'P0001',
  'MISSING_POLICY',
  'clock-in rejects an assignment without a policy with the canonical error message'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000522';
insert into issue_52_assignments (user_id, id)
select '00000000-0000-0000-0000-000000000522', id
from public.create_work_assignment(
  'Issue 52 Staffing', 'Issue 52 Client', 'Issue 52 Project',
  (clock_timestamp() at time zone 'Asia/Taipei')::date, null
);
insert into issue_52_policies (user_id, id)
select '00000000-0000-0000-0000-000000000522', id
from public.create_work_policy(
  (select id from issue_52_assignments where user_id = '00000000-0000-0000-0000-000000000522'),
  'Issue 52 Canonical Policy', '00:00', 480, 0, 'ACTUAL', 'NONE', null,
  'NONE', null, array['0', '1', '2', '3', '4', '5', '6'],
  (clock_timestamp() at time zone 'Asia/Taipei')::date, null, 'Asia/Taipei'
);

select * into temporary issue_52_ready_clock_in from public.clock_in_today();
select is((select count(*)::integer from issue_52_ready_clock_in), 1, 'ready clock-in creates one attendance record');
select is(
  (select assignment_id from issue_52_ready_clock_in),
  (select id from issue_52_assignments where user_id = '00000000-0000-0000-0000-000000000522'),
  'clock-in stores the canonical assignment id'
);
select is((select assignment_snapshot->>'staffing_employer' from issue_52_ready_clock_in), 'Issue 52 Staffing', 'clock-in stores the assignment snapshot');
select is((select policy_snapshot->>'name' from issue_52_ready_clock_in), 'Issue 52 Canonical Policy', 'clock-in stores the policy snapshot');
select is((select calculation_snapshot->>'state' from issue_52_ready_clock_in), 'IN_PROGRESS', 'clock-in stores the calculation snapshot');

set role postgres;
select throws_ok(
  $$update public.attendance_records
    set assignment_id = null
    where id = (select id from issue_52_ready_clock_in)$$,
  'P0001', null,
  'table owner cannot change the attendance assignment id'
);
select throws_ok(
  $$update public.attendance_records
    set assignment_snapshot = '{}'::jsonb
    where id = (select id from issue_52_ready_clock_in)$$,
  'P0001', null,
  'table owner cannot change the attendance assignment snapshot'
);
reset role;
set local role authenticated;

select * into temporary issue_52_retry from public.clock_in_today();
select is((select id from issue_52_retry), (select id from issue_52_ready_clock_in), 'clock-in is idempotent after the record exists');
select is((select assignment_snapshot from issue_52_retry), (select assignment_snapshot from issue_52_ready_clock_in), 'idempotent clock-in preserves the assignment snapshot');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000523';
insert into issue_52_assignments (user_id, id)
select '00000000-0000-0000-0000-000000000523', id
from public.create_work_assignment(
  'Issue 52 Existing Staffing', 'Issue 52 Existing Client', 'Issue 52 Existing Project',
  (clock_timestamp() at time zone 'Asia/Taipei')::date, null
);
insert into issue_52_policies (user_id, id)
select '00000000-0000-0000-0000-000000000523', id
from public.create_work_policy(
  (select id from issue_52_assignments where user_id = '00000000-0000-0000-0000-000000000523'),
  'Issue 52 Existing Policy', '00:00', 480, 0, 'ACTUAL', 'NONE', null,
  'NONE', null, array['0', '1', '2', '3', '4', '5', '6'],
  (clock_timestamp() at time zone 'Asia/Taipei')::date, null, 'Asia/Taipei'
);

select * into temporary issue_52_existing_clock_in from public.clock_in_today();
select lives_ok(
  $$select public.update_work_policy(
    (select id from issue_52_policies where user_id = '00000000-0000-0000-0000-000000000523'),
    'Issue 52 Existing Policy Renamed', '00:00', 480, 0, 'ACTUAL', 'NONE', null,
    'NONE', null, array['0', '1', '2', '3', '4', '5', '6'],
    (clock_timestamp() at time zone 'Asia/Taipei')::date, null, 'Asia/Taipei'
  )$$,
  'policy configuration can change after attendance while history remains readable'
);
select * into temporary issue_52_existing_retry from public.clock_in_today();
select is((select id from issue_52_existing_retry), (select id from issue_52_existing_clock_in), 'existing attendance is returned without re-resolving configuration');
select is((select policy_snapshot->>'name' from issue_52_existing_retry), 'Issue 52 Existing Policy', 'existing attendance retains its policy snapshot after configuration change');
select lives_ok($$select public.clock_out_today()$$, 'clock-out succeeds from the existing attendance snapshot');
select is((select calculation_snapshot->>'state' from public.attendance_records where id = (select id from issue_52_existing_clock_in)), 'COMPLETED', 'clock-out completes the existing attendance');

select * from finish();

rollback;
