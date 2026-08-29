create extension if not exists pgtap with schema extensions;

begin;

select plan(58);

-- 1. Schema & Structure
select has_table('public', 'day_statuses', 'day_statuses table exists');
select has_column('public', 'day_statuses', 'id', 'day_statuses.id exists');
select has_column('public', 'day_statuses', 'user_id', 'day_statuses.user_id exists');
select has_column('public', 'day_statuses', 'work_date', 'day_statuses.work_date exists');
select has_column('public', 'day_statuses', 'status', 'day_statuses.status exists');
select has_column('public', 'day_statuses', 'note', 'day_statuses.note exists');
select has_column('public', 'day_statuses', 'created_at', 'day_statuses.created_at exists');
select has_column('public', 'day_statuses', 'updated_at', 'day_statuses.updated_at exists');

select has_table('public', 'calendar_overrides', 'calendar_overrides table exists');
select has_column('public', 'calendar_overrides', 'id', 'calendar_overrides.id exists');
select has_column('public', 'calendar_overrides', 'user_id', 'calendar_overrides.user_id exists');
select has_column('public', 'calendar_overrides', 'calendar_date', 'calendar_overrides.calendar_date exists');
select has_column('public', 'calendar_overrides', 'day_type', 'calendar_overrides.day_type exists');
select has_column('public', 'calendar_overrides', 'name', 'calendar_overrides.name exists');
select has_column('public', 'calendar_overrides', 'note', 'calendar_overrides.note exists');
select has_column('public', 'calendar_overrides', 'created_at', 'calendar_overrides.created_at exists');
select has_column('public', 'calendar_overrides', 'updated_at', 'calendar_overrides.updated_at exists');

-- Constraints & Indices
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.day_statuses'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%(user_id, work_date)%'),
  1,
  'one day status per user and work date'
);

select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.calendar_overrides'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%(user_id, calendar_date)%'),
  1,
  'one calendar override per user and calendar date'
);

-- Permissions & RLS
select is(has_table_privilege('authenticated', 'public.day_statuses', 'SELECT'), true, 'authenticated can select day_statuses');
select is(has_table_privilege('authenticated', 'public.day_statuses', 'INSERT'), true, 'authenticated can insert day_statuses');
select is(has_table_privilege('authenticated', 'public.day_statuses', 'UPDATE'), true, 'authenticated can update day_statuses');
select is(has_table_privilege('authenticated', 'public.day_statuses', 'DELETE'), true, 'authenticated can delete day_statuses');

select is(has_table_privilege('authenticated', 'public.calendar_overrides', 'SELECT'), true, 'authenticated can select calendar_overrides');
select is(has_table_privilege('authenticated', 'public.calendar_overrides', 'INSERT'), true, 'authenticated can insert calendar_overrides');
select is(has_table_privilege('authenticated', 'public.calendar_overrides', 'UPDATE'), true, 'authenticated can update calendar_overrides');
select is(has_table_privilege('authenticated', 'public.calendar_overrides', 'DELETE'), true, 'authenticated can delete calendar_overrides');

select is(has_table_privilege('anon', 'public.day_statuses', 'SELECT'), false, 'anon cannot select day_statuses');
select is(has_table_privilege('anon', 'public.day_statuses', 'INSERT'), false, 'anon cannot insert day_statuses');
select is(has_table_privilege('anon', 'public.day_statuses', 'UPDATE'), false, 'anon cannot update day_statuses');
select is(has_table_privilege('anon', 'public.day_statuses', 'DELETE'), false, 'anon cannot delete day_statuses');

select is(has_table_privilege('anon', 'public.calendar_overrides', 'SELECT'), false, 'anon cannot select calendar_overrides');
select is(has_table_privilege('anon', 'public.calendar_overrides', 'INSERT'), false, 'anon cannot insert calendar_overrides');
select is(has_table_privilege('anon', 'public.calendar_overrides', 'UPDATE'), false, 'anon cannot update calendar_overrides');
select is(has_table_privilege('anon', 'public.calendar_overrides', 'DELETE'), false, 'anon cannot delete calendar_overrides');

