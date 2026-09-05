-- Issue #56: Export Templates Assignment-only contract & legacy read-only enforcement

-- 1. Update RLS policies on export_templates
-- Authenticated users must bind export templates to an assignment on insert
drop policy if exists export_templates_owner_insert on public.export_templates;
create policy export_templates_owner_insert on public.export_templates
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and assignment_id is not null
  );

-- Authenticated users can only update assignment-owned export templates; legacy context-owned templates are read-only
drop policy if exists export_templates_owner_update on public.export_templates;
create policy export_templates_owner_update on public.export_templates
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and assignment_id is not null
  )
  with check (
    (select auth.uid()) = user_id
    and assignment_id is not null
  );

-- Authenticated users can only delete assignment-owned export templates; legacy context-owned templates are preserved
drop policy if exists export_templates_owner_delete on public.export_templates;
create policy export_templates_owner_delete on public.export_templates
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and assignment_id is not null
  );

-- 2. Trigger function to authoritatively enforce assignment_id on mutation and protect legacy rows
create or replace function public.export_templates_enforce_assignment_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    if (select auth.uid()) is not null and new.assignment_id is null then
      raise exception 'export_templates must belong to a work assignment (assignment_id cannot be null)';
    end if;
  elsif TG_OP = 'UPDATE' then
    if old.assignment_id is null then
      raise exception 'legacy context-owned export templates are read-only and cannot be modified or reassigned';
    end if;
    if new.assignment_id is null then
      raise exception 'export_templates must belong to a work assignment (assignment_id cannot be null)';
    end if;
  elsif TG_OP = 'DELETE' then
    if old.assignment_id is null then
      raise exception 'legacy context-owned export templates are read-only and cannot be deleted';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists export_templates_enforce_assignment_owner_trigger on public.export_templates;
create trigger export_templates_enforce_assignment_owner_trigger
  before insert or update or delete on public.export_templates
  for each row execute function public.export_templates_enforce_assignment_owner();
