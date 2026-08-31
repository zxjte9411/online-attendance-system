begin;

select plan(77);

select has_column('public', 'work_policies', 'assignment_id', 'work policies retain assignment_id');
select is(
  (select not attnotnull from pg_attribute
   where attrelid = 'public.work_policies'::regclass and attname = 'context_id'),
  true,
  'legacy context_id is nullable for assignment-owned policies'
);
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.work_policies'::regclass
     and conname = 'work_policies_no_overlapping_effective_dates'),
  0,
  'legacy context exclusion is removed'
);
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.work_policies'::regclass
     and conname = 'work_policies_assignment_no_overlapping_effective_dates'),
  1,
  'assignment policy exclusion exists'
);
select is(has_table_privilege('authenticated', 'public.work_policies', 'INSERT'), false, 'authenticated cannot insert policies directly');
select is(has_table_privilege('authenticated', 'public.work_policies', 'UPDATE'), false, 'authenticated cannot update policies directly');
select is(has_table_privilege('authenticated', 'public.work_policies', 'DELETE'), false, 'authenticated cannot delete policies directly');
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.work_policies'::regclass and polcmd in ('a', 'w', 'd')),
  0,
  'work policies have no direct write policies'
);
select is(
  (select prosecdef from pg_proc
   where oid = 'public.create_work_policy(uuid,text,time without time zone,integer,integer,text,text,integer,text,integer,text[],date,date,text)'::regprocedure),
  true,
  'create_work_policy is SECURITY DEFINER'
);
select is(has_function_privilege('authenticated', 'public.create_work_policy(uuid,text,time without time zone,integer,integer,text,text,integer,text,integer,text[],date,date,text)', 'EXECUTE'), true, 'authenticated can execute create_work_policy');
select is(has_function_privilege('authenticated', 'public.update_work_policy(uuid,text,time without time zone,integer,integer,text,text,integer,text,integer,text[],date,date,text)', 'EXECUTE'), true, 'authenticated can execute update_work_policy');
select is(has_function_privilege('authenticated', 'public.has_attendance_records_for_work_policy(uuid)', 'EXECUTE'), true, 'authenticated can execute the attendance history seam');
select is(has_function_privilege('authenticated', 'public.resolve_work_assignment_policy(date)', 'EXECUTE'), true, 'authenticated can execute the policy resolver');
select is(
  (select count(*)::integer from pg_trigger
   where tgrelid = 'public.work_policies'::regclass
     and tgname = 'work_policies_validate_write'),
  1,
  'work policy write trigger is installed'
);
select is(
  (select count(*)::integer from pg_trigger
   where tgrelid = 'public.work_policies'::regclass
     and tgname = 'work_policies_prevent_update'),
  0,
  'early immutability trigger is replaced'
);
select ok(
  (select position('for update' in prosrc) > 0 from pg_proc where oid = 'public.validate_work_policy_write()'::regprocedure),
  'policy trigger locks its parent assignment row before subset validation'
);
select ok(
  (select position('array_agg(wa.id)' in prosrc) > 0 from pg_proc where oid = 'public.resolve_work_assignment_policy(date)'::regprocedure),
  'resolver selects the unique assignment candidate in its candidate statement'
);
select ok(
  (select position('array_agg(wp.id)' in prosrc) > 0 from pg_proc where oid = 'public.resolve_work_assignment_policy(date)'::regprocedure),
  'resolver selects the unique policy candidate in its candidate statement'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000051', 'issue51-a@example.test'),
  ('00000000-0000-0000-0000-000000000052', 'issue51-b@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000051', 'Issue 51 A'),
  ('00000000-0000-0000-0000-000000000052', 'Issue 51 B');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';

create temp table issue_51_assignments (
  label text primary key,
  id uuid not null
) on commit drop;

insert into issue_51_assignments (label, id)
select 'primary', id
from public.create_work_assignment('Issue 51 Employer', 'Issue 51 Client', 'Issue 51 Project', '2026-01-01', '2026-12-31');

select is(
  (select effective_from from public.work_assignments where id = (select id from issue_51_assignments where label = 'primary')),
  '2026-01-01'::date,
  'primary assignment is created for the policy subset tests'
);

create temp table issue_51_contexts (id uuid not null) on commit drop;
insert into issue_51_contexts (id)
select id from public.create_work_context('Issue 51 Legacy Context', 'Issue 51 Company', 'Issue 51 Project');

create temp table issue_51_policies (
  label text primary key,
  id uuid not null
) on commit drop;

insert into issue_51_policies (label, id)
select 'past', id
from public.create_work_policy(
  (select id from issue_51_assignments where label = 'primary'),
  'Past policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
  'NONE', null, array['1', '2', '3', '4', '5'], '2026-01-01', '2026-01-31', 'Asia/Taipei'
);
insert into issue_51_policies (label, id)
select 'current', id
from public.create_work_policy(
  (select id from issue_51_assignments where label = 'primary'),
  'Current policy', '09:15', 450, 45, 'ACTUAL', 'CEIL', 15,
  'FLOOR', 30, array['1', '3', '5'], '2026-03-01', '2026-05-31', 'Asia/Taipei'
);
insert into issue_51_policies (label, id)
select 'future', id
from public.create_work_policy(
  (select id from issue_51_assignments where label = 'primary'),
  'Future policy', '10:00', 420, 30, 'STANDARD_START', 'NONE', null,
  'NONE', null, array['2', '4'], '2026-10-01', '2026-11-30', 'Asia/Taipei'
);
insert into issue_51_policies (label, id)
select 'unused', id
from public.create_work_policy(
  (select id from issue_51_assignments where label = 'primary'),
  'Unused policy', '08:30', 480, 60, 'STANDARD_START', 'NONE', null,
  'NONE', null, array['1'], '2026-07-01', '2026-07-31', 'Asia/Taipei'
);

select is((select count(*)::integer from issue_51_policies), 4, 'past and future policies can be created');
select throws_ok(
  $$select public.create_work_policy(
      (select id from issue_51_assignments where label = 'primary'),
      'Before assignment', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1'], '2025-12-01', '2026-01-15', 'Asia/Taipei')$$,
  'P0001', null, 'policy effective_from must be inside the assignment period'
);
select throws_ok(
  $$select public.create_work_policy(
      (select id from issue_51_assignments where label = 'primary'),
      'After assignment', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1'], '2026-12-01', '2027-01-15', 'Asia/Taipei')$$,
  'P0001', null, 'policy effective_to must be inside the assignment period'
);
select throws_ok(
  $$select public.create_work_policy(
      (select id from issue_51_assignments where label = 'primary'),
      'Open outside assignment', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1'], '2026-12-01', null, 'Asia/Taipei')$$,
  'P0001', null, 'open-ended policy is rejected for a bounded assignment'
);
select throws_ok(
  $$select public.create_work_policy(
      (select id from issue_51_assignments where label = 'primary'),
      'Overlapping policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1'], '2026-05-01', '2026-06-15', 'Asia/Taipei')$$,
  '23P01', null, 'policies on one assignment cannot overlap'
);

select is(
  (select name from public.update_work_policy(
    (select id from issue_51_policies where label = 'unused'),
    'Unused policy updated', '10:15', 450, 45, 'ACTUAL', 'CEIL', 15,
    'FLOOR', 30, array['1', '3'], '2026-07-15', '2026-08-15', 'Asia/Taipei')),
  'Unused policy updated',
  'unused policy name can be edited'
);
select is((select standard_start_time from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), '10:15'::time, 'unused policy start time can be edited');
select is((select work_minutes from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 450, 'unused policy work minutes can be edited');
select is((select fixed_break_minutes from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 45, 'unused policy break minutes can be edited');
select is((select early_arrival_policy from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 'ACTUAL', 'unused policy early arrival policy can be edited');
select is((select clock_in_rounding_mode from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 'CEIL', 'unused policy clock-in mode can be edited');
select is((select clock_in_rounding_minutes from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 15, 'unused policy clock-in minutes can be edited');
select is((select clock_out_rounding_mode from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 'FLOOR', 'unused policy clock-out mode can be edited');
select is((select clock_out_rounding_minutes from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 30, 'unused policy clock-out minutes can be edited');
select is((select working_days from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), array['1', '3']::text[], 'unused policy working days can be edited');
select is((select effective_from from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), '2026-07-15'::date, 'unused policy effective_from can be edited');
select is((select effective_to from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), '2026-08-15'::date, 'unused policy effective_to can be edited');
select is((select timezone from public.work_policies where id = (select id from issue_51_policies where label = 'unused')), 'Asia/Taipei', 'unused policy timezone can be edited');

select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000051',
      (select id from issue_51_contexts), 'Direct policy', '09:00', 480, 60,
      'STANDARD_START', array['1'], '2026-12-01')$$,
  '42501', null, 'authenticated cannot bypass the create policy RPC'
);
select throws_ok(
  $$update public.work_policies set name = 'Direct update' where id = (select id from issue_51_policies where label = 'unused')$$,
  '42501', null, 'authenticated cannot bypass the update policy RPC'
);
select throws_ok(
  $$delete from public.work_policies where id = (select id from issue_51_policies where label = 'unused')$$,
  '42501', null, 'authenticated cannot delete policies directly'
);

reset role;
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from, assignment_id
    ) values (
      '00000000-0000-0000-0000-000000000051',
      (select id from issue_51_contexts), 'Missing assignment', '09:00', 480, 60,
      'STANDARD_START', array['1'], '2026-12-01', null)$$,
  'P0001', null, 'database trigger requires assignment_id for new policies'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from, effective_to
    ) values (
      '00000000-0000-0000-0000-000000000051',
      (select id from issue_51_assignments where label = 'primary'), 'Outside assignment', '09:00', 480, 60,
      'STANDARD_START', array['1'], '2025-12-01', '2026-01-15')$$,
  'P0001', null, 'database trigger enforces assignment subset independently of RPC'
);

alter table public.work_policies disable trigger work_policies_validate_write;
insert into public.work_policies (
  user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, working_days, effective_from, effective_to
) values (
  '00000000-0000-0000-0000-000000000051',
  (select id from issue_51_contexts), 'Legacy readable policy', '09:00', 480, 60,
  'STANDARD_START', array['1'], '2028-01-01', '2028-01-31'
);
alter table public.work_policies enable trigger work_policies_validate_write;
set role authenticated;
select is((select name from public.work_policies where name = 'Legacy readable policy'), 'Legacy readable policy', 'legacy assignment-null policy remains readable');
select throws_ok(
  $$select public.update_work_policy(
      (select id from public.work_policies where name = 'Legacy readable policy'),
      'Legacy update attempt', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1'], '2028-01-01', '2028-01-31', 'Asia/Taipei')$$,
  'P0001', null, 'update_work_policy cannot update a legacy assignment-null policy'
);
reset role;
select throws_ok(
  $$update public.work_policies set name = 'Legacy direct update attempt' where name = 'Legacy readable policy'$$,
  'P0001', null, 'policy trigger cannot update a legacy assignment-null policy'
);
set role authenticated;

select is(
  public.has_attendance_records_for_work_policy((select id from issue_51_policies where label = 'current')),
  false,
  'attendance history seam is false for an unused policy'
);

set role postgres;
insert into issue_51_assignments (label, id)
select 'used', id
from public.create_work_assignment('Used Employer', 'Used Client', 'Used Project', '2030-01-01', null);

insert into public.work_policies (
  user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
  clock_out_rounding_mode, clock_out_rounding_minutes, working_days, timezone,
  effective_from, effective_to
) values (
  '00000000-0000-0000-0000-000000000051',
  (select id from issue_51_contexts), (select id from issue_51_assignments where label = 'used'),
  'Used policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
  'NONE', null, array['1', '2', '3', '4', '5'], 'Asia/Taipei', '2030-01-01', null
);
insert into issue_51_policies (label, id)
select 'used', id from public.work_policies where name = 'Used policy';

insert into public.attendance_records (
  user_id, work_date, context_id, work_policy_id, assignment_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  context_snapshot, policy_snapshot, calculation_snapshot
) values (
  '00000000-0000-0000-0000-000000000051', '2030-06-15',
  (select id from issue_51_contexts), (select id from issue_51_policies where label = 'used'),
  (select id from issue_51_assignments where label = 'used'),
  '2030-06-15 09:00:00+08', '2030-06-15 09:00:00+08', '2030-06-15 18:00:00+08',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
);

select throws_ok(
  $$update public.work_policies set standard_start_time = '10:00' where id = (select id from issue_51_policies where label = 'used')$$,
  'P0001', null, 'history trigger blocks core edits outside the RPC too'
);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';
select is(
  public.has_attendance_records_for_work_policy((select id from issue_51_policies where label = 'used')),
  true,
  'owner can detect policy attendance history'
);
select throws_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'used'),
      'Used policy', '09:00', 481, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1', '2', '3', '4', '5'], '2030-01-01', null, 'Asia/Taipei')$$,
  'P0001', null, 'used policy core fields are immutable'
);
select throws_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'used'),
      'Used policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1', '2', '3', '4', '5'], '2030-01-02', null, 'Asia/Taipei')$$,
  'P0001', null, 'used policy effective_from is immutable'
);
select throws_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'used'),
      'Used policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1', '2', '3', '4', '5'], '2030-01-01', '2030-06-14', 'Asia/Taipei')$$,
  'P0001', null, 'used policy effective_to cannot exclude attendance work_date'
);
select lives_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'used'),
      'Used policy renamed', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1', '2', '3', '4', '5'], '2030-01-01', '2030-12-31', 'Asia/Taipei')$$,
  'used policy name and a legal effective_to can be changed'
);
select is((select name from public.work_policies where id = (select id from issue_51_policies where label = 'used')), 'Used policy renamed', 'used policy name changed');
select lives_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'used'),
      'Used policy renamed', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1', '2', '3', '4', '5'], '2030-01-01', '2031-12-31', 'Asia/Taipei')$$,
  'used policy effective_to can be extended legally'
);
select lives_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'used'),
      'Used policy renamed', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1', '2', '3', '4', '5'], '2030-01-01', '2030-06-15', 'Asia/Taipei')$$,
  'used policy effective_to can be shortened through attendance date'
);
select lives_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'used'),
      'Used policy renamed', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1', '2', '3', '4', '5'], '2030-01-01', null, 'Asia/Taipei')$$,
  'used policy effective_to can be cleared'
);
reset role;
select throws_ok(
  $$update public.work_policies set assignment_id = (select id from issue_51_assignments where label = 'primary') where id = (select id from issue_51_policies where label = 'used')$$,
  'P0001', null, 'assignment ownership cannot be reparanted'
);
select throws_ok(
  $$update public.work_policies set user_id = '00000000-0000-0000-0000-000000000052' where id = (select id from issue_51_policies where label = 'used')$$,
  'P0001', null, 'policy user ownership cannot be reparanted'
);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';

