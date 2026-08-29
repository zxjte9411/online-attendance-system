-- Issue #23: Export Templates persistence and Storage bucket

create table public.export_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_id uuid not null,
  name text not null check (btrim(name) <> ''),
  storage_path text not null check (btrim(storage_path) <> ''),
  month_worksheet_mapping jsonb not null default '{}'::jsonb,
  row_mapping jsonb not null default '[]'::jsonb,
  static_cell_mapping jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint export_templates_context_owner_fkey
    foreign key (context_id, user_id)
    references public.work_contexts (id, user_id)
    on delete restrict,
  constraint export_templates_one_per_user_context
    unique (user_id, context_id),
  constraint export_templates_month_mapping_object
    check (jsonb_typeof(month_worksheet_mapping) = 'object'),
  constraint export_templates_row_mapping_array
    check (jsonb_typeof(row_mapping) = 'array'),
  constraint export_templates_static_mapping_array
    check (jsonb_typeof(static_cell_mapping) = 'array')
);

alter table public.export_templates enable row level security;

revoke all
  on table public.export_templates
  from anon, public;

grant select, insert, update, delete
  on table public.export_templates
  to authenticated;

create trigger export_templates_set_updated_at
  before update on public.export_templates
  for each row execute function public.set_updated_at();

-- RLS policies for export_templates metadata table
create policy export_templates_owner_select on public.export_templates
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy export_templates_owner_insert on public.export_templates
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy export_templates_owner_update on public.export_templates
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy export_templates_owner_delete on public.export_templates
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Storage bucket for export templates (private)
insert into storage.buckets (id, name, public)
values ('export-templates', 'export-templates', false)
on conflict (id) do nothing;

-- Storage RLS on storage.objects for export-templates bucket
create policy export_templates_storage_owner_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'export-templates'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy export_templates_storage_owner_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'export-templates'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy export_templates_storage_owner_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'export-templates'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'export-templates'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy export_templates_storage_owner_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'export-templates'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
