begin;

select plan(55);

select has_table('public', 'attendance_records', 'attendance_records table exists');
select is(
  (select count(*)::integer
   from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'create_manual_attendance'
     and pg_get_function_identity_arguments(oid) = 'p_work_date date, p_actual_clock_in_time time without time zone, p_actual_clock_out_time time without time zone, p_status_note text'),
  1,
  'create_manual_attendance resolves by target date without a context argument'
);
select is(
  (select count(*)::integer
   from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'edit_attendance_record'
     and pg_get_function_identity_arguments(oid) = 'p_id uuid, p_actual_clock_in_time time without time zone, p_actual_clock_out_time time without time zone, p_status_note text'),
  1,
  'edit_attendance_record resolves by immutable work date without a context argument'
);
select is(
  (select count(*)::integer
   from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'create_manual_attendance'
     and pg_get_function_identity_arguments(oid) = 'p_work_date date, p_context_id uuid, p_actual_clock_in_time time without time zone, p_actual_clock_out_time time without time zone, p_status_note text'),
  0,
  'legacy create_manual_attendance context signature is removed'
);
select is(
  (select count(*)::integer
   from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname = 'edit_attendance_record'
     and pg_get_function_identity_arguments(oid) = 'p_id uuid, p_context_id uuid, p_actual_clock_in_time time without time zone, p_actual_clock_out_time time without time zone, p_status_note text'),
  0,
  'legacy edit_attendance_record context signature is removed'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.create_manual_attendance(date, time, time, text)'::regprocedure),
  true,
  'target-date create RPC remains SECURITY DEFINER'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.edit_attendance_record(uuid, time, time, text)'::regprocedure),
  true,
  'target-date edit RPC remains SECURITY DEFINER'
);
select ok(
  (select position('resolve_work_assignment_policy' in prosrc) > 0
   from pg_proc where oid = 'public.create_manual_attendance(date, time, time, text)'::regprocedure),
  'target-date create uses the canonical assignment policy resolver'
);
select ok(
  (select position('resolve_work_assignment_policy' in prosrc) > 0
   from pg_proc where oid = 'public.edit_attendance_record(uuid, time, time, text)'::regprocedure),
  'target-date edit uses the canonical assignment policy resolver'
);
select ok(
  (select position('for update' in prosrc) > 0
   from pg_proc where oid = 'public.edit_attendance_record(uuid, time, time, text)'::regprocedure),
  'target-date edit locks the existing record before resolving its date'
);

insert into auth.users (id, email)
values
  ('53000000-0000-0000-0000-000000000001', 'issue53-user-a@example.test'),
  ('53000000-0000-0000-0000-000000000002', 'issue53-user-b@example.test');

insert into public.profiles (id, display_name)
values
  ('53000000-0000-0000-0000-000000000001', 'Issue 53 User A'),
  ('53000000-0000-0000-0000-000000000002', 'Issue 53 User B');

set local role authenticated;
set local request.jwt.claim.sub = '53000000-0000-0000-0000-000000000001';

create temp table issue_53_ids (
  label text primary key,
  id uuid not null
) on commit drop;
grant all on issue_53_ids to authenticated;

insert into issue_53_ids (label, id)
select 'assignment_a', id
from public.create_work_assignment(
  'Issue 53 Employer A', 'Issue 53 Client A', 'Issue 53 Project A',
  '2026-08-01'::date, '2026-08-31'::date
);

insert into issue_53_ids (label, id)
select 'policy_a', id
from public.create_work_policy(
  (select id from issue_53_ids where label = 'assignment_a'),
  'Issue 53 Policy A', '09:00:00', 480, 60, 'ACTUAL', 'NONE', null,
  'NONE', null, array['0', '1', '2', '3', '4', '5', '6'],
  '2026-08-01'::date, '2026-08-20'::date, 'Asia/Taipei'
);

