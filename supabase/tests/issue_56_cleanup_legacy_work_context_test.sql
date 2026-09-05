create extension if not exists pgtap;
begin;

select plan(26);

-- 1. work_contexts table schema & permissions
select has_table('public', 'work_contexts', 'work_contexts table exists');
select hasnt_column('public', 'work_contexts', 'is_default', 'is_default column is removed');
select hasnt_column('public', 'work_contexts', 'active', 'active column is removed');

select hasnt_function('public', 'create_work_context', 'create_work_context RPC is removed');
select hasnt_function('public', 'activate_work_context', 'activate_work_context RPC is removed');
select hasnt_function('public', 'set_default_work_context', 'set_default_work_context RPC is removed');

select is(
  has_table_privilege('authenticated', 'public.work_contexts', 'INSERT'),
  false,
  'authenticated has no INSERT privilege on work_contexts'
);
select is(
  has_table_privilege('authenticated', 'public.work_contexts', 'UPDATE'),
  false,
  'authenticated has no UPDATE privilege on work_contexts'
);
select is(
  has_table_privilege('authenticated', 'public.work_contexts', 'DELETE'),
  false,
  'authenticated has no DELETE privilege on work_contexts'
);
select is(
  has_table_privilege('authenticated', 'public.work_contexts', 'SELECT'),
  true,
  'authenticated has SELECT privilege on work_contexts'
);

-- Seed users & profiles
insert into auth.users (id, email) values
  ('56000000-0000-0000-0000-000000000001', 'issue56-user1@example.com'),
  ('56000000-0000-0000-0000-000000000002', 'issue56-user2@example.com');

insert into public.profiles (id, display_name) values
  ('56000000-0000-0000-0000-000000000001', 'Issue 56 User 1'),
  ('56000000-0000-0000-0000-000000000002', 'Issue 56 User 2');

-- Seed historical work_contexts via superuser
insert into public.work_contexts (id, user_id, name, company_identifier, project_identifier) values
  ('56000000-0000-0000-0000-000000000010', '56000000-0000-0000-0000-000000000001', 'Archived Context 1', 'COMP-1', 'PROJ-1'),
  ('56000000-0000-0000-0000-000000000020', '56000000-0000-0000-0000-000000000002', 'Archived Context 2', 'COMP-2', 'PROJ-2');

-- Seed work_assignments
insert into public.work_assignments (id, user_id, staffing_employer, client_company, project, effective_from, effective_to) values
  ('56000000-0000-0000-0000-000000000100', '56000000-0000-0000-0000-000000000001', 'Staffing 1', 'Client 1', 'Project 1', '2026-01-01', null);

-- Seed work_policies
insert into public.work_policies (
  id, user_id, assignment_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, clock_in_rounding_mode, clock_out_rounding_mode, working_days, effective_from, effective_to, timezone
) values (
  '56000000-0000-0000-0000-000000000200', '56000000-0000-0000-0000-000000000001',
  '56000000-0000-0000-0000-000000000100', '56000000-0000-0000-0000-000000000010',
  'Policy 1', '09:00', 480, 60, 'STANDARD_START', 'NONE', 'NONE', array['0', '1', '2', '3', '4', '5', '6'], '2026-01-01', null, 'Asia/Taipei'
);

-- Seed a historical attendance record linked to historical context
insert into public.attendance_records (
  id, user_id, work_date, assignment_id, context_id, work_policy_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  created_source, context_snapshot, policy_snapshot, calculation_snapshot
) values (
  '56000000-0000-0000-0000-000000000300', '56000000-0000-0000-0000-000000000001',
  '2026-08-01', '56000000-0000-0000-0000-000000000100', '56000000-0000-0000-0000-000000000010',
  '56000000-0000-0000-0000-000000000200',
  '2026-08-01 09:00:00+08', '2026-08-01 09:00:00+08', '2026-08-01 18:00:00+08',
  'CLOCK', '{"name": "Archived Context 1"}'::jsonb, '{}'::jsonb,
  '{"state": "IN_PROGRESS", "calculation_version": "v1"}'::jsonb
);