-- Test Setup with Users
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000020', 'issue20-a@example.test'),
  ('00000000-0000-0000-0000-000000000021', 'issue20-b@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000020', 'Issue 20 User A'),
  ('00000000-0000-0000-0000-000000000021', 'Issue 20 User B');

-- Switch to User A
set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000020';

-- 1. User A CRUD own Day Status
insert into public.day_statuses (user_id, work_date, status, note)
values ('00000000-0000-0000-0000-000000000020', '2026-08-10', 'LEAVE', 'Taking personal leave');

select is(
  (select status from public.day_statuses where work_date = '2026-08-10'),
  'LEAVE',
  'User A can insert and select own Day Status'
);

update public.day_statuses
set status = 'REMOTE', note = 'Changed to remote'
where work_date = '2026-08-10';

select is(
  (select status from public.day_statuses where work_date = '2026-08-10'),
  'REMOTE',
  'User A can update own Day Status'
);

-- 2. User A cannot duplicate Day Status on same work_date
select throws_ok(
  $$insert into public.day_statuses (user_id, work_date, status, note)
    values ('00000000-0000-0000-0000-000000000020', '2026-08-10', 'BUSINESS_TRIP', 'Duplicate')$$,
  '23505',
  null,
  'duplicate Day Status on same work_date is rejected'
);

-- 3. Invalid status enum rejected
select throws_ok(
  $$insert into public.day_statuses (user_id, work_date, status)
    values ('00000000-0000-0000-0000-000000000020', '2026-08-11', 'INVALID_STATUS')$$,
  '23514',
  null,
  'invalid day status enum is rejected'
);

-- 4. User A CRUD own Calendar Override
insert into public.calendar_overrides (user_id, calendar_date, day_type, name, note)
values ('00000000-0000-0000-0000-000000000020', '2026-08-10', 'HOLIDAY', 'Company Anniversary', 'Special holiday');

select is(
  (select day_type from public.calendar_overrides where calendar_date = '2026-08-10'),
  'HOLIDAY',
  'User A can insert and select own Calendar Override'
);

update public.calendar_overrides
set day_type = 'WORKDAY', name = 'Make up work day'
where calendar_date = '2026-08-10';

select is(
  (select day_type from public.calendar_overrides where calendar_date = '2026-08-10'),
  'WORKDAY',
  'User A can update own Calendar Override'
);

-- 5. User A cannot duplicate Calendar Override on same calendar_date
select throws_ok(
  $$insert into public.calendar_overrides (user_id, calendar_date, day_type)
    values ('00000000-0000-0000-0000-000000000020', '2026-08-10', 'HOLIDAY')$$,
  '23505',
  null,
  'duplicate Calendar Override on same calendar_date is rejected'
);

-- 6. Invalid day_type enum rejected
select throws_ok(
  $$insert into public.calendar_overrides (user_id, calendar_date, day_type)
    values ('00000000-0000-0000-0000-000000000020', '2026-08-12', 'WEEKEND')$$,
  '23514',
  null,
  'invalid calendar override day_type is rejected'
);

-- 7. Blank string normalization to NULL
insert into public.day_statuses (user_id, work_date, status, note)
values ('00000000-0000-0000-0000-000000000020', '2026-08-13', 'BUSINESS_TRIP', '   ');

select is(
  (select note from public.day_statuses where work_date = '2026-08-13'),
  null,
  'whitespace note on day_statuses is normalized to null'
);

insert into public.calendar_overrides (user_id, calendar_date, day_type, name, note)
values ('00000000-0000-0000-0000-000000000020', '2026-08-13', 'HOLIDAY', '  ', '  ');

select is(
  (select name from public.calendar_overrides where calendar_date = '2026-08-13'),
  null,
  'whitespace name on calendar_overrides is normalized to null'
);

select is(
  (select note from public.calendar_overrides where calendar_date = '2026-08-13'),
  null,
  'whitespace note on calendar_overrides is normalized to null'
);

-- 8. Cross-user isolation: User B cannot view or mutate User A data
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000021';

select is(
  (select count(*)::integer from public.day_statuses where user_id = '00000000-0000-0000-0000-000000000020'),
  0,
  'User B cannot select User A day_statuses'
);