savepoint issue_51_multiple_assignment;
set role postgres;
alter table public.work_assignments drop constraint work_assignments_no_overlapping_effective_dates;
insert into public.work_assignments (
  id, user_id, staffing_employer, client_company, project, effective_from, effective_to
) values (
  gen_random_uuid(), '00000000-0000-0000-0000-000000000051',
  'Duplicate Employer', 'Duplicate Client', 'Duplicate Project', '2026-01-01', '2026-12-31'
);
set role authenticated;
select throws_ok(
  $$select public.resolve_work_assignment_policy('2026-04-01')$$,
  'P0001', null, 'resolver raises on multiple matching assignments instead of choosing one'
);
rollback to savepoint issue_51_multiple_assignment;
set role authenticated;
select ok(
  (select count(*) = 2
   and exists (select 1 from pg_constraint where conname = 'work_assignments_no_overlapping_effective_dates')
   from public.work_assignments where user_id = '00000000-0000-0000-0000-000000000051'),
  'assignment duplicate fixture rollback leaves rows and exclusion constraint intact'
);

savepoint issue_51_multiple_policy;
set role postgres;
alter table public.work_policies drop constraint work_policies_assignment_no_overlapping_effective_dates;
insert into public.work_policies (
  id, user_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode,
  clock_in_rounding_minutes, clock_out_rounding_mode, clock_out_rounding_minutes,
  working_days, effective_from, effective_to, timezone
)
select
  gen_random_uuid(), user_id, assignment_id, 'Duplicate current policy', standard_start_time, work_minutes,
  fixed_break_minutes, early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
  clock_out_rounding_mode, clock_out_rounding_minutes, working_days, effective_from, effective_to, timezone
