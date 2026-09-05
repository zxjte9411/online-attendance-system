create extension if not exists pgtap;
begin;

select plan(47);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'work_contexts', 'work_contexts table exists');
select has_table('public', 'work_policies', 'work_policies table exists');
select has_column('public', 'profiles', 'timezone', 'profiles timezone column exists');
select hasnt_column('public', 'work_contexts', 'is_default', 'work_contexts is_default column is removed');
select hasnt_column('public', 'work_contexts', 'active', 'work_contexts active column is removed');
select has_column('public', 'work_policies', 'effective_to', 'work_policies effective_to column exists');
select is(
  (select n.nspname
   from pg_extension e
   join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'btree_gist'),
  'extensions',
  'btree_gist is installed in the extensions schema'
);
select has_index(
  'public', 'work_contexts', 'work_contexts_user_id_idx',
  'work_contexts.user_id has the required foreign-key index'
);
select has_index(
  'public', 'work_policies', 'work_policies_context_owner_idx',
  'work_policies(context_id, user_id) covers the composite foreign key'
);
select is(
  has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  false,
  'authenticated has no DELETE privilege on profiles'
);
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
select is(
  has_table_privilege('authenticated', 'public.work_policies', 'DELETE'),
  false,
  'authenticated has no DELETE privilege on work_policies'
);
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.profiles'::regclass and polcmd = 'd'),
  0,
  'profiles has no DELETE policy'
);
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.work_contexts'::regclass and polcmd in ('a', 'w', 'd')),
  0,
  'work_contexts has no direct write policies'
);
select is(
  (select count(*)::integer from pg_policy
   where polrelid = 'public.work_policies'::regclass and polcmd = 'd'),
  0,
  'work_policies has no DELETE policy'
);
select hasnt_function(
  'public', 'create_work_context',
  'create_work_context RPC is removed'
);
select hasnt_function(
  'public', 'activate_work_context',
  'activate_work_context RPC is removed'
);
select hasnt_function(
  'public', 'set_default_work_context',
  'set_default_work_context RPC is removed'
);

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000017', 'issue17-a@example.test'),
  ('00000000-0000-0000-0000-000000000018', 'issue17-b@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000017', 'Issue 17 A'),
  ('00000000-0000-0000-0000-000000000018', 'Issue 17 B');

-- Seed historical work contexts via superuser/postgres role
create temp table issue_17_context_ids (
  label text primary key,
  id uuid not null
) on commit drop;

insert into issue_17_context_ids (label, id) values
  ('first', gen_random_uuid()),
  ('second', gen_random_uuid()),
  ('other-user', gen_random_uuid());

insert into public.work_contexts (id, user_id, name, company_identifier, project_identifier) values
  ((select id from issue_17_context_ids where label = 'first'), '00000000-0000-0000-0000-000000000017', 'First Context', 'Company A', 'Project A'),
  ((select id from issue_17_context_ids where label = 'second'), '00000000-0000-0000-0000-000000000017', 'Second Context', 'Company A', 'Project B'),
  ((select id from issue_17_context_ids where label = 'other-user'), '00000000-0000-0000-0000-000000000018', 'Other User Context', 'Company B', 'Project C');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000017';

select is((select count(*)::integer from public.profiles), 1, 'profiles are visible only to their owner');
select is((select timezone from public.profiles), 'Asia/Taipei', 'profile timezone is fixed');
do $$
begin
  perform pg_catalog.pg_sleep(0.01);
  update public.profiles
  set display_name = 'Issue 17 A updated'
  where id = '00000000-0000-0000-0000-000000000017';
end
$$;
select ok(
  (select updated_at > created_at from public.profiles),
  'profiles updated_at is maintained by a trigger'
);

select throws_ok(
  $$insert into public.work_contexts (user_id, name, company_identifier, project_identifier)
    values ('00000000-0000-0000-0000-000000000017', 'Bypass', 'Company A', 'Project D')$$,
  '42501', null, 'authenticated cannot insert into work_contexts'
);

select throws_ok(
  $$update public.work_contexts set name = 'Hacked' where id = (select id from issue_17_context_ids where label = 'first')$$,
  '42501', null, 'authenticated cannot update work_contexts'
);

select throws_ok(
  $$delete from public.work_contexts where id = (select id from issue_17_context_ids where label = 'first')$$,
  '42501', null, 'authenticated cannot delete work_contexts'
);

select is((select count(*)::integer from public.work_contexts), 2, 'context SELECT is isolated by owner');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000018';
select is((select count(*)::integer from public.work_contexts), 1, 'other user context SELECT is isolated by owner');
select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000017'),
  0,
  'profile SELECT is isolated by owner'
);
select is((select count(*)::integer from public.work_policies), 0, 'policy SELECT is isolated by owner');