select is(
  (select count(*)::integer from public.calendar_overrides where user_id = '00000000-0000-0000-0000-000000000020'),
  0,
  'User B cannot select User A calendar_overrides'
);

select throws_ok(
  $$insert into public.day_statuses (user_id, work_date, status)
    values ('00000000-0000-0000-0000-000000000020', '2026-08-20', 'LEAVE')$$,
  '42501',
  null,
  'User B cannot insert day_statuses with User A user_id'
);

select throws_ok(
  $$insert into public.calendar_overrides (user_id, calendar_date, day_type)
    values ('00000000-0000-0000-0000-000000000020', '2026-08-20', 'HOLIDAY')$$,
  '42501',
  null,
  'User B cannot insert calendar_overrides with User A user_id'
);

update public.day_statuses
set status = 'BUSINESS_TRIP'
where user_id = '00000000-0000-0000-0000-000000000020';

update public.calendar_overrides
set day_type = 'HOLIDAY'
where user_id = '00000000-0000-0000-0000-000000000020';

delete from public.day_statuses
where user_id = '00000000-0000-0000-0000-000000000020';

delete from public.calendar_overrides
where user_id = '00000000-0000-0000-0000-000000000020';

-- Switch back to User A to verify rows were not affected by User B
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000020';

select is(
  (select status from public.day_statuses where work_date = '2026-08-10'),
  'REMOTE',
  'User A day_statuses was not modified or deleted by User B'
);

select is(
  (select day_type from public.calendar_overrides where calendar_date = '2026-08-10'),
  'WORKDAY',
  'User A calendar_overrides was not modified or deleted by User B'
);

-- 9. Independence & Coexistence
-- Setup User A context and policy for attendance
select * into temporary issue_20_a_context from public.create_work_context('Issue 20 A', 'Company A', 'Project A');
insert into public.work_policies (
  user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_out_rounding_mode,
  working_days, effective_from, effective_to
)
select
  '00000000-0000-0000-0000-000000000020', id, 'Issue 20 A policy', '09:00', 480, 60,
  'STANDARD_START', 'NONE', 'NONE',
  array['1', '2', '3', '4', '5'], '2026-01-01', null
from issue_20_a_context;

-- Clock in today (returns an attendance record)
select clock_in_today();

-- On today's date, insert both a HOLIDAY calendar override and a LEAVE day status
insert into public.calendar_overrides (user_id, calendar_date, day_type, name)
values (
  '00000000-0000-0000-0000-000000000020',
  (now() at time zone 'Asia/Taipei')::date,
  'HOLIDAY',
  'National Holiday'
);

insert into public.day_statuses (user_id, work_date, status, note)
values (
  '00000000-0000-0000-0000-000000000020',
  (now() at time zone 'Asia/Taipei')::date,
  'LEAVE',
  'Annual leave'
);

-- Verify all three coexist independently
select is(
  (select count(*)::integer from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  1,
  'attendance record exists on coexisting day'
);

select is(
  (select day_type from public.calendar_overrides where calendar_date = (now() at time zone 'Asia/Taipei')::date),
  'HOLIDAY',
  'calendar override HOLIDAY exists independently'
);

select is(
  (select status from public.day_statuses where work_date = (now() at time zone 'Asia/Taipei')::date),
  'LEAVE',
  'day status LEAVE exists independently'
);

-- Delete Day Status; verify Attendance and Calendar Override remain
delete from public.day_statuses
where work_date = (now() at time zone 'Asia/Taipei')::date;

select is(
  (select count(*)::integer from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  1,
  'deleting day status preserves attendance record'
);

select is(
  (select day_type from public.calendar_overrides where calendar_date = (now() at time zone 'Asia/Taipei')::date),
  'HOLIDAY',
  'deleting day status preserves calendar override'
);

-- Delete Calendar Override; verify Attendance remains
delete from public.calendar_overrides
where calendar_date = (now() at time zone 'Asia/Taipei')::date;

select is(
  (select count(*)::integer from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  1,
  'deleting calendar override preserves attendance record'
);

select * from finish();

rollback;