from public.work_policies
where id = (select id from issue_51_policies where label = 'current');
set role authenticated;
select throws_ok(
  $$select public.resolve_work_assignment_policy('2026-04-01')$$,
  'P0001', null, 'resolver raises on multiple matching policies instead of choosing one'
);
rollback to savepoint issue_51_multiple_policy;
set role authenticated;
select ok(
  (select count(*) = 6
   and exists (select 1 from pg_constraint where conname = 'work_policies_assignment_no_overlapping_effective_dates')
   from public.work_policies where user_id = '00000000-0000-0000-0000-000000000051'),
  'policy duplicate fixture rollback leaves rows and exclusion constraint intact'
);

select results_eq(
  $$select resolution, assignment_id, policy_id from public.resolve_work_assignment_policy('2027-01-01')$$,
  $$select 'NO_ASSIGNMENT'::text, null::uuid, null::uuid$$,
  'resolver returns NO_ASSIGNMENT'
);
select results_eq(
  $$select resolution, assignment_id, policy_id from public.resolve_work_assignment_policy('2026-02-15')$$,
  $$select 'MISSING_POLICY'::text, (select id from issue_51_assignments where label = 'primary'), null::uuid$$,
  'resolver returns MISSING_POLICY for an assignment coverage gap'
);
select is((select resolution from public.resolve_work_assignment_policy('2026-04-01')), 'RESOLVED', 'resolver returns RESOLVED');
select is((select assignment_id from public.resolve_work_assignment_policy('2026-04-01')), (select id from issue_51_assignments where label = 'primary'), 'resolved result belongs to the matching assignment');
select is((select policy_id from public.resolve_work_assignment_policy('2026-04-01')), (select id from issue_51_policies where label = 'current'), 'resolved result selects the matching policy');
select is((select resolution from public.resolve_work_assignment_policy('2030-06-15')), 'RESOLVED', 'resolver resolves a used assignment policy');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000052';
select is((select count(*)::integer from public.work_assignments), 0, 'User B cannot see User A assignments');
select is((select count(*)::integer from public.work_policies), 0, 'User B cannot see User A policies');
select is(public.has_attendance_records_for_work_policy((select id from issue_51_policies where label = 'used')), false, 'attendance history seam does not leak User A history');
select results_eq(
  $$select resolution, assignment_id, policy_id from public.resolve_work_assignment_policy('2030-06-15')$$,
  $$select 'NO_ASSIGNMENT'::text, null::uuid, null::uuid$$,
  'resolver does not resolve another user assignment'
);

