begin;

select plan(44);

select has_table('public', 'work_assignments', 'work_assignments table exists');
select has_column('public', 'work_assignments', 'staffing_employer', 'staffing_employer column exists');
select has_column('public', 'work_assignments', 'client_company', 'client_company column exists');
select has_column('public', 'work_assignments', 'project', 'project column exists');
select has_column('public', 'work_assignments', 'effective_from', 'effective_from column exists');
select has_column('public', 'work_assignments', 'effective_to', 'effective_to column exists');
select has_column('public', 'work_policies', 'assignment_id', 'work_policies assignment_id column exists');
select has_column('public', 'attendance_records', 'assignment_id', 'attendance_records assignment_id column exists');

select has_index('public', 'work_assignments', 'work_assignments_user_id_idx', 'work_assignments user_id index exists');
select has_index('public', 'work_policies', 'work_policies_assignment_owner_idx', 'work_policies assignment_id index exists');
select has_index('public', 'attendance_records', 'attendance_records_assignment_owner_idx', 'attendance_records assignment_id index exists');

select is(
  has_table_privilege('authenticated', 'public.work_assignments', 'DELETE'),
  false,
  'authenticated has no DELETE privilege on work_assignments'
);
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.work_assignments'::regclass and polcmd = 'd'),
  0,
  'work_assignments has no DELETE policy'
);

-- Setup test users
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000050', 'issue50-a@example.test'),
  ('00000000-0000-0000-0000-000000000051', 'issue50-b@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000050', 'Issue 50 User A'),
  ('00000000-0000-0000-0000-000000000051', 'Issue 50 User B');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000050';

-- 1. Standard creation with Staffing Employer, Client Company, Project, effective_from, effective_to
create temp table test_assignments (
  label text primary key,
  id uuid not null
) on commit drop;

insert into test_assignments (label, id)
select 'first', id
from public.create_work_assignment('Staffing H1', 'Client A', 'Project P1', '2026-01-01', '2026-03-31');

select is(
  (select count(*)::integer from public.work_assignments),
  1,
  'work assignment is created and visible to owner'
);

select is(
  (select staffing_employer from public.work_assignments where id = (select id from test_assignments where label = 'first')),
  'Staffing H1',
  'staffing_employer matches input'
);

-- 2. Adjacent assignment (inclusive dates, no overlap)
insert into test_assignments (label, id)
select 'second_adjacent', id
from public.create_work_assignment('Staffing H2', 'Client B', 'Project P2', '2026-04-01', '2026-06-30');

select is(
  (select count(*)::integer from public.work_assignments),
  2,
  'contiguous boundary date is allowed without overlap error'
);

-- 3. Gap between assignments is allowed
insert into test_assignments (label, id)
select 'third_with_gap', id
from public.create_work_assignment('Staffing H3', 'Client C', 'Project P3', '2026-08-01', '2026-10-31');

select is(
  (select count(*)::integer from public.work_assignments),
  3,
  'gap between assignments (July) is allowed'
);

-- 4. Future assignment is allowed
insert into test_assignments (label, id)
select 'future', id
from public.create_work_assignment('Staffing H4', 'Client D', 'Project P4', '2029-01-01', '2029-12-31');

select is(
  (select count(*)::integer from public.work_assignments where id = (select id from test_assignments where label = 'future')),
  1,
  'future assignment can be created'
);

-- 5. Open-ended assignment is allowed
insert into test_assignments (label, id)
select 'open_ended', id
from public.create_work_assignment('Staffing H5', 'Client E', 'Project P5', '2030-01-01', null);

select is(
  (select effective_to from public.work_assignments where id = (select id from test_assignments where label = 'open_ended')),
  null,
  'open-ended assignment has null effective_to'
);

-- 6. DB constraint: Overlap with existing assignment is rejected
select throws_ok(
  $$insert into public.work_assignments (user_id, staffing_employer, client_company, project, effective_from, effective_to)
    values ('00000000-0000-0000-0000-000000000050', 'Staffing Overlap', 'Client X', 'Project X', '2026-02-15', '2026-04-15')$$,
  '23P01', null, 'overlapping assignment periods are rejected by exclusion constraint'
);

