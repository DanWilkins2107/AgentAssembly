-- project_members: read-only for clients. Membership is administered by the
-- owner through a server-side path, so a compromised agent cannot widen its own
-- reach.
grant select (project_id, user_id, role) on public.project_members to authenticated;

create policy project_members_select on public.project_members
  for select to authenticated using (public.is_project_member(project_id));
