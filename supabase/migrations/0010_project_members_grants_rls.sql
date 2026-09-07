-- 0008 revoked public. Signed-in callers get select only; membership writes are
-- an owner's privilege and land with membership management in 00201051.
grant select on public.project_members to authenticated;

-- Self-row only: a membership check from inside project_members' own policy
-- self-recurses (42P17). The five sibling tables inline an `exists (select 1
-- from public.project_members ...)` that runs as the invoker, so this grant and
-- this policy are what those checks resolve against. A member therefore cannot
-- list co-members -- that needs a definer function and belongs to 00201051.
create policy project_members_select_self
  on public.project_members
  for select
  to authenticated
  using (user_id = (select auth.uid()));
