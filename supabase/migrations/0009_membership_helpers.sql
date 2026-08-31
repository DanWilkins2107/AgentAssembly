-- Membership helpers. First of the set 0009-0015: 0008 shut every public table
-- to anon and authenticated, 0010-0015 open back per table exactly what a
-- signed-in member needs, and every one of them asks its question through a
-- helper defined here.
--
-- Two layers guard each table, both required for a read to succeed:
--   * the GRANT decides which columns a role may ever touch,
--   * the POLICY decides which rows of those columns it sees.
-- A column with no grant is refused outright (42501), which is strictly
-- stronger than an empty 200, so credentials stay at the grant layer.
--
-- SECURITY DEFINER is load-bearing, not a convenience: the project_members
-- SELECT policy has to read project_members, and an invoker-rights read would
-- re-enter that policy forever. A definer-owned read bypasses RLS and breaks
-- the recursion. `set search_path = ''` pins every reference to its schema so
-- a caller-controlled search_path cannot swap a table out from under a
-- privileged function.
--
-- Identity is auth.uid() and nothing else. auth.uid() is null for the service
-- role, seeds and migrations -- the system actor, which bypasses RLS anyway.

create function public.is_project_member(project uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members
     where project_members.project_id = project
       and project_members.user_id = auth.uid()
  );
$$;

create function public.is_project_owner(project uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members
     where project_members.project_id = project
       and project_members.user_id = auth.uid()
       and project_members.role = 'owner'
  );
$$;

-- Storage object names are `<project id>/<rest>`, so membership for a path is
-- membership for its first segment. The regex both extracts the segment and
-- proves it is uuid-shaped: an unparseable name yields null, and
-- is_project_member(null) is false, so a malformed name is denied rather than
-- raising out of a storage policy.
create function public.is_project_member_path(path text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_project_member(
    substring(
      path from '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/'
    )::uuid
  );
$$;

-- The author role to stamp on messages and events. Membership role names the
-- privilege ('owner'/'agent'); author role names the kind of actor
-- ('human'/'agent'/'system'). Null means the caller is not a member, which the
-- callers treat as a refusal.
create function public.current_actor_role(project uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'system'
    else (
      select case project_members.role when 'owner' then 'human' else 'agent' end
        from public.project_members
       where project_members.project_id = project
         and project_members.user_id = auth.uid()
    )
  end;
$$;

-- EXECUTE on a new function goes to PUBLIC by default, and Supabase's default
-- privileges grant it to anon and authenticated by name on top of that -- so a
-- revoke from PUBLIC alone would leave anon a membership oracle. Name all three
-- and hand it back to authenticated only; the definer-owned trigger paths run
-- as the owner and need no grant.
revoke execute on function
  public.is_project_member(uuid),
  public.is_project_owner(uuid),
  public.is_project_member_path(text),
  public.current_actor_role(uuid)
from public, anon, authenticated;

grant execute on function
  public.is_project_member(uuid),
  public.is_project_owner(uuid),
  public.is_project_member_path(text),
  public.current_actor_role(uuid)
to authenticated;
