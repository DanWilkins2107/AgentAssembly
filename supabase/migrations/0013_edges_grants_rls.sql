-- 0008 revoked public. SELECT and INSERT are table-level -- edges carries no
-- credential column to withhold -- but UPDATE is granted on removed_at alone:
-- 0009's edges_allow_removal_only trigger already caps an update at that
-- column, and the grant says the same thing one layer earlier, where it costs
-- an error instead of a raised exception. No DELETE grant: an edge is removed
-- by flagging removed_at, and 0009's forbid-delete trigger is the backstop.
grant select, insert on public.edges to authenticated;
grant update (removed_at) on public.edges to authenticated;

-- One predicate for all three policies: a project_members row for
-- (edges.project_id, auth.uid()). project_id is qualified because the
-- subquery's own project_members column would otherwise shadow it and make the
-- comparison trivially true. A cross-project source/target is unrepresentable
-- (0009's composite foreign keys), so project_id is the whole check. Inlined
-- rather than wrapped in a helper -- no definer helper exists, and this runs as
-- the invoker against 0010's self-row policy.
create policy edges_select_member
  on public.edges
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = edges.project_id
         and m.user_id = (select auth.uid())
    )
  );

create policy edges_insert_member
  on public.edges
  for insert
  to authenticated
  with check (
    exists (
      select 1
        from public.project_members m
       where m.project_id = edges.project_id
         and m.user_id = (select auth.uid())
    )
  );

-- WITH CHECK repeats USING so the policy would still hold if the UPDATE grant
-- ever widened past removed_at: without it an update is vetted only against the
-- old row. No DELETE policy: there is no DELETE grant to reach one.
create policy edges_update_member
  on public.edges
  for update
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = edges.project_id
         and m.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
        from public.project_members m
       where m.project_id = edges.project_id
         and m.user_id = (select auth.uid())
    )
  );
