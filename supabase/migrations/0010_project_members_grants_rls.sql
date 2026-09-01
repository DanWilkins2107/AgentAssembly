-- 0008 revoked everything in public from anon and authenticated. This opens
-- back exactly what a signed-in caller needs on project_members, and nothing
-- else: writes stay shut because granting membership is a project owner's
-- privilege, which is slice 00201051. anon gets nothing.
grant select on public.project_members to authenticated;

-- Self-row only, and deliberately so. Any membership check against
-- project_members from inside project_members' own policy self-recurses
-- (42P17), and the definer helpers that would have broken that cycle were
-- dropped in b3792d83, so the predicate reads the caller's id directly.
--
-- This is what the other five tables' policies stand on. Each inlines
-- `exists (select 1 from public.project_members where project_id = ... and
-- user_id = (select auth.uid()))`, which runs as the invoker and so is gated by
-- this grant and this policy. The row that check looks for is the caller's own,
-- which is exactly the row this policy admits, so it resolves -- and no sibling
-- policy can observe anyone else's membership.
--
-- The consequence is that a member cannot list their co-members. That needs a
-- definer function, and it belongs to 00201051, where membership management
-- actually needs the list.
create policy project_members_select_self
  on public.project_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));
