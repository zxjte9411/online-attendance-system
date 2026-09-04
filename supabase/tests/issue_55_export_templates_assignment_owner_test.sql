create extension if not exists pgtap with schema extensions;

begin;

select plan(15);

-- 1. Schema & Structure
select has_table('public', 'export_templates', 'export_templates table exists');
select has_column('public', 'export_templates', 'assignment_id', 'export_templates.assignment_id exists');
select col_is_null('public', 'export_templates', 'context_id', 'export_templates.context_id is nullable');

-- 2. Constraints & Indices
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.export_templates'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%(user_id, assignment_id)%'),
  1,
  'one template per user and assignment'
);

select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.export_templates'::regclass
     and contype = 'f'
     and conname = 'export_templates_assignment_owner_fkey'),
  1,
  'assignment owner foreign key exists'
);

-- Setup Users, Work Contexts, and Work Assignments
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000055', 'issue55-a@example.test'),
  ('00000000-0000-0000-0000-000000000056', 'issue55-b@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000055', 'Issue 55 User A'),
  ('00000000-0000-0000-0000-000000000056', 'Issue 55 User B');

insert into public.work_assignments (id, user_id, staffing_employer, client_company, project, effective_from, effective_to)
values
  ('00000000-0000-0000-0000-000000001551', '00000000-0000-0000-0000-000000000055', 'Staffing A', 'Client Alpha', 'Project 1', '2026-01-01', null),
  ('00000000-0000-0000-0000-000000002551', '00000000-0000-0000-0000-000000000056', 'Staffing B', 'Client Beta', 'Project 2', '2026-01-01', null);

set local app.work_context_default_rpc = 'on';
insert into public.work_contexts (id, user_id, name, company_identifier, project_identifier, is_default, active)
values
  ('00000000-0000-0000-0000-000000003551', '00000000-0000-0000-0000-000000000055', 'Context A1', 'COMP-A', 'PROJ-1', true, true);
set local app.work_context_default_rpc = 'off';

-- Switch to User A
set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000055';

-- 3. User A can insert assignment-owned template
insert into public.export_templates (
  id,
  user_id,
  assignment_id,
  name,
  storage_path,
  month_worksheet_mapping,
  row_mapping,
  static_cell_mapping
)
values (
  '00000000-0000-0000-0000-000000004551',
  '00000000-0000-0000-0000-000000000055',
  '00000000-0000-0000-0000-000000001551',
  'Assignment 1 Template',
  '00000000-0000-0000-0000-000000000055/00000000-0000-0000-0000-000000001551/tpl1/source.xlsx',
  '{"2026-08": "8月"}'::jsonb,
  '[{"sourceField": "date", "targetColumn": "B"}]'::jsonb,
  '[]'::jsonb
);

select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000004551'),
  'Assignment 1 Template',
  'User A can insert and select own assignment export template'
);

-- 4. User A can update own assignment template
update public.export_templates
set name = 'Assignment 1 Updated'
where id = '00000000-0000-0000-0000-000000004551';

select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000004551'),
  'Assignment 1 Updated',
  'User A can update own assignment export template'
);

-- 5. Cross-user foreign key protection: User A cannot link to User B assignment
select throws_ok(
  $$insert into public.export_templates (user_id, assignment_id, name, storage_path)
    values ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000002551', 'Forged Assignment Tpl', 'path')$$,
  '23503',
  null,
  'composite FK prevents referencing assignment of another user'
);

-- 6. Duplicate assignment template for same user is rejected
select throws_ok(
  $$insert into public.export_templates (user_id, assignment_id, name, storage_path)
    values ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000001551', 'Duplicate Tpl', 'path2')$$,
  '23505',
  null,
  'duplicate export template for same user and assignment is rejected'
);

-- 7. Owner check constraint: rejecting row with both assignment_id and context_id null
select throws_ok(
  $$insert into public.export_templates (user_id, name, storage_path)
    values ('00000000-0000-0000-0000-000000000055', 'Orphan Tpl', 'path3')$$,
  '23514',
  null,
  'template with no assignment_id and no context_id is rejected by check constraint'
);

-- 8. Legacy compatibility: User A can still insert context-owned template with null assignment_id
insert into public.export_templates (
  id,
  user_id,
  context_id,
  name,
  storage_path
)
values (
  '00000000-0000-0000-0000-000000004552',
  '00000000-0000-0000-0000-000000000055',
  '00000000-0000-0000-0000-000000003551',
  'Legacy Context Template',
  '00000000-0000-0000-0000-000000000055/legacy/tpl2/source.xlsx'
);

select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000004552'),
  'Legacy Context Template',
  'legacy context-owned template with null assignment_id works'
);

-- 9. Switch to User B - verify cross-user isolation
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000056';

select is(
  (select count(*)::integer from public.export_templates),
  0,
  'User B cannot select User A assignment export template'
);

update public.export_templates
set name = 'Hacked by B'
where id = '00000000-0000-0000-0000-000000004551';

select is(
  (select count(*)::integer from public.export_templates where name = 'Hacked by B'),
  0,
  'User B cannot update User A export template'
);

delete from public.export_templates
where id = '00000000-0000-0000-0000-000000004551';

-- Switch back to User A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000055';

select is(
  (select count(*)::integer from public.export_templates where id = '00000000-0000-0000-0000-000000004551'),
  1,
  'User A assignment template was not deleted by User B'
);

-- 10. User A can delete own assignment template
delete from public.export_templates
where id = '00000000-0000-0000-0000-000000004551';

select is(
  (select count(*)::integer from public.export_templates where id = '00000000-0000-0000-0000-000000004551'),
  0,
  'User A can delete own assignment export template'
);

select finish();

rollback;