select throws_ok(
  $$select public.create_manual_attendance('2026-08-25'::date, '09:00:00'::time, '18:00:00'::time, null)$$,
  'P0001',
  '2026-08-25 沒有適用的 Work Policy（MISSING_POLICY）。',
  'create rejects a date whose assignment has no applicable policy'
);
select throws_ok(
  $$select public.create_manual_attendance('2026-09-01'::date, '09:00:00'::time, '18:00:00'::time, null)$$,
  'P0001',
  '2026-09-01 沒有可用的 Work Assignment（NO_ASSIGNMENT）。',
  'create rejects a date without an applicable assignment'
);
select is(
  (select count(*)::integer from public.attendance_records where user_id = auth.uid()),
  0,
  'date-specific create rejections do not write attendance records'
);

select * into temporary issue_53_created
from public.create_manual_attendance(
  '2026-08-15'::date, '09:00:00'::time, '18:00:00'::time, 'created note'
);

select is((select count(*)::integer from issue_53_created), 1, 'valid target-date create returns one record');
select is((select assignment_snapshot->>'staffing_employer' from issue_53_created), 'Issue 53 Employer A', 'create stores canonical assignment snapshot');
select is((select policy_snapshot->>'name' from issue_53_created), 'Issue 53 Policy A', 'create stores canonical policy snapshot');
select is((select policy_snapshot->>'assignment_id' from issue_53_created), (select id::text from issue_53_ids where label = 'assignment_a'), 'policy snapshot stores canonical assignment id');
select is((select context_snapshot from issue_53_created), '{}'::jsonb, 'create stores an empty legacy context snapshot when policy has no context');
select is((select calculation_snapshot->>'state' from issue_53_created), 'COMPLETED', 'create stores the canonical completed calculation snapshot');
select is((select created_source from issue_53_created), 'MANUAL', 'manual create preserves created_source audit');
select is((select manually_adjusted from issue_53_created), false, 'manual create starts with manually_adjusted false');
select is((select status_note from issue_53_created), 'created note', 'manual create stores status_note');

select public.edit_attendance_record(
  (select id from issue_53_created), '08:00:00'::time, '18:00:00'::time, 'edited note'
);

select is((select policy_snapshot->>'name' from public.attendance_records where id = (select id from issue_53_created)), 'Issue 53 Policy A', 'edit resolves policy using the record work_date');
select is((select effective_clock_in_at from public.attendance_records where id = (select id from issue_53_created)), '2026-08-15 00:00:00+00'::timestamptz, 'edit recalculates effective clock-in using the canonical helper');
select is((select net_worked_minutes from public.attendance_records where id = (select id from issue_53_created)), 540, 'edit recalculates canonical worked minutes');
select is((select created_source from public.attendance_records where id = (select id from issue_53_created)), 'MANUAL', 'edit preserves created_source audit');
select is((select manually_adjusted from public.attendance_records where id = (select id from issue_53_created)), true, 'edit marks the record manually adjusted');
select ok((select last_manual_edit_at is not null from public.attendance_records where id = (select id from issue_53_created)), 'edit records last_manual_edit_at');
select is((select status_note from public.attendance_records where id = (select id from issue_53_created)), 'edited note', 'edit updates status_note');

select throws_ok(
  $$select public.create_manual_attendance('2026-08-15'::date, '10:00:00'::time, '19:00:00'::time, null)$$,
  '23505',
  null,
  'same user and work_date remains unique'
);

set role postgres;
insert into public.attendance_records (
  user_id, work_date, context_id, work_policy_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  assignment_snapshot, context_snapshot, policy_snapshot, calculation_snapshot
) values (
  '53000000-0000-0000-0000-000000000001', '2026-08-16', null,
  (select id from issue_53_ids where label = 'policy_a'),
  '2026-08-16 09:00:00+00', '2026-08-16 09:00:00+00', '2026-08-16 18:00:00+00',
  null, '{}', '{}', '{}'
);
create temp table issue_53_resolvable_legacy_id (id uuid primary key) on commit drop;
insert into issue_53_resolvable_legacy_id
select id from public.attendance_records where user_id = '53000000-0000-0000-0000-000000000001' and work_date = '2026-08-16';
grant all on issue_53_resolvable_legacy_id to authenticated;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '53000000-0000-0000-0000-000000000001';

