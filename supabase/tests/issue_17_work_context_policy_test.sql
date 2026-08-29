-- attendance_records coverage is intentionally deferred to Issue #18.

begin;

select plan(37);

select has_table('public', 'profiles');
select has_table('public', 'work_contexts');
select has_table('public', 'work_policies');
select has_column('public', 'profiles', 'timezone');
select has_column('public', 'work_contexts', 'is_default');
select has_column('public', 'work_policies', 'effective_to');

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000017', 'issue17-a@example.test'),
  ('00000000-0000-0000-0000-000000000018', 'issue17-b@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000017', 'Issue 17 A'),
  ('00000000-0000-0000-0000-000000000018', 'Issue 17 B');

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

create temp table issue_17_context_ids (
  label text primary key,
  id uuid not null
) on commit drop;

insert into issue_17_context_ids (label, id)
select 'first', id
from public.create_work_context('First', 'Company A', 'Project A');

insert into issue_17_context_ids (label, id)
select 'second', id
from public.create_work_context('Second', 'Company A', 'Project B');

insert into issue_17_context_ids (label, id)
select 'inactive', id
from public.create_work_context('Inactive', 'Company A', 'Project C', false);

select is(
  (select is_default from public.work_contexts where id = (select id from issue_17_context_ids where label = 'first')),
  true,
  'first active context becomes default'
);
select is(
  (select is_default from public.work_contexts where id = (select id from issue_17_context_ids where label = 'second')),
  false,
  'later active contexts do not replace the default'
);
select is(
  (select is_default from public.work_contexts where id = (select id from issue_17_context_ids where label = 'inactive')),
  false,
  'inactive contexts are never default'
);

select throws_ok(
  $$insert into public.work_contexts (user_id, name, company_identifier, project_identifier, is_default)
    values ('00000000-0000-0000-0000-000000000017', 'Bypass', 'Company A', 'Project D', true)$$,
  'P0001', '.*', 'is_default changes are RPC-only'
);
select throws_ok(
  $$insert into public.work_contexts (user_id, name, company_identifier, project_identifier, active)
    values ('00000000-0000-0000-0000-000000000017', 'Bypass', 'Company A', 'Project D', true)$$,
  '42501', '.*', 'RLS prevents direct active context insertion from bypassing default creation'
);

select lives_ok(
  $$select public.set_default_work_context((select id from issue_17_context_ids where label = 'second'))$$,
  'set_default_work_context accepts an active context owned by the caller'
);
select is((select count(*)::integer from public.work_contexts where is_default), 1, 'setting a default is atomic and unique');
select is((select name from public.work_contexts where is_default), 'Second', 'set_default_work_context selects the requested active context');
select ok(
  (select updated_at > created_at from public.work_contexts where name = 'Second'),
  'work_contexts updated_at is maintained by a trigger'
);
select throws_ok(
  $$select public.set_default_work_context((select id from issue_17_context_ids where label = 'inactive'))$$,
  'P0001', '.*', 'set_default_work_context rejects inactive contexts'
);

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000018';
insert into issue_17_context_ids (label, id)
select 'other-user', id
from public.create_work_context('Other user', 'Company B', 'Project A');
select is((select count(*)::integer from public.work_contexts), 1, 'context SELECT is isolated by owner');
select is(
  (select count(*)::integer from public.profiles where id = '00000000-0000-0000-0000-000000000017'),
  0,
  'profile SELECT is isolated by owner'
);
select is((select count(*)::integer from public.work_policies), 0, 'policy SELECT is isolated by owner');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000017';
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'other-user'),
      'Cross-account', '09:00', 480, 60, 'STANDARD_START', array['1'], '2026-01-01'
    )$$,
  '23503', '.*', 'composite FK prevents cross-account policy contexts'
);

insert into public.work_policies (
  user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, working_days, effective_from
)
select
  '00000000-0000-0000-0000-000000000017', id, 'Valid policy', '09:00', 480, 60,
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
select throws_ok(
  $$update public.work_policies
    set name = 'Valid policy updated'
    where name = 'Valid policy'$$,
  'P0001', '.*', 'work policy name cannot be changed after creation'
);
select throws_ok(
  $$update public.work_policies
    set effective_to = '2026-02-01'
    where name = 'Valid policy'$$,
  'P0001', '.*', 'work policy effective_to cannot be changed twice'
);

insert into public.work_policies (
  user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
  early_arrival_policy, working_days, effective_from, effective_to
)
select
  '00000000-0000-0000-0000-000000000017', id, 'Second valid policy', '09:00', 480, 60,
  'STANDARD_START', array['1'], '2026-02-01', '2026-02-28'
from issue_17_context_ids
where label = 'first';

select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, clock_in_rounding_mode, clock_in_rounding_minutes,
      working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      'Bad rounding', '09:00', 480, 60, 'STANDARD_START', 'CEIL', 0, array['1'], '2027-01-01'
    )$$,
  '23514', '.*', 'rounding minutes must be positive when rounding is enabled'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from, effective_to
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      'Bad dates', '09:00', 480, 60, 'STANDARD_START', array['1'], '2027-02-01', '2027-01-01'
    )$$,
  '23514', '.*', 'effective_to cannot precede effective_from'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      'No days', '09:00', 480, 60, 'STANDARD_START', array[]::text[], '2027-01-01'
    )$$,
  '23514', '.*', 'working_days cannot be empty'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      'Invalid day', '09:00', 480, 60, 'STANDARD_START', array['MONDAY'], '2027-03-01'
    )$$,
  '23514', '.*', 'working_days accepts only numeric day values'
);
select throws_ok(
  $$insert into public.work_policies (
      user_id, context_id, name, standard_start_time, work_minutes, fixed_break_minutes,
      early_arrival_policy, working_days, effective_from, effective_to
    ) values (
      '00000000-0000-0000-0000-000000000017',
      (select id from issue_17_context_ids where label = 'first'),
      'Overlapping', '09:00', 480, 60, 'STANDARD_START', array['1'], '2026-01-15', '2026-02-01'
    )$$,
  '23P01', '.*', 'overlapping policy effective dates are rejected'
);
select throws_ok(
  $$update public.work_policies
    set effective_from = '2026-01-31'
    where name = 'Second valid policy'$$,
  'P0001', '.*', 'work policy effective_from cannot be changed after creation'
);

select throws_ok(
  $$update public.work_contexts set is_default = true
    where id = (select id from issue_17_context_ids where label = 'first')$$,
  'P0001', '.*', 'is_default updates remain RPC-only'
);

select throws_ok(
  $$delete from public.work_contexts where id = (select id from issue_17_context_ids where label = 'first')$$,
  '23503', '.*', 'context deletion is restricted while a policy references it'
);

select * from finish();

rollback;
