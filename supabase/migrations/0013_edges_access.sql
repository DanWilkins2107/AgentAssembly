-- edges: members read and write within their own project.
grant select (id, project_id, source_id, target_id, type, removed_at, created_by, created_at)
  on public.edges to authenticated;
grant insert, update on public.edges to authenticated;

create policy edges_select on public.edges
  for select to authenticated using (public.is_project_member(project_id));
create policy edges_insert on public.edges
  for insert to authenticated with check (public.is_project_member(project_id));
create policy edges_update on public.edges
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
