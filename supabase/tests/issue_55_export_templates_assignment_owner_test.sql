create extension if not exists pgtap with schema extensions;

begin;

select plan(22);

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

insert into public.work_contexts (id, user_id, name, company_identifier, project_identifier)
values
  ('00000000-0000-0000-0000-000000003551', '00000000-0000-0000-0000-000000000055', 'Context A1', 'COMP-A', 'PROJ-1');

-- Seed pre-existing legacy context-owned template as postgres superuser
insert into public.export_templates (
  id,
  user_id,
  context_id,
  assignment_id,
  name,
  storage_path
)
values (
  '00000000-0000-0000-0000-000000004552',
  '00000000-0000-0000-0000-000000000055',
  '00000000-0000-0000-0000-000000003551',
  null,
  'Legacy Context Template',
  '00000000-0000-0000-0000-000000000055/legacy/tpl2/source.xlsx'
);

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

-- 7. Missing assignment_id rejected
select throws_ok(
  $$insert into public.export_templates (user_id, name, storage_path)
    values ('00000000-0000-0000-0000-000000000055', 'Orphan Tpl', 'path3')$$,
  'P0001',
  null,
  'template with no assignment_id is rejected'
);

-- 8. Authenticated cannot insert context-only template
select throws_ok(
  $$insert into public.export_templates (id, user_id, context_id, name, storage_path)
    values ('00000000-0000-0000-0000-000000004553', '00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000003551', 'New Context Tpl', 'path')$$,
  'P0001',
  null,
  'authenticated cannot insert context-only template'
);

-- 9. Pre-existing legacy context-owned template is readable
select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000004552'),
  'Legacy Context Template',
  'pre-existing legacy context-owned template is readable'
);

-- 10. Legacy context-owned template cannot be modified by authenticated update (RLS using filter)
update public.export_templates
set name = 'Mutated Legacy'
where id = '00000000-0000-0000-0000-000000004552';

select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000004552'),
  'Legacy Context Template',
  'legacy context-owned template cannot be modified by authenticated update'
);

-- 11. Legacy context-owned template cannot be reassigned to assignment
update public.export_templates
set assignment_id = '00000000-0000-0000-0000-000000001551'
where id = '00000000-0000-0000-0000-000000004552';

select is(
  (select assignment_id from public.export_templates where id = '00000000-0000-0000-0000-000000004552'),
  null,
  'legacy context-owned template cannot be reassigned to assignment'
);

-- 12. Legacy context-owned template cannot be deleted by authenticated delete
delete from public.export_templates
where id = '00000000-0000-0000-0000-000000004552';

select is(
  (select count(*)::integer from public.export_templates where id = '00000000-0000-0000-0000-000000004552'),
  1,
  'legacy context-owned template cannot be deleted by authenticated delete'
);

-- Reset role to postgres to test trigger directly
reset role;

-- 13. Direct trigger test: trigger authoritatively blocks legacy modification even for superuser
select throws_ok(
  $$update public.export_templates set name = 'Superuser Mutate' where id = '00000000-0000-0000-0000-000000004552'$$,
  'P0001',
  null,
  'trigger authoritatively prevents legacy template modification'
);

-- 14. Direct trigger test: trigger authoritatively blocks legacy deletion even for superuser
select throws_ok(
  $$delete from public.export_templates where id = '00000000-0000-0000-0000-000000004552'$$,
  'P0001',
  null,
  'trigger authoritatively prevents legacy template deletion'
);

-- Switch to User B - verify cross-user isolation
set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000056';

-- 15. User B cannot select User A template
select is(
  (select count(*)::integer from public.export_templates),
  0,
  'User B cannot select User A assignment export template'
);

-- 16. User B cannot update User A template
update public.export_templates
set name = 'Hacked by B'
where id = '00000000-0000-0000-0000-000000004551';

select is(
  (select count(*)::integer from public.export_templates where name = 'Hacked by B'),
  0,
  'User B cannot update User A export template'
);

-- 17. User B cannot delete User A template
delete from public.export_templates
where id = '00000000-0000-0000-0000-000000004551';

-- Switch back to User A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000055';

-- 18. User A template was not deleted by User B
select is(
  (select count(*)::integer from public.export_templates where id = '00000000-0000-0000-0000-000000004551'),
  1,
  'User A assignment template was not deleted by User B'
);

-- 19. User A can delete own assignment template
delete from public.export_templates
where id = '00000000-0000-0000-0000-000000004551';

select is(
  (select count(*)::integer from public.export_templates where id = '00000000-0000-0000-0000-000000004551'),
  0,
  'User A can delete own assignment export template'
);

-- 20. Legacy context-only row was never modified, cloned, or taken over
select is(
  (select json_build_object(
     'id', id,
     'user_id', user_id,
     'context_id', context_id,
     'assignment_id', assignment_id,
     'name', name
   )::text
   from public.export_templates
   where id = '00000000-0000-0000-0000-000000004552'),
  json_build_object(
    'id', '00000000-0000-0000-0000-000000004552'::uuid,
    'user_id', '00000000-0000-0000-0000-000000000055'::uuid,
    'context_id', '00000000-0000-0000-0000-000000003551'::uuid,
    'assignment_id', null,
    'name', 'Legacy Context Template'
  )::text,
  'legacy context-only row is preserved intact without heuristic migration or takeover'
);

select finish();

rollback;