select is((select assignment_id from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), null::uuid, 'resolvable legacy attendance starts without assignment_id');
select is((select assignment_snapshot from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), null::jsonb, 'resolvable legacy attendance starts without assignment_snapshot');

select public.edit_attendance_record(
  (select id from issue_53_resolvable_legacy_id),
  '08:00:00'::time,
  '18:00:00'::time,
  'Legacy target-date edit'
);

select is((select assignment_id from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), (select id from issue_53_ids where label = 'assignment_a'), 'edit backfills resolver-derived assignment_id on legacy attendance');
select is((select assignment_snapshot->>'staffing_employer' from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), 'Issue 53 Employer A', 'edit backfills the canonical assignment snapshot on legacy attendance');
select is((select work_policy_id from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), (select id from issue_53_ids where label = 'policy_a'), 'edit stores the resolver-derived work_policy_id');
select is((select policy_snapshot->>'name' from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), 'Issue 53 Policy A', 'edit stores the canonical policy snapshot on legacy attendance');
select is((select policy_snapshot->>'assignment_id' from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), (select id::text from issue_53_ids where label = 'assignment_a'), 'edit policy snapshot retains resolver-derived assignment identity');
select is((select calculation_snapshot->>'state' from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), 'COMPLETED', 'edit stores the recalculated completion snapshot on legacy attendance');
select is((select net_worked_minutes from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), 540, 'edit recalculates legacy attendance net worked minutes');
select is((select work_date from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), '2026-08-16'::date, 'edit preserves immutable legacy work_date');
select is((select created_source from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), 'CLOCK', 'edit preserves immutable legacy created_source');
select is((select manually_adjusted from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), true, 'edit marks legacy attendance manually adjusted');
select ok((select last_manual_edit_at is not null from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), 'edit records manual audit time on legacy attendance');
select is((select actual_clock_in_at from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), '2026-08-16 00:00:00+00'::timestamptz, 'edit recalculates legacy actual clock-in in Asia/Taipei');
select is((select effective_clock_in_at from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), '2026-08-16 00:00:00+00'::timestamptz, 'edit recalculates legacy effective clock-in');
select is((select status_note from public.attendance_records where id = (select id from issue_53_resolvable_legacy_id)), 'Legacy target-date edit', 'edit preserves manual status note semantics on legacy attendance');

set role postgres;
select throws_ok(
  $$update public.attendance_records set assignment_id = null, assignment_snapshot = null where id = (select id from issue_53_resolvable_legacy_id)$$,
  'P0001',
  null,
  'direct attendance identity update remains rejected'
);
select set_config('app.attendance_rpc', 'on', true);
select throws_ok(
  $$update public.attendance_records set assignment_id = '00000000-0000-0000-0000-000000000099'::uuid, assignment_snapshot = '{}'::jsonb where id = (select id from issue_53_resolvable_legacy_id)$$,
  'P0001',
  null,
  'trusted marker cannot update attendance identity away from resolver-derived values'
);
select set_config('app.attendance_rpc', '', true);
reset role;
set local role authenticated;

set role postgres;
insert into public.attendance_records (
  user_id, work_date, assignment_id, context_id, work_policy_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  assignment_snapshot, context_snapshot, policy_snapshot, calculation_snapshot
) values (
  '53000000-0000-0000-0000-000000000001', '2026-08-25',
  (select id from issue_53_ids where label = 'assignment_a'), null,
  (select id from issue_53_ids where label = 'policy_a'),
  '2026-08-25 09:00:00+00', '2026-08-25 09:00:00+00', '2026-08-25 18:00:00+00',
  '{}', '{}', '{}', '{}'
);
reset role;
set local role authenticated;

