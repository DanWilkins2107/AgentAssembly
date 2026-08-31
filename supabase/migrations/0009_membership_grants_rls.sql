-- Membership helpers, role grants and RLS policies. 0008 shut every public
-- table to anon and authenticated; this migration opens back exactly what a
-- signed-in member needs and nothing else.
--
-- Two layers, both required for a read to succeed:
--   * the GRANT decides which columns a role may ever touch,
--   * the POLICY decides which rows of those columns it sees.
-- A column with no grant is refused outright (42501), which is strictly
-- stronger than an empty 200, so credentials stay at the grant layer.

-- Helpers ---------------------------------------------------------------
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

-- Grants ----------------------------------------------------------------
--
-- anon is granted nothing at all: 0008's revoke stands and nothing here
-- mentions it. Every SELECT is column-listed rather than table-wide, so a
-- column added by a later migration is unreadable until someone adds it here
-- on purpose.

-- webhook_secret is a bearer credential used to authenticate inbound GitHub
-- webhooks. It is absent from both lists: no client reads it, and no client
-- rotates it to a value they chose.
grant select (id, name, repo_owner, repo_name, created_by, created_at, archived_at)
  on public.projects to authenticated;
grant update (name, repo_owner, repo_name, archived_at)
  on public.projects to authenticated;

-- Read-only for clients. Membership is administered by the owner through a
-- server-side path, so a compromised agent cannot widen its own reach.
grant select (project_id, user_id, role) on public.project_members to authenticated;

grant select (
  id, project_id, title, body, status, is_vision, spec, invalidation_reason,
  pr_number, claimed_by, claimed_at, created_by, created_at, updated_at, fts
) on public.nodes to authenticated;
grant insert, update on public.nodes to authenticated;

grant select (id, project_id, source_id, target_id, type, removed_at, created_by, created_at)
  on public.edges to authenticated;
grant insert, update on public.edges to authenticated;

grant select (id, node_id, project_id, stage, type, author_role, author_id, body, created_at, fts)
  on public.messages to authenticated;
grant insert, update on public.messages to authenticated;

-- Append-only audit log: clients read it, and only definer triggers write it.
grant select (id, project_id, node_id, actor_id, actor_role, type, data, created_at)
  on public.events to authenticated;

-- Policies --------------------------------------------------------------
--
-- One question decides access to a project: does a project_members row exist
-- for (project_id, auth.uid())? No row means no access -- not read, not write,
-- not existence. Every policy is `to authenticated`, so anon is refused by the
-- policy as well as by the missing grant.
--
-- Writes repeat the predicate as both USING and WITH CHECK: USING bounds which
-- rows may be updated, WITH CHECK bounds what they may become, so a row can
-- neither be created in nor moved into a project the caller is not in.
--
-- There is no DELETE policy on any table, deliberately. Nothing is ever
-- deleted through the API: removal is a flag (edges.removed_at) or a status
-- (nodes 'invalidated'), and history stays readable.

create policy projects_select on public.projects
  for select to authenticated using (public.is_project_member(id));

-- Project settings are the owner's, not every member's. INSERT is deliberately
-- absent: creating a project also creates its owner membership row, which is a
-- server-side bootstrap, not a client insert.
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_project_owner(id))
  with check (public.is_project_owner(id));

create policy project_members_select on public.project_members
  for select to authenticated using (public.is_project_member(project_id));

create policy nodes_select on public.nodes
  for select to authenticated using (public.is_project_member(project_id));
create policy nodes_insert on public.nodes
  for insert to authenticated with check (public.is_project_member(project_id));
create policy nodes_update on public.nodes
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy edges_select on public.edges
  for select to authenticated using (public.is_project_member(project_id));
create policy edges_insert on public.edges
  for insert to authenticated with check (public.is_project_member(project_id));
create policy edges_update on public.edges
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy messages_select on public.messages
  for select to authenticated using (public.is_project_member(project_id));
create policy messages_insert on public.messages
  for insert to authenticated with check (public.is_project_member(project_id));
create policy messages_update on public.messages
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));

create policy events_select on public.events
  for select to authenticated using (public.is_project_member(project_id));
