-- 0008 revoked public. SELECT is granted column by column so that withholding
-- webhook_secret -- a bearer credential -- happens at the grant: a policy could
-- only hide rows, but an ungranted column is unreachable by `select *` too.
grant select (id, name, repo_owner, repo_name, created_by, created_at, archived_at)
  on public.projects to authenticated;

-- projects has no immutability trigger, so leaving id, created_by and created_at
-- out of the UPDATE grant is the only thing stopping a member rewriting
-- authorship. No INSERT: creating a project is the bootstrap_project definer
-- function (2e6806f8), which lands the owner membership row in the same
-- transaction. No DELETE: projects are archived via archived_at.
grant update (name, repo_owner, repo_name, archived_at)
  on public.projects to authenticated;

create policy projects_select_member
  on public.projects
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = id
         and m.user_id = (select auth.uid())
    )
  );

-- role lives on the (project, user) row, so owning some other project grants
-- nothing here. WITH CHECK repeats USING because an UPDATE is otherwise checked
-- only against the old row.
create policy projects_update_owner
  on public.projects
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = id
         and m.user_id = (select auth.uid())
         and m.role = 'owner'
    )
  )
  with check (
    exists (
      select 1
        from public.project_members m
       where m.project_id = id
         and m.user_id = (select auth.uid())
         and m.role = 'owner'
    )
  );