-- 2. Authenticated user permission checks on work_contexts
set local role authenticated;
set local request.jwt.claim.sub = '56000000-0000-0000-0000-000000000001';

select throws_ok(
  $$insert into public.work_contexts (user_id, name, company_identifier, project_identifier)
    values ('56000000-0000-0000-0000-000000000001', 'New Context', 'Co', 'Proj')$$,
  '42501', null, 'authenticated cannot insert into work_contexts'
);

select throws_ok(
  $$update public.work_contexts set name = 'Hacked' where id = '56000000-0000-0000-0000-000000000010'$$,
  '42501', null, 'authenticated cannot update work_contexts'
);

select throws_ok(
  $$delete from public.work_contexts where id = '56000000-0000-0000-0000-000000000010'$$,
  '42501', null, 'authenticated cannot delete work_contexts'
);

select is(
  (select count(*)::integer from public.work_contexts),
  1,
  'authenticated user can select only own archived work contexts'
);

-- 3. Historical attendance traceability
select is(
  (select context_snapshot->>'name' from public.attendance_records where id = '56000000-0000-0000-0000-000000000300'),
  'Archived Context 1',
  'historical context snapshot is preserved and readable'
);

select is(
  (select context_id from public.attendance_records where id = '56000000-0000-0000-0000-000000000300'),
  '56000000-0000-0000-0000-000000000010'::uuid,
  'historical context_id foreign key is preserved'
);

-- 4. Today clock_in_today creates record with null context_id and empty context_snapshot
select * into temporary issue_56_today_clock_in from public.clock_in_today();

select is(
  (select context_id from issue_56_today_clock_in),
  null,
  'clock_in_today sets context_id to null'
);

select is(
  (select context_snapshot from issue_56_today_clock_in),
  '{}'::jsonb,
  'clock_in_today sets context_snapshot to empty jsonb'
);

select is(
  (select assignment_id from issue_56_today_clock_in),
  '56000000-0000-0000-0000-000000000100'::uuid,
  'clock_in_today binds to resolved work_assignment'
);

-- Clock out today
select * into temporary issue_56_today_clock_out from public.clock_out_today();

select is(
  (select context_id from issue_56_today_clock_out),
  null,
  'clock_out_today preserves null context_id'
);

select is(
  (select context_snapshot from issue_56_today_clock_out),
  '{}'::jsonb,
  'clock_out_today preserves empty context_snapshot'
);

-- 5. create_manual_attendance sets context_id to null and empty context_snapshot
select * into temporary issue_56_manual_record from public.create_manual_attendance(
  '2026-08-10'::date,
  '09:00:00'::time,
  '18:00:00'::time,
  'Issue 56 manual note'
);

select is(
  (select context_id from issue_56_manual_record),
  null,
  'create_manual_attendance sets context_id to null'
);

select is(
  (select context_snapshot from issue_56_manual_record),
  '{}'::jsonb,
  'create_manual_attendance sets context_snapshot to empty jsonb'
);

-- 6. edit_attendance_record sets context_id to null and empty context_snapshot
select * into temporary issue_56_edited_record from public.edit_attendance_record(
  (select id from issue_56_manual_record),
  '09:30:00'::time,
  '18:30:00'::time,
  'Issue 56 edited note'
);

select is(
  (select context_id from issue_56_edited_record),
  null,
  'edit_attendance_record sets context_id to null'
);

select is(
  (select context_snapshot from issue_56_edited_record),
  '{}'::jsonb,
  'edit_attendance_record sets context_snapshot to empty jsonb'
);

-- 7. prevent_attendance_snapshot_update blocks direct updates
select throws_ok(
  $$update public.attendance_records
    set context_id = '56000000-0000-0000-0000-000000000010'
    where id = (select id from issue_56_manual_record)$$,
  '42501', null, 'direct update on attendance_records is rejected by RLS'
);

select * from finish();

rollback;
