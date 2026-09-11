-- 0008 revoked public. Events carry no credential column, so the grant is
-- table-level. SELECT only: the audit trail is written server-side by the
-- system actor under service_role, which bypasses RLS entirely, so a member
-- never needs INSERT. No UPDATE or DELETE grant either -- 0009's
-- events_forbid_update and events_forbid_delete triggers already make an event
-- append-only, and granting either would only turn a clean permission denial
-- into a raised exception one layer later.
grant select on public.events to authenticated;

-- Membership is a project_members row for (events.project_id, auth.uid()).
-- project_id is qualified because the subquery's own project_members column
-- would otherwise shadow it and make the comparison trivially true -- every
-- member would then read every project's audit trail. Inlined rather than
-- wrapped in a helper -- no definer helper exists, and this runs as the invoker
-- against 0010's self-row policy. A non-member matches no row, so the audit
-- trail of a project they are not in does not exist for them.
create policy events_select_member
  on public.events
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.project_members m
       where m.project_id = events.project_id
         and m.user_id = (select auth.uid())
    )
  );

-- No INSERT, UPDATE or DELETE policy: there is no grant to reach one.
