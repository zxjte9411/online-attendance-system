-- Issue #55: Export Templates Work Assignment ownership
-- Make context_id nullable to allow assignment-owned export templates
alter table public.export_templates
  alter column context_id drop not null;

-- Add assignment_id to export_templates
alter table public.export_templates
  add column if not exists assignment_id uuid;

-- Add composite foreign key constraint (assignment_id, user_id) -> work_assignments(id, user_id)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'export_templates_assignment_owner_fkey'
  ) then
    alter table public.export_templates
      add constraint export_templates_assignment_owner_fkey
        foreign key (assignment_id, user_id)
        references public.work_assignments (id, user_id)
        on delete restrict;
  end if;
end $$;

-- Enforce one export template per assignment per user
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'export_templates_one_per_user_assignment'
  ) then
    alter table public.export_templates
      add constraint export_templates_one_per_user_assignment
        unique (user_id, assignment_id);
  end if;
end $$;

-- Enforce that at least one of assignment_id or context_id is present
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'export_templates_owner_present'
  ) then
    alter table public.export_templates
      add constraint export_templates_owner_present
        check (assignment_id is not null or context_id is not null);
  end if;
end $$;

-- Index for assignment owner lookup
create index if not exists export_templates_assignment_owner_idx
  on public.export_templates (assignment_id, user_id);