-- 7. DB constraint: Overlap with open-ended assignment is rejected
select throws_ok(
  $$insert into public.work_assignments (user_id, staffing_employer, client_company, project, effective_from, effective_to)
    values ('00000000-0000-0000-0000-000000000050', 'Staffing Overlap', 'Client X', 'Project X', '2030-06-01', '2030-12-31')$$,
  '23P01', null, 'assignment inside open-ended range is rejected by exclusion constraint'
);

-- 8. DB constraint: effective_to cannot precede effective_from
select throws_ok(
  $$insert into public.work_assignments (user_id, staffing_employer, client_company, project, effective_from, effective_to)
    values ('00000000-0000-0000-0000-000000000050', 'Bad Dates', 'Client X', 'Project X', '2027-05-01', '2027-04-01')$$,
  '23514', null, 'effective_to cannot precede effective_from'
);

-- 9. DB constraint: non-empty fields
select throws_ok(
  $$insert into public.work_assignments (user_id, staffing_employer, client_company, project, effective_from)
    values ('00000000-0000-0000-0000-000000000050', '  ', 'Client X', 'Project X', '2027-05-01')$$,
  '23514', null, 'staffing_employer cannot be blank'
);

-- 10. Renewal: Same H/A/P contiguous renewal extends existing assignment period
insert into test_assignments (label, id)
select 'renewal_base', id
from public.create_work_assignment('Renewal Employer', 'Renewal Client', 'Renewal Project', '2027-01-01', '2027-06-30');

select is(
  (select effective_to from public.work_assignments where id = (select id from test_assignments where label = 'renewal_base')),
  '2027-06-30'::date,
  'renewal base initial effective_to is 2027-06-30'
);

select public.create_work_assignment('Renewal Employer', 'Renewal Client', 'Renewal Project', '2027-07-01', '2027-12-31');

select is(
  (select effective_to from public.work_assignments where id = (select id from test_assignments where label = 'renewal_base')),
  '2027-12-31'::date,
  'uninterrupted renewal extends existing assignment effective_to'
);
select is(
  (select count(*)::integer from public.work_assignments where staffing_employer = 'Renewal Employer'),
  1,
  'uninterrupted renewal does not create a second row'
);

-- 11. Re-hire with gap: Same H/A/P with a gap creates a new assignment
select public.create_work_assignment('Renewal Employer', 'Renewal Client', 'Renewal Project', '2028-02-01', '2028-06-30');

select is(
  (select count(*)::integer from public.work_assignments where staffing_employer = 'Renewal Employer'),
  2,
  'same H/A/P with gap creates a new assignment'
);

-- 12. Identity edit: Without attendance, H/A/P can be edited
insert into test_assignments (label, id)
select 'editable', id
from public.create_work_assignment('Original Staffing', 'Original Client', 'Original Proj', '2028-08-01', '2028-09-30');

select lives_ok(
  $$select public.update_work_assignment(
      (select id from test_assignments where label = 'editable'),
      'Updated Staffing', 'Updated Client', 'Updated Proj',
      '2028-08-01', '2028-09-30'
    )$$,
  'identity fields can be updated when no attendance exists'
);

select is(
  (select staffing_employer from public.work_assignments where id = (select id from test_assignments where label = 'editable')),
  'Updated Staffing',
  'staffing_employer updated successfully'
);

-- 13. Identity edit: With attendance, H/A/P edit is blocked
-- Create a context and policy first for attendance FK
create temp table test_contexts (
  id uuid not null
) on commit drop;
insert into test_contexts (id)
select id from public.create_work_context('Ctx', 'Co', 'Proj');

create temp table test_policies (
  id uuid not null
) on commit drop;
insert into test_policies (id)
values (gen_random_uuid());

insert into public.work_policies (
  id, user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, working_days, effective_from, effective_to
) values (
  (select id from test_policies),
  '00000000-0000-0000-0000-000000000050',
  (select id from test_contexts),
  (select id from test_assignments where label = 'editable'),
  'Pol', '09:00', 480, 60, 'STANDARD_START', array['1'], '2028-08-01', '2028-09-30'
);

-- Insert attendance record linked to this assignment as superuser
reset role;

