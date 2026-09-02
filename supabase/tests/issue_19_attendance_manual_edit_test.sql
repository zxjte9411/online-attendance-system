begin;

select plan(53);

select has_table('public', 'attendance_records', 'attendance_records table exists');
select has_column('public', 'attendance_records', 'created_source', 'created_source exists');
select has_column('public', 'attendance_records', 'manually_adjusted', 'manually_adjusted exists');
select has_column('public', 'attendance_records', 'last_manual_edit_at', 'last_manual_edit_at exists');
select has_column('public', 'attendance_records', 'status_note', 'status_note exists');

select is(
  (select count(*)::integer
   from pg_proc
   where proname in ('create_manual_attendance', 'edit_attendance_record', 'delete_attendance_record')
     and prosecdef),
  3,
  'manual attendance mutation RPCs are security definer'
);

select ok(
  (select not prosecdef
   from pg_proc
   where proname = 'calculate_attendance_snapshots'),
  'internal calculation helper is not security definer'
);

select is(
  (select count(*)::integer
   from pg_proc
   where proname in ('create_manual_attendance', 'edit_attendance_record', 'delete_attendance_record', 'calculate_attendance_snapshots')
     and proconfig = array['search_path=""']),
  4,
  'manual attendance RPCs and calculation helper use empty search_path'
);

-- Setup test users and data
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'user-a@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'user-b@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values
  ('11111111-1111-4111-8111-111111111111', 'User A'),
  ('22222222-2222-4222-8222-222222222222', 'User B')
on conflict (id) do nothing;

create temp table test_context_ids (
  label text primary key,
  id uuid not null
) on commit drop;
grant all on test_context_ids to authenticated;

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111"}';

insert into test_context_ids (label, id)
select 'context_a1', id from public.create_work_context('Context A1', 'COMP-A1', 'PROJ-A1');

insert into test_context_ids (label, id)
select 'context_a2', id from public.create_work_context('Context A2', 'COMP-A2', 'PROJ-A2');

set local "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222"}';

insert into test_context_ids (label, id)
select 'context_b', id from public.create_work_context('Context B', 'COMP-B', 'PROJ-B');

create temp table test_assignment_ids (
  user_id uuid primary key,
  id uuid not null
) on commit drop;

insert into test_assignment_ids (user_id, id)
select '22222222-2222-4222-8222-222222222222', id
from public.create_work_assignment('Employer B', 'Client B', 'Project B', '2026-01-01', null);

set local "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111"}';
insert into test_assignment_ids (user_id, id)
select '11111111-1111-4111-8111-111111111111', id
from public.create_work_assignment('Employer A', 'Client A', 'Project A', '2026-01-01', null);

-- Insert policies
set role postgres;
insert into public.work_policies (
  user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
  clock_out_rounding_mode, clock_out_rounding_minutes, working_days, effective_from, effective_to, timezone
) values (
  '22222222-2222-4222-8222-222222222222',
  (select id from test_context_ids where label = 'context_b'),
  (select id from test_assignment_ids where user_id = '22222222-2222-4222-8222-222222222222'),
  'User B Policy',
  '09:00:00',
  480,
  60,
  'STANDARD_START',
  'NONE',
  null,
  'NONE',
  null,
  array[1, 2, 3, 4, 5],
  '2026-01-01',
  null,
  'Asia/Taipei'
);

set role authenticated;
set local "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111"}';

set role postgres;
insert into public.work_policies (
  user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
  clock_out_rounding_mode, clock_out_rounding_minutes, working_days, effective_from, effective_to, timezone
) values
  (
    '11111111-1111-4111-8111-111111111111',
    (select id from test_context_ids where label = 'context_a1'),
    (select id from test_assignment_ids where user_id = '11111111-1111-4111-8111-111111111111'),
    'Old Policy',
    '09:00:00',
    480,
    60,
    'STANDARD_START',
    'NONE',
    null,
    'NONE',
    null,
    array[1, 2, 3, 4, 5],
    '2026-01-01',
    '2026-06-30',
    'Asia/Taipei'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    (select id from test_context_ids where label = 'context_a1'),
    (select id from test_assignment_ids where user_id = '11111111-1111-4111-8111-111111111111'),
    'Current Policy',
    '09:30:00',
    480,
    60,
    'STANDARD_START',
    'NONE',
    null,
    'NONE',
    null,
    array[1, 2, 3, 4, 5],
    '2026-07-01',
    null,
    'Asia/Taipei'
  );
