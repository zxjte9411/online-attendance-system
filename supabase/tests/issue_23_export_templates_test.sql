create extension if not exists pgtap with schema extensions;

begin;

select plan(31);

-- 1. Schema & Structure
select has_table('public', 'export_templates', 'export_templates table exists');
select has_column('public', 'export_templates', 'id', 'export_templates.id exists');
select has_column('public', 'export_templates', 'user_id', 'export_templates.user_id exists');
select has_column('public', 'export_templates', 'context_id', 'export_templates.context_id exists');
select has_column('public', 'export_templates', 'name', 'export_templates.name exists');
select has_column('public', 'export_templates', 'storage_path', 'export_templates.storage_path exists');
select has_column('public', 'export_templates', 'month_worksheet_mapping', 'export_templates.month_worksheet_mapping exists');
select has_column('public', 'export_templates', 'row_mapping', 'export_templates.row_mapping exists');
select has_column('public', 'export_templates', 'static_cell_mapping', 'export_templates.static_cell_mapping exists');
select has_column('public', 'export_templates', 'created_at', 'export_templates.created_at exists');
select has_column('public', 'export_templates', 'updated_at', 'export_templates.updated_at exists');

-- Constraints & Indices
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.export_templates'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) like '%(user_id, context_id)%'),
  1,
  'one template per user and context'
);

-- Permissions
select is(has_table_privilege('authenticated', 'public.export_templates', 'SELECT'), true, 'authenticated can select export_templates');
select is(has_table_privilege('authenticated', 'public.export_templates', 'INSERT'), true, 'authenticated can insert export_templates');
select is(has_table_privilege('authenticated', 'public.export_templates', 'UPDATE'), true, 'authenticated can update export_templates');
select is(has_table_privilege('authenticated', 'public.export_templates', 'DELETE'), true, 'authenticated can delete export_templates');

select is(has_table_privilege('anon', 'public.export_templates', 'SELECT'), false, 'anon cannot select export_templates');
select is(has_table_privilege('anon', 'public.export_templates', 'INSERT'), false, 'anon cannot insert export_templates');
select is(has_table_privilege('anon', 'public.export_templates', 'UPDATE'), false, 'anon cannot update export_templates');
select is(has_table_privilege('anon', 'public.export_templates', 'DELETE'), false, 'anon cannot delete export_templates');

-- Setup Users & Work Contexts
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000023', 'issue23-a@example.test'),
  ('00000000-0000-0000-0000-000000000024', 'issue23-b@example.test');

insert into public.profiles (id, display_name)
values
  ('00000000-0000-0000-0000-000000000023', 'Issue 23 User A'),
  ('00000000-0000-0000-0000-000000000024', 'Issue 23 User B');

set local app.work_context_default_rpc = 'on';

insert into public.work_contexts (id, user_id, name, company_identifier, project_identifier, is_default, active)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000023', 'Context A1', 'COMP-A', 'PROJ-A1', true, true),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000023', 'Context A2', 'COMP-A', 'PROJ-A2', false, true),
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000024', 'Context B1', 'COMP-B', 'PROJ-B1', true, true);

set local app.work_context_default_rpc = 'off';

-- Switch to User A
set role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000023';

-- 2. User A CRUD own Template
insert into public.export_templates (
  id,
  user_id,
  context_id,
  name,
  storage_path,
  month_worksheet_mapping,
  row_mapping,
  static_cell_mapping,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000999',
  '00000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-000000000101',
  '2026 Monthly Template',
  '00000000-0000-0000-0000-000000000023/00000000-0000-0000-0000-000000000101/00000000-0000-0000-0000-000000000999/source.xlsx',
  '{"2026-08": "8月"}'::jsonb,
  '[{"sourceField": "date", "targetColumn": "B"}]'::jsonb,
  '[{"sourceField": "company_identifier", "targetCell": "B3"}]'::jsonb,
  '2026-08-30 00:00:00+08'::timestamptz,
  '2026-08-30 00:00:00+08'::timestamptz
);

select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000000999'),
  '2026 Monthly Template',
  'User A can insert and select own export template'
);

update public.export_templates
set name = 'Updated Template Name',
    month_worksheet_mapping = '{"2026-08": "8月", "2026-09": "9月"}'::jsonb
where id = '00000000-0000-0000-0000-000000000999';

select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000000999'),
  'Updated Template Name',
  'User A can update own export template'
);

select ok(
  (select updated_at > created_at from public.export_templates where id = '00000000-0000-0000-0000-000000000999'),
  'export_templates updated_at is maintained by trigger'
);

-- 3. Composite FK prevents forging context ownership
select throws_ok(
  $$insert into public.export_templates (user_id, context_id, name, storage_path)
    values ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000201', 'Forged Template', 'path/to/file')$$,
  '23503',
  null,
  'foreign key prevents referencing context of another user'
);

-- 4. Unique per user + context
select throws_ok(
  $$insert into public.export_templates (user_id, context_id, name, storage_path)
    values ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000101', 'Duplicate Template', 'path/to/file2')$$,
  '23505',
  null,
  'duplicate export template for same user and context is rejected'
);

-- 5. Storage RLS for User A
insert into storage.objects (id, bucket_id, name, owner)
values (
  '00000000-0000-0000-0000-000000000888',
  'export-templates',
  '00000000-0000-0000-0000-000000000023/00000000-0000-0000-0000-000000000101/00000000-0000-0000-0000-000000000999/source.xlsx',
  '00000000-0000-0000-0000-000000000023'
);

select is(
  (select count(*)::integer from storage.objects where bucket_id = 'export-templates'),
  1,
  'User A can insert and select own storage object in export-templates bucket'
);

-- Switch to User B
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000024';

-- 6. User B cannot see User A template
select is(
  (select count(*)::integer from public.export_templates),
  0,
  'User B cannot select User A export template'
);

-- 7. User B cannot update User A template
update public.export_templates
set name = 'Hacked Template'
where id = '00000000-0000-0000-0000-000000000999';

-- 8. User B cannot delete User A template
delete from public.export_templates
where id = '00000000-0000-0000-0000-000000000999';

-- 9. User B cannot see User A storage object
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'export-templates'),
  0,
  'User B cannot select User A storage object'
);

-- 10. User B cannot insert storage object into User A folder
select throws_ok(
  $$insert into storage.objects (id, bucket_id, name, owner)
    values (
      '00000000-0000-0000-0000-000000000889',
      'export-templates',
      '00000000-0000-0000-0000-000000000023/hacked.xlsx',
      '00000000-0000-0000-0000-000000000024'
    )$$,
  '42501',
  null,
  'User B cannot insert into User A storage folder'
);

-- Switch back to User A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000023';

select is(
  (select name from public.export_templates where id = '00000000-0000-0000-0000-000000000999'),
  'Updated Template Name',
  'User A template was not altered by User B'
);

-- User A deletes own template
delete from public.export_templates
where id = '00000000-0000-0000-0000-000000000999';

select is(
  (select count(*)::integer from public.export_templates),
  0,
  'User A can delete own export template'
);

select finish();

rollback;
