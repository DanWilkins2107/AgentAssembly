-- 0008 revoked public. Nodes carry no credential column, so unlike projects
-- (0011) there is nothing to withhold and the grants are table-level. No DELETE
-- grant: board history is permanent, and 0009's forbid-delete trigger is the
-- backstop underneath this.
grant select, insert, update on public.nodes to authenticated;

-- One predicate for all three policies: a project_members row for
-- (nodes.project_id, auth.uid()). project_id is qualified because the
-- subquery's own project_members column would otherwise shadow it and make the
-- comparison trivially true. Inlined rather than wrapped in a helper -- no
-- definer helper exists, and this runs as the invoker against 0010's self-row
-- policy.
create policy nodes_select_member
  on public.nodes
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = nodes.project_id
         and m.user_id = (select auth.uid())
    )
  );

create policy nodes_insert_member
  on public.nodes
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.project_members m
       where m.project_id = nodes.project_id
         and m.user_id = (select auth.uid())
    )
  );

-- WITH CHECK repeats USING because an UPDATE is otherwise vetted only against
-- the old row, which would let a member move a node into a project they are not
-- in. No DELETE policy: there is no DELETE grant to reach one.
create policy nodes_update_member
  on public.nodes
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = nodes.project_id
         and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.project_members m
       where m.project_id = nodes.project_id
         and m.user_id = (select auth.uid())
    )
  );