set role authenticated;

-- 1. Default column values and constraints on new clock-in
select clock_in_today();

select is(
  (select created_source from public.attendance_records where user_id = '11111111-1111-4111-8111-111111111111' and work_date = (now() at time zone 'Asia/Taipei')::date),
  'CLOCK',
  'clock-in sets created_source to CLOCK'
);

select is(
  (select manually_adjusted from public.attendance_records where user_id = '11111111-1111-4111-8111-111111111111' and work_date = (now() at time zone 'Asia/Taipei')::date),
  false,
  'clock-in sets manually_adjusted to false'
);

select is(
  (select last_manual_edit_at from public.attendance_records where user_id = '11111111-1111-4111-8111-111111111111' and work_date = (now() at time zone 'Asia/Taipei')::date),
  null,
  'clock-in sets last_manual_edit_at to null'
);

-- 2. MANUAL create uses Asia/Taipei date/time, created_source = MANUAL, manually_adjusted = false
select create_manual_attendance(
  '2026-08-10'::date,
  '09:30:00'::time,
  '18:30:00'::time,
  'Manual attendance note'
);

select is(
  (select created_source from public.attendance_records where work_date = '2026-08-10'),
  'MANUAL',
  'MANUAL create sets created_source = MANUAL'
);

select is(
  (select manually_adjusted from public.attendance_records where work_date = '2026-08-10'),
  false,
  'MANUAL create sets manually_adjusted = false'
);

select is(
  (select last_manual_edit_at from public.attendance_records where work_date = '2026-08-10'),
  null,
  'MANUAL create sets last_manual_edit_at = null'
);

select is(
  (select status_note from public.attendance_records where work_date = '2026-08-10'),
  'Manual attendance note',
  'MANUAL create stores status_note'
);

select is(
  (select net_worked_minutes from public.attendance_records where work_date = '2026-08-10'),
  480,
  'MANUAL create calculates completed net_worked_minutes'
);

-- 3. MANUAL create intentionally incomplete (no clock-out)
select create_manual_attendance(
  '2026-08-11'::date,
  '09:30:00'::time,
  null,
  null
);

select is(
  (select actual_clock_out_at from public.attendance_records where work_date = '2026-08-11'),
  null,
  'incomplete MANUAL create has null actual_clock_out_at'
);

select is(
  (select net_worked_minutes from public.attendance_records where work_date = '2026-08-11'),
  null,
  'incomplete MANUAL create has null net_worked_minutes'
);

select is(
  (select calculation_snapshot->>'state' from public.attendance_records where work_date = '2026-08-11'),
  'IN_PROGRESS',
  'incomplete MANUAL create calculation state is IN_PROGRESS'
);

-- 4. Applicable policy selected by historical date (e.g. 2026-03-15 matches Old Policy with standard_start_time 09:00:00)
select create_manual_attendance(
  '2026-03-15'::date,
  '08:50:00'::time,
  '18:00:00'::time,
  null
);

select is(
  (select policy_snapshot->>'name' from public.attendance_records where work_date = '2026-03-15'),
  'Old Policy',
  'historical MANUAL create resolves historical policy active on that date'
);

select is(
  (select effective_clock_in_at from public.attendance_records where work_date = '2026-03-15'),
  ('2026-03-15 09:00:00'::timestamp at time zone 'Asia/Taipei'),
  'historical policy STANDARD_START rounds 08:50 to standard start 09:00'
);

-- 5. Missing applicable policy rejected (date before 2026-01-01)
select throws_ok(
  $$select create_manual_attendance('2025-12-31'::date, '09:00:00'::time, '18:00:00'::time, null)$$,
  'P0001',
  '2025-12-31 沒有可用的 Work Assignment（NO_ASSIGNMENT）。',
  'MANUAL create without applicable assignment is rejected with target date and domain code'
);

-- 6. Invariants: clock-out before clock-in rejected
select throws_ok(
  $$select create_manual_attendance('2026-08-12'::date, '18:00:00'::time, '09:00:00'::time, null)$$,
  'P0001',
  null,
  'MANUAL create with clock-out before clock-in is rejected'
);

-- Same-date duplicate rejected
select throws_ok(
  $$select create_manual_attendance('2026-08-10'::date, '09:00:00'::time, '18:00:00'::time, null)$$,
  '23505',
  null,
  'same date duplicate MANUAL create is rejected by unique constraint'
);

