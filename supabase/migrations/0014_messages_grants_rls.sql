-- 0008 revoked public. Messages carry no credential column, so the grants are
-- table-level. No UPDATE or DELETE grant: 0009's messages_forbid_update and
-- messages_forbid_delete triggers already make a message append-only, and
-- granting either would only turn a clean permission denial into a raised
-- exception one layer later.
grant select, insert on public.messages to authenticated;

-- One predicate for both policies: a project_members row for
-- (messages.project_id, auth.uid()). project_id is qualified because the
-- subquery's own project_members column would otherwise shadow it and make the
-- comparison trivially true. Inlined rather than wrapped in a helper -- no
-- definer helper exists, and this runs as the invoker against 0010's self-row
-- policy.
create policy messages_select_member
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = messages.project_id
         and m.user_id = (select auth.uid())
    )
  );

-- WITH CHECK pins author_id on top of membership: membership alone would let one
-- member post under another's name. A null author_id fails it too -- `null =
-- uid` is unknown -- which is what keeps system messages a service-role path,
-- and service_role bypasses RLS anyway. No UPDATE or DELETE policy: there is no
-- grant to reach one.
create policy messages_insert_member
  on public.messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
        from public.project_members m
       where m.project_id = messages.project_id
         and m.user_id = (select auth.uid())
    )
  );
