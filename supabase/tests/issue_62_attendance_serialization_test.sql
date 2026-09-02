begin;

select plan(12);

-- pgTAP runs this file in one session; source ordering proves the shared lock
-- contract, while the public calls cover the first-attendance behavior.

select ok(
  (select position('perform 1 from public.profiles where id = owner_id for update' in prosrc) > 0
   from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  'clock_in_today locks the owner profile'
);
select ok(
  (select position('if owner_id is null then' in prosrc)
       < position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
       and position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
         < position('now_at := pg_catalog.clock_timestamp()' in prosrc)
   from pg_proc where oid = 'public.clock_in_today()'::regprocedure),
  'clock_in_today locks after owner validation and before attendance reads'
);
select ok(
  (select position('perform 1 from public.profiles where id = owner_id for update' in prosrc) > 0
   from pg_proc where oid = 'public.create_manual_attendance(date, time, time, text)'::regprocedure),
  'create_manual_attendance locks the owner profile'
);
select ok(
  (select position('if owner_id is null then' in prosrc)
       < position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
       and position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
         < position('if p_work_date is null then' in prosrc)
   from pg_proc where oid = 'public.create_manual_attendance(date, time, time, text)'::regprocedure),
  'create_manual_attendance locks after owner validation and before attendance reads'
);
select ok(
  (select position('perform 1 from public.profiles where id = owner_id for update' in prosrc) > 0
   from pg_proc where oid = 'public.update_work_assignment(uuid, text, text, text, date, date)'::regprocedure),
  'update_work_assignment locks the owner profile'
);
select ok(
  (select position('if owner_id is null then' in prosrc)
       < position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
       and position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
         < position('update public.work_assignments' in prosrc)
   from pg_proc where oid = 'public.update_work_assignment(uuid, text, text, text, date, date)'::regprocedure),
  'update_work_assignment locks after owner validation and before assignment access'
);
select ok(
  (select position('perform 1 from public.profiles where id = owner_id for update' in prosrc) > 0
   from pg_proc where oid = 'public.update_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text)'::regprocedure),
  'update_work_policy locks the owner profile'
);
select ok(
  (select position('if owner_id is null then' in prosrc)
       < position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
       and position('perform 1 from public.profiles where id = owner_id for update' in prosrc)
         < position('update public.work_policies' in prosrc)
   from pg_proc where oid = 'public.update_work_policy(uuid, text, time, integer, integer, text, text, integer, text, integer, text[], date, date, text)'::regprocedure),
  'update_work_policy locks after owner validation and before policy access'
);

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000062', 'issue62-a@example.test');
insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000062', 'Issue 62 A');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000062';

create temp table issue_62_assignment (id uuid not null) on commit drop;
insert into issue_62_assignment (id)
select id
from public.create_work_assignment(
  'Issue 62 Employer',
  'Issue 62 Client',
  'Issue 62 Project',
  (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date,
  null
);

create temp table issue_62_policy (id uuid not null) on commit drop;
insert into issue_62_policy (id)
select id
from public.create_work_policy(
  (select id from issue_62_assignment),
  'Issue 62 Policy',
  '09:00',
  480,
  60,
  'STANDARD_START',
  'NONE',
  null,
  'NONE',
  null,
  array['0', '1', '2', '3', '4', '5', '6'],
  (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date,
  null,
  'Asia/Taipei'
);

create temp table issue_62_first_attendance as
select * from public.clock_in_today();

select is(
  (select count(*)::integer from issue_62_first_attendance),
  1,
  'first attendance is created through the public attendance RPC'
);
select is(
  (select count(*)::integer from public.attendance_records),
  1,
  'first attendance persists one owner record'
);
select throws_ok(
  $$select public.update_work_assignment(
      (select id from issue_62_assignment),
      'Changed Employer', 'Issue 62 Client', 'Issue 62 Project',
      (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date, null)$$,
  'P0001', null,
  'assignment identity update remains blocked after first attendance'
);
select throws_ok(
  $$select public.update_work_policy(
      (select id from issue_62_policy),
      'Issue 62 Policy', '09:00', 481, 60, 'STANDARD_START', 'NONE', null,
      'NONE', null, array['0', '1', '2', '3', '4', '5', '6'],
      (pg_catalog.clock_timestamp() at time zone 'Asia/Taipei')::date, null, 'Asia/Taipei')$$,
  'P0001', null,
  'policy core update remains blocked after first attendance'
);

select * from finish();

rollback;