set local role postgres;
create temp table issue_17_assignment_ids (id uuid not null) on commit drop;
insert into issue_17_assignment_ids (id)
values (gen_random_uuid());
insert into public.work_assignments (
  id, user_id, staffing_employer, client_company, project, effective_from, effective_to
) values (
  (select id from issue_17_assignment_ids),
  '00000000-0000-0000-0000-000000000017',
  'Issue 17 Employer', 'Issue 17 Client', 'Issue 17 Project', '2025-01-01', null
);

select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from, effective_to
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'other-user'),
      (select id from issue_17_assignment_ids),
      'Cross-account', '09:00', 480, 60, 'STANDARD_START', array['1'], '2026-01-01', '2027-12-31'
    )$$,
  '23503', null, 'composite FK prevents cross-account policy contexts'
);

insert into public.work_policies (
  user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, working_days, effective_from
)
select
  '00000000-0000-0000-0000-000000000017', id, (select id from issue_17_assignment_ids), 'Valid policy', '09:00', 480, 60,
  'STANDARD_START', array['1', '2'], '2026-01-01'
from issue_17_context_ids
where label = 'first';

select is((select count(*)::integer from public.work_policies), 1, 'owner can insert a policy for their context');
select is((select clock_out_rounding_mode from public.work_policies), 'NONE', 'clock-out rounding defaults to NONE');
do $$
begin
  perform pg_catalog.pg_sleep(0.01);
  update public.work_policies
  set effective_to = '2026-01-31'
  where name = 'Valid policy';
end
$$;
select is(
  (select effective_to from public.work_policies where name = 'Valid policy'),
  '2026-01-31'::date,
  'work policy effective_to can be set once'
);
select ok(
  (select updated_at > created_at from public.work_policies where name = 'Valid policy'),
  'work_policies updated_at is maintained by a trigger'
);
select lives_ok(
  $$update public.work_policies
    set name = 'Valid policy updated'
    where name = 'Valid policy'$$,
  'unused work policy name can be changed'
);
select lives_ok(
  $$update public.work_policies
    set effective_to = '2026-01-30'
    where name = 'Valid policy updated'$$,
  'unused work policy effective_to can be changed'
);

insert into public.work_policies (
  user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, working_days, effective_from, effective_to
)
select
  '00000000-0000-0000-0000-000000000017', id, (select id from issue_17_assignment_ids), 'Second valid policy', '09:00', 480, 60,
  'STANDARD_START', array['1'], '2026-02-01', '2026-02-28'
from issue_17_context_ids
where label = 'first';

select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
      working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      (select id from issue_17_assignment_ids),
      'Bad rounding', '09:00', 480, 60, 'STANDARD_START', 'CEIL', 0, array['1'], '2027-01-01'
    )$$,
  '23514', null, 'rounding minutes must be positive when rounding is enabled'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from, effective_to
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      (select id from issue_17_assignment_ids),
      'Bad dates', '09:00', 480, 60, 'STANDARD_START', array['1'], '2027-02-01', '2027-01-01'
    )$$,
  '23514', null, 'effective_to cannot precede effective_from'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      (select id from issue_17_assignment_ids),
      'No days', '09:00', 480, 60, 'STANDARD_START', array[]::text[], '2027-01-01'
    )$$,
  '23514', null, 'working_days cannot be empty'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      (select id from issue_17_assignment_ids),
      'Invalid day', '09:00', 480, 60, 'STANDARD_START', array['MONDAY'], '2027-03-01'
    )$$,
  '23514', null, 'working_days accepts only numeric day values'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, assignment_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from, effective_to
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      (select id from issue_17_assignment_ids),
      'Overlapping', '09:00', 480, 60, 'STANDARD_START', array['1'], '2026-01-15', '2026-02-01'
    )$$,
  '23P01', null, 'overlapping policy effective dates are rejected'
);
select lives_ok(
  $$update public.work_policies
    set effective_from = '2026-01-31'
    where name = 'Second valid policy'$$,
  'unused work policy effective_from can be changed'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000017';

select throws_ok(
  $$delete from public.profiles
    where id = '00000000-0000-0000-0000-000000000017'$$,
  '42501', null, 'authenticated cannot delete profiles'
);
select throws_ok(
  $$delete from public.work_policies where name = 'Valid policy updated'$$,
  '42501', null, 'authenticated cannot delete work_policies'
);

select * from finish();

rollback;