select throws_ok(
  format($$select public.edit_attendance_record('%s'::uuid, '10:00:00'::time, '19:00:00'::time, null)$$, (select id from public.attendance_records where work_date = '2026-08-25')),
  'P0001',
  '2026-08-25 沒有適用的 Work Policy（MISSING_POLICY）。',
  'edit rejects missing policy for the immutable record work_date'
);
select is(
  (select actual_clock_in_at from public.attendance_records where work_date = '2026-08-25'),
  '2026-08-25 09:00:00+00'::timestamptz,
  'missing-policy edit rejection leaves the locked record unchanged'
);

set role postgres;
insert into public.work_assignments (
  id, user_id, staffing_employer, client_company, project, effective_from, effective_to
) values (
  '53000000-0000-0000-0000-000000000054',
  '53000000-0000-0000-0000-000000000002',
  'Issue 53 Legacy Employer', 'Issue 53 Legacy Client', 'Issue 53 Legacy Project',
  '2026-07-01', '2026-07-31'
);
insert into public.work_contexts (
  id, user_id, name, company_identifier, project_identifier, active, is_default
) values (
  '53000000-0000-0000-0000-000000000053',
  '53000000-0000-0000-0000-000000000002',
  'Issue 53 Legacy Context', 'LEGACY-COMP', 'LEGACY-PROJ', false, false
);
insert into public.work_policies (
  user_id, context_id, assignment_id, name, standard_start_time, work_minutes,
  fixed_break_minutes, early_arrival_policy, working_days, effective_from, effective_to
) values (
  '53000000-0000-0000-0000-000000000002',
  '53000000-0000-0000-0000-000000000053', '53000000-0000-0000-0000-000000000054', 'Issue 53 Legacy Policy',
  '09:00:00', 480, 0, 'ACTUAL', array['0', '1', '2', '3', '4', '5', '6'],
  '2026-07-01', '2026-07-31'
);
insert into public.attendance_records (
  user_id, work_date, context_id, work_policy_id,
  actual_clock_in_at, effective_clock_in_at, expected_clock_out_at,
  context_snapshot, policy_snapshot, calculation_snapshot
) values (
  '53000000-0000-0000-0000-000000000002', '2026-08-01',
  '53000000-0000-0000-0000-000000000053',
  (select id from public.work_policies where name = 'Issue 53 Legacy Policy'),
  '2026-08-01 09:00:00+00', '2026-08-01 09:00:00+00', '2026-08-01 17:00:00+00',
  '{"name":"Issue 53 Legacy Context"}', '{"name":"Issue 53 Legacy Policy"}', '{}'
);
create temp table issue_53_legacy_id (id uuid primary key) on commit drop;
insert into issue_53_legacy_id
select id from public.attendance_records where work_date = '2026-08-01';
grant all on issue_53_legacy_id to authenticated;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '53000000-0000-0000-0000-000000000002';

select is((select count(*)::integer from public.attendance_records where work_date = '2026-08-01'), 1, 'legacy attendance records remain readable');
select is((select assignment_id from public.attendance_records where work_date = '2026-08-01'), null::uuid, 'legacy attendance keeps a null assignment id');
select throws_ok(
  format($$select public.edit_attendance_record('%s'::uuid, '10:00:00'::time, '19:00:00'::time, null)$$, (select id from issue_53_legacy_id)),
  'P0001',
  '2026-08-01 沒有可用的 Work Assignment（NO_ASSIGNMENT）。',
  'edit rejects no assignment for the immutable legacy record work_date'
);
select is((select actual_clock_in_at from public.attendance_records where work_date = '2026-08-01'), '2026-08-01 09:00:00+00'::timestamptz, 'no-assignment edit rejection leaves the legacy record unchanged');

set local request.jwt.claim.sub = '53000000-0000-0000-0000-000000000001';
select throws_ok(
  format($$select public.edit_attendance_record('%s'::uuid, '10:00:00'::time, '19:00:00'::time, null)$$, (select id from issue_53_legacy_id)),
  'P0001',
  null,
  'cross-user edit remains protected'
);

select * from finish();

rollback;
