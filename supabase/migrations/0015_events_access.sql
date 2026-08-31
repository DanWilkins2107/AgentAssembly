-- events: append-only audit log. Members read it; only definer triggers write
-- it, so there is no INSERT grant and no INSERT policy.
grant select (id, project_id, node_id, actor_id, actor_role, type, data, created_at)
  on public.events to authenticated;

create policy events_select on public.events
  for select to authenticated using (public.is_project_member(project_id));
