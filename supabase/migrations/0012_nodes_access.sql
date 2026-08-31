-- nodes: members read and write within their own project.
--
-- Writes repeat the membership predicate as both USING and WITH CHECK: USING
-- bounds which rows may be updated, WITH CHECK bounds what they may become, so
-- a row can neither be created in nor moved into a project the caller is not
-- in. 0013 and 0014 follow the same shape.
grant select (
  id, project_id, title, body, status, is_vision, spec, invalidation_reason,
  pr_number, claimed_by, claimed_at, created_by, created_at, updated_at, fts
) on public.nodes to authenticated;
grant insert, update on public.nodes to authenticated;

create policy nodes_select on public.nodes
  for select to authenticated using (public.is_project_member(project_id));
create policy nodes_insert on public.nodes
  for insert to authenticated with check (public.is_project_member(project_id));
create policy nodes_update on public.nodes
  for update to authenticated
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
