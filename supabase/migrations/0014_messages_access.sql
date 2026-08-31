-- messages: members read and write within their own project.
grant select (id, node_id, project_id, stage, type, author_role, author_id, body, created_at, fts)
  on public.messages to authenticated;
grant insert, update on public.messages to authenticated;

create policy messages_select on public.messages
  for select to authenticated using (public.is_project_member(project_id));
create policy messages_insert on public.messages
  for insert to authenticated with check (public.is_project_member(project_id));
create policy messages_update on public.messages
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