-- 7. Policy update does not touch untouched attendance record; explicit edit re-resolves the legal current policy
-- Step A: close Current Policy after the latest attendance date and introduce a later policy version
set role postgres;
update public.work_policies
set effective_to = (now() at time zone 'Asia/Taipei')::date
where name = 'Current Policy';

insert into public.work_policies (
  user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
  clock_out_rounding_mode, clock_out_rounding_minutes, working_days, effective_from, effective_to, timezone
) values (
  '11111111-1111-4111-8111-111111111111',
  (select id from test_context_ids where label = 'context_a1'),
  (select id from test_assignment_ids where user_id = '11111111-1111-4111-8111-111111111111'),
  'Updated Policy',
  '08:30:00',
  480,
  60,
  'STANDARD_START',
  'NONE',
  null,
  'NONE',
  null,
  array[1, 2, 3, 4, 5],
  (now() at time zone 'Asia/Taipei')::date + 1,
  null,
  'Asia/Taipei'
);
set role authenticated;

-- Step B: verify untouched 2026-08-10 attendance still retains original policy_snapshot and values
select is(
  (select policy_snapshot->>'name' from public.attendance_records where work_date = '2026-08-10'),
  'Current Policy',
  'untouched attendance retains its original historical policy snapshot name'
);

select is(
  (select policy_snapshot->>'standard_start_time' from public.attendance_records where work_date = '2026-08-10'),
  '09:30:00',
  'untouched attendance retains its original historical standard_start_time'
);

select is(
  (select effective_clock_in_at from public.attendance_records where work_date = '2026-08-10'),
  ('2026-08-10 09:30:00'::timestamp at time zone 'Asia/Taipei'),
  'untouched attendance retains its original effective_clock_in_at'
);

-- Step C: explicit edit re-resolves the legal current policy and updates snapshots and calculations
select edit_attendance_record(
  (select id from public.attendance_records where work_date = '2026-08-10'),
  '08:30:00'::time,
  '17:30:00'::time,
  'Edited record with updated policy'
);

select is(
  (select policy_snapshot->>'name' from public.attendance_records where work_date = '2026-08-10'),
  'Current Policy',
  'explicit edit re-resolves policy snapshot name to Current Policy'
);

select is(
  (select policy_snapshot->>'standard_start_time' from public.attendance_records where work_date = '2026-08-10'),
  '09:30:00',
  'explicit edit re-resolves policy standard_start_time to 09:30:00'
);

select is(
  (select effective_clock_in_at from public.attendance_records where work_date = '2026-08-10'),
  ('2026-08-10 09:30:00'::timestamp at time zone 'Asia/Taipei'),
  'explicit edit recalculates effective_clock_in_at with the current policy'
);

select is(
  (select created_source from public.attendance_records where work_date = '2026-08-10'),
  'MANUAL',
  'explicit edit preserves created_source = MANUAL'
);

select is(
  (select manually_adjusted from public.attendance_records where work_date = '2026-08-10'),
  true,
  'explicit edit sets manually_adjusted = true'
);

select ok(
  (select last_manual_edit_at is not null from public.attendance_records where work_date = '2026-08-10'),
  'explicit edit sets last_manual_edit_at'
);

select is(
  (select calculation_snapshot->>'calculation_version' from public.attendance_records where work_date = '2026-08-10'),
  'v1',
  'calculation_version is preserved as engine version v1, not incremented revision counter'
);

-- 8. Edit CLOCK row preserves created_source = CLOCK, updates manual metadata & recalculates snapshots
select clock_out_today();

