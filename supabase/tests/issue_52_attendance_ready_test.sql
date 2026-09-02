begin;

select plan(29);

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
  ('00000000-0000-0000-0000-000000000523', 'issue52-existing@example.test'),
  ('00000000-0000-0000-0000-000000000524', 'issue52-stale-config@example.test'),
  ('00000000-0000-0000-0000-000000000525', 'issue52-legacy-attendance@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000520', 'Issue 52 No Assignment'),
  ('00000000-0000-0000-0000-000000000521', 'Issue 52 Missing Policy'),
  ('00000000-0000-0000-0000-000000000522', 'Issue 52 Ready'),
  ('00000000-0000-0000-0000-000000000523', 'Issue 52 Existing'),
  ('00000000-0000-0000-0000-000000000524', 'Issue 52 Stale Config'),
  ('00000000-0000-0000-0000-000000000525', 'Issue 52 Legacy Attendance');

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

set role postgres;
insert into public.work_assignments (
  user_id, staffing_employer, client_company, project, effective_from, effective_to
)
values
  (
    '00000000-0000-0000-0000-000000000524', 'Issue 52 Stale Employer',
    'Issue 52 Stale Client', 'Issue 52 Stale Project',
    (now() at time zone 'Asia/Taipei')::date - 10,
    (now() at time zone 'Asia/Taipei')::date - 1
  ),
  (
    '00000000-0000-0000-0000-000000000525', 'Issue 52 Legacy Employer',
    'Issue 52 Legacy Client', 'Issue 52 Legacy Project',
    (now() at time zone 'Asia/Taipei')::date - 10,
    (now() at time zone 'Asia/Taipei')::date - 1
  );

insert into public.work_policies (
  user_id, assignment_id, name, standard_start_time, work_minutes,
  fixed_break_minutes, early_arrival_policy, working_days,
  effective_from, effective_to
)
select
  a.user_id, a.id, case a.user_id
    when '00000000-0000-0000-0000-000000000524'::uuid then 'Issue 52 Stale Policy'
    else 'Issue 52 Legacy Policy'
  end,
  '00:00', 480, 0, 'ACTUAL', array['0', '1', '2', '3', '4', '5', '6'],
  a.effective_from, a.effective_to
from public.work_assignments a
where a.user_id in (
  '00000000-0000-0000-0000-000000000524',
  '00000000-0000-0000-0000-000000000525'
);

insert into public.attendance_records (
  user_id, work_date, assignment_id, work_policy_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  assignment_snapshot, context_snapshot, policy_snapshot, calculation_snapshot
)
select
  a.user_id, (now() at time zone 'Asia/Taipei')::date, a.id, p.id,
  now(), now(), now() + interval '480 minutes',
  pg_catalog.jsonb_build_object(
    'id', a.id,
    'user_id', a.user_id,
    'staffing_employer', a.staffing_employer,
    'client_company', a.client_company,
    'project', a.project,
    'effective_from', a.effective_from,
    'effective_to', a.effective_to
  ),
  '{}'::jsonb,
  pg_catalog.jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'assignment_id', p.assignment_id,
    'context_id', p.context_id,
    'name', p.name,
    'work_minutes', p.work_minutes,
    'fixed_break_minutes', p.fixed_break_minutes,
    'clock_out_rounding_mode', p.clock_out_rounding_mode,
    'clock_out_rounding_minutes', p.clock_out_rounding_minutes
  ),
  '{}'::jsonb
from public.work_assignments a
join public.work_policies p on p.assignment_id = a.id and p.user_id = a.user_id
where a.user_id = '00000000-0000-0000-0000-000000000524';

insert into public.attendance_records (
  user_id, work_date, work_policy_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  assignment_snapshot, context_snapshot, policy_snapshot, calculation_snapshot
)
select
  p.user_id, (now() at time zone 'Asia/Taipei')::date, p.id,
  now(), now(), now() + interval '480 minutes',
  null, '{}'::jsonb,
  pg_catalog.jsonb_build_object(
    'id', p.id,
    'user_id', p.user_id,
    'assignment_id', p.assignment_id,
    'context_id', p.context_id,
    'name', p.name,
    'work_minutes', p.work_minutes,
    'fixed_break_minutes', p.fixed_break_minutes,
    'clock_out_rounding_mode', p.clock_out_rounding_mode,
    'clock_out_rounding_minutes', p.clock_out_rounding_minutes
  ),
  '{}'::jsonb
from public.work_policies p
where p.user_id = '00000000-0000-0000-0000-000000000525';

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000524';
select is(
  (select resolution from public.resolve_work_assignment_policy((now() at time zone 'Asia/Taipei')::date)),
  'NO_ASSIGNMENT',
  'stale canonical attendance has no currently ready assignment configuration'
);
select * into temporary issue_52_stale_retry from public.clock_in_today();
select is(
  (select id from issue_52_stale_retry),
  (select id from public.attendance_records where user_id = '00000000-0000-0000-0000-000000000524'),
  'clock-in returns canonical existing attendance when current configuration is unavailable'
);
select lives_ok($$select public.clock_out_today()$$, 'stale canonical attendance can still clock out from its snapshot');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000525';
select lives_ok($$select public.clock_out_today()$$, 'legacy attendance can clock out from its policy snapshot');
select is(
  (select assignment_id from public.attendance_records where user_id = '00000000-0000-0000-0000-000000000525'),
  null::uuid,
  'clock-out does not infer or refill a legacy attendance assignment id'
);
select is(
  (select assignment_snapshot from public.attendance_records where user_id = '00000000-0000-0000-0000-000000000525'),
  null::jsonb,
  'clock-out does not infer or refill a legacy attendance assignment snapshot'
);

select * from finish();

rollback;