insert into public.attendance_records (
  user_id, work_date, context_id, work_policy_id, assignment_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  context_snapshot, policy_snapshot, calculation_snapshot
) values (
  '00000000-0000-0000-0000-000000000050',
  '2028-08-15',
  (select id from test_contexts),
  (select id from test_policies),
  (select id from test_assignments where label = 'editable'),
  '2028-08-15 09:00:00+08',
  '2028-08-15 09:00:00+08',
  '2028-08-15 18:00:00+08',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000050';

select throws_ok(
  $$update public.work_assignments
    set staffing_employer = 'Blocked Change'
    where id = (select id from test_assignments where label = 'editable')$$,
  'P0001', null, 'cannot modify staffing employer after attendance records exist'
);

select throws_ok(
  $$update public.work_assignments
    set client_company = 'Blocked Client'
    where id = (select id from test_assignments where label = 'editable')$$,
  'P0001', null, 'cannot modify client company after attendance records exist'
);

select throws_ok(
  $$update public.work_assignments
    set project = 'Blocked Project'
    where id = (select id from test_assignments where label = 'editable')$$,
  'P0001', null, 'cannot modify project after attendance records exist'
);

-- 14. Period edit: Period adjustment excluding child policy is blocked
select throws_ok(
  $$update public.work_assignments
    set effective_from = '2028-08-10'
    where id = (select id from test_assignments where label = 'editable')$$,
  'P0001', null, 'cannot shrink effective_from past existing policy effective_from'
);

select throws_ok(
  $$update public.work_assignments
    set effective_to = '2028-08-20'
    where id = (select id from test_assignments where label = 'editable')$$,
  'P0001', null, 'cannot shrink effective_to before existing policy effective_to'
);

-- 15. Period edit: Period adjustment excluding attendance record is blocked
select throws_ok(
  $$update public.work_assignments
    set effective_from = '2028-08-16'
    where id = (select id from test_assignments where label = 'editable')$$,
  'P0001', null, 'cannot shrink effective_from past existing attendance work_date'
);

-- 16. Period edit: Shrink effective_to before existing attendance is blocked
select throws_ok(
  $$update public.work_assignments
    set effective_to = '2028-08-10'
    where id = (select id from test_assignments where label = 'editable')$$,
  'P0001', null, 'cannot shrink effective_to before existing attendance work_date'
);

-- 17. Period edit: Period update causing overlap with another assignment is blocked
select throws_ok(
  $$update public.work_assignments
    set effective_from = '2026-06-15'
    where id = (select id from test_assignments where label = 'third_with_gap')$$,
  '23P01', null, 'updating assignment to overlap another assignment is blocked by exclusion constraint'
);

-- 18. Period edit: Safe expansion of assignment period succeeds
select lives_ok(
  $$update public.work_assignments
    set effective_from = '2028-07-15', effective_to = '2028-10-15'
    where id = (select id from test_assignments where label = 'editable')$$,
  'expanding assignment period safely succeeds'
);

select is(
  (select effective_from from public.work_assignments where id = (select id from test_assignments where label = 'editable')),
  '2028-07-15'::date,
  'effective_from expanded successfully'
);

-- 19. User isolation with User B
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000051';

select is(
  (select count(*)::integer from public.work_assignments),
  0,
  'User B cannot see User A work assignments'
);

select throws_ok(
  $$select public.update_work_assignment(
      (select id from test_assignments where label = 'first'),
      'Hacked', 'Hacked', 'Hacked', '2026-01-01', '2026-03-31'
    )$$,
  'P0001', null, 'User B cannot update User A assignment via update_work_assignment RPC'
);

do $$
declare
  updated_count integer;
begin
  update public.work_assignments
  set staffing_employer = 'Hacked'
  where id = '00000000-0000-0000-0000-000000000050';
  get diagnostics updated_count = row_count;
  if updated_count <> 0 then
    raise exception 'RLS failed to block direct update across users';
  end if;
end $$;

select ok(true, 'direct update across users updates 0 rows due to RLS');

select throws_ok(
  $$insert into public.work_assignments (user_id, staffing_employer, client_company, project, effective_from)
    values ('00000000-0000-0000-0000-000000000050', 'Forged', 'Client', 'Proj', '2031-01-01')$$,
  '42501', null, 'User B cannot insert assignment for User A'
);

-- User B can create an assignment for themselves with identical dates without conflict
select lives_ok(
  $$select public.create_work_assignment('User B Employer', 'User B Client', 'User B Project', '2026-01-01', '2026-03-31')$$,
  'User B can create assignment with dates matching User A without overlap conflict'
);

select * from finish();

rollback;