insert into issue_51_assignments (label, id)
select 'user_b', id
from public.create_work_assignment('B Employer', 'B Client', 'B Project', '2026-01-01', '2026-12-31');
insert into issue_51_policies (label, id)
select 'user_b', id
from public.create_work_policy(
  (select id from issue_51_assignments where label = 'user_b'),
  'B policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
  'NONE', null, array['1'], '2026-01-01', '2026-12-31', 'Asia/Taipei'
);
select is((select resolution from public.resolve_work_assignment_policy('2026-04-01')), 'RESOLVED', 'User B resolves only User B assignment policies');
select is((select assignment_id from public.resolve_work_assignment_policy('2026-04-01')), (select id from issue_51_assignments where label = 'user_b'), 'User B resolver returns User B assignment');
select is((select policy_id from public.resolve_work_assignment_policy('2026-04-01')), (select id from issue_51_policies where label = 'user_b'), 'User B resolver returns User B policy');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';
select throws_ok(
  $$select public.create_work_policy(
      (select id from issue_51_assignments where label = 'user_b'),
      'Cross-user policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1'], '2026-01-01', '2026-01-31', 'Asia/Taipei')$$,
  'P0001', null, 'owner cannot create a policy for another user assignment'
);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000052';
select throws_ok(
  $$select public.update_work_policy(
      (select id from issue_51_policies where label = 'current'),
      'Hacked policy', '09:00', 480, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['1'], '2026-03-01', '2026-05-31', 'Asia/Taipei')$$,
  'P0001', null, 'owner cannot update another user policy'
);

select * from finish();

rollback;