select is(
  (select created_source from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  'CLOCK',
  'CLOCK record created_source is CLOCK'
);

-- Edit the CLOCK record
select edit_attendance_record(
  (select id from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  '08:30:00'::time,
  '19:30:00'::time,
  'Adjusted today clock record'
);

select is(
  (select created_source from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  'CLOCK',
  'editing CLOCK record preserves created_source = CLOCK'
);

select is(
  (select manually_adjusted from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  true,
  'editing CLOCK record sets manually_adjusted = true'
);

select ok(
  (select last_manual_edit_at is not null from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  'editing CLOCK record sets last_manual_edit_at'
);

select is(
  (select status_note from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  'Adjusted today clock record',
  'editing CLOCK record updates status_note'
);

select is(
  (select net_worked_minutes from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  540,
  'editing CLOCK record recalculates net_worked_minutes (10h - 1h break = 9h = 540m)'
);

select is(
  (select overtime_minutes from public.attendance_records where work_date = (now() at time zone 'Asia/Taipei')::date),
  60,
  'editing CLOCK record recalculates overtime_minutes (540 - 480 = 60m)'
);

-- 9. Clearing clock-out returns to valid incomplete/null-derived state
select edit_attendance_record(
  (select id from public.attendance_records where work_date = '2026-08-10'),
  '08:30:00'::time,
  null,
  'Cleared clock-out'
);

select is(
  (select actual_clock_out_at from public.attendance_records where work_date = '2026-08-10'),
  null,
  'clearing clock-out sets actual_clock_out_at to null'
);

select is(
  (select effective_clock_out_at from public.attendance_records where work_date = '2026-08-10'),
  null,
  'clearing clock-out sets effective_clock_out_at to null'
);

select is(
  (select net_worked_minutes from public.attendance_records where work_date = '2026-08-10'),
  null,
  'clearing clock-out sets net_worked_minutes to null'
);

select is(
  (select calculation_snapshot->>'state' from public.attendance_records where work_date = '2026-08-10'),
  'IN_PROGRESS',
  'clearing clock-out sets calculation state to IN_PROGRESS'
);

-- 10. Cross-user isolation: User A cannot edit User B's record
set local "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222"}';

create temp table test_record_ids (
  label text primary key,
  id uuid not null
) on commit drop;
grant all on test_record_ids to authenticated;

insert into test_record_ids (label, id)
select 'user_b_rec', id from public.create_manual_attendance(
  '2026-08-15'::date,
  '09:00:00'::time,
  '18:00:00'::time,
  'User B attendance'
);

set local "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111"}';

-- User A tries to edit User B's record
select throws_ok(
  format($$select edit_attendance_record(
    '%s'::uuid,
    '10:00:00'::time,
    '19:00:00'::time,
    'Hacked'
  )$$, (select id from test_record_ids where label = 'user_b_rec')),
  'P0001',
  null,
  'User A cannot edit User B attendance record'
);

-- User A tries to delete User B's record
select throws_ok(
  format($$select delete_attendance_record(
    '%s'::uuid
  )$$, (select id from test_record_ids where label = 'user_b_rec')),
  'P0001',
  null,
  'User A cannot delete User B attendance record'
);

-- User A's target-date create resolves only User A's assignment and policy.
select create_manual_attendance(
  '2026-08-20'::date,
  '09:00:00'::time,
  '18:00:00'::time,
  'Owner-resolved target date'
);
select is(
  (select policy_snapshot->>'name' from public.attendance_records where user_id = '11111111-1111-4111-8111-111111111111' and work_date = '2026-08-20'),
  'Current Policy',
  'target-date create does not use another user context and resolves the owner policy'
);

-- 11. Owner hard delete succeeds
select delete_attendance_record(
  (select id from public.attendance_records where work_date = '2026-08-11')
);

select is(
  (select count(*)::integer from public.attendance_records where work_date = '2026-08-11'),
  0,
  'owner hard delete removes the record from database'
);

-- 12. Verify direct mutations are still rejected
select throws_ok(
  format($$insert into public.attendance_records (user_id, work_date, context_id, work_policy_id, actual_clock_in_at, effective_clock_in_at, expected_clock_out_at, context_snapshot, policy_snapshot, calculation_snapshot)
    values ('11111111-1111-4111-8111-111111111111', '2026-08-22', '%s'::uuid, (select id from public.work_policies where name = 'Current Policy'), now(), now(), now(), '{}', '{}', '{}')$$, (select id from test_context_ids where label = 'context_a1')),
  '42501',
  null,
  'direct insert on attendance_records is rejected'
);

select throws_ok(
  $$update public.attendance_records set status_note = 'Direct hacked' where work_date = '2026-08-10'$$,
  '42501',
  null,
  'direct update on attendance_records is rejected'
);

select throws_ok(
  $$delete from public.attendance_records where work_date = '2026-08-10'$$,
  '42501',
  null,
  'direct delete on attendance_records is rejected'
);

select throws_ok(
  format($$select * from public.calculate_attendance_snapshots(
    '2026-08-10'::date,
    '09:00:00'::time,
    '18:00:00'::time,
    (select c from public.work_contexts c where id = '%s'::uuid),
    (select p from public.work_policies p where name = 'Current Policy'),
    'v1'
  )$$, (select id from test_context_ids where label = 'context_a1')),
  '42501',
  null,
  'direct execution of calculate_attendance_snapshots by authenticated is rejected'
);

select * from finish();

rollback;
