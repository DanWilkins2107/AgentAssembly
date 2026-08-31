-- projects: member reads, owner writes.
--
-- Every SELECT grant in 0010-0015 is column-listed rather than table-wide, so a
-- column added by a later migration is unreadable until someone adds it here on
-- purpose. anon is granted nothing anywhere: 0008's revoke stands and nothing
-- in this set mentions it.
--
-- webhook_secret is a bearer credential used to authenticate inbound GitHub
-- webhooks. It is absent from both lists: no client reads it, and no client
-- rotates it to a value they chose.
grant select (id, name, repo_owner, repo_name, created_by, created_at, archived_at)
  on public.projects to authenticated;
grant update (name, repo_owner, repo_name, archived_at)
  on public.projects to authenticated;

create policy projects_select on public.projects
  for select to authenticated using (public.is_project_member(id));

-- Project settings are the owner's, not every member's. INSERT is deliberately
-- absent: creating a project also creates its owner membership row, which is a
-- server-side bootstrap, not a client insert. So is DELETE, here and in every
-- migration below -- nothing is ever deleted through the API: removal is a flag
-- (edges.removed_at) or a status (nodes 'invalidated'), and history stays
-- readable.
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_project_owner(id))
  with check (public.is_project_owner(id));
