-- Board history is permanent by design, but nothing at the database level
-- enforced it: one DELETE or TRUNCATE erases nodes or messages, and a future
-- security-definer RPC bypasses RLS entirely. These triggers are the backstop
-- underneath whatever grants slice 8c320d4b hands out.

create function public.forbid_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on public.% is forbidden', tg_op, tg_table_name
    using errcode = '23001';
end;
$$;

create trigger projects_forbid_delete before delete on public.projects
  for each row execute function public.forbid_change();
create trigger projects_forbid_truncate before truncate on public.projects
  for each statement execute function public.forbid_change();

create trigger nodes_forbid_delete before delete on public.nodes
  for each row execute function public.forbid_change();
create trigger nodes_forbid_truncate before truncate on public.nodes
  for each statement execute function public.forbid_change();

create trigger edges_forbid_delete before delete on public.edges
  for each row execute function public.forbid_change();
create trigger edges_forbid_truncate before truncate on public.edges
  for each statement execute function public.forbid_change();

create trigger messages_forbid_delete before delete on public.messages
  for each row execute function public.forbid_change();
create trigger messages_forbid_truncate before truncate on public.messages
  for each statement execute function public.forbid_change();

create trigger events_forbid_delete before delete on public.events
  for each row execute function public.forbid_change();
create trigger events_forbid_truncate before truncate on public.events
  for each statement execute function public.forbid_change();

-- public.project_members is deliberately absent: deleting the row is how a
-- membership is revoked.

create trigger messages_forbid_update before update on public.messages
  for each row execute function public.forbid_change();

create trigger events_forbid_update before update on public.events
  for each row execute function public.forbid_change();

-- Edges are write-once apart from being removed, and removal is one-way.
create function public.edges_allow_removal_only() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous public.edges := old;
  candidate public.edges := new;
begin
  if old.removed_at is not null or new.removed_at is null then
    raise exception 'edges.removed_at may only go from null to a timestamp'
      using errcode = '23001';
  end if;

  candidate.removed_at := previous.removed_at;
  if candidate is distinct from previous then
    raise exception 'UPDATE on public.edges may only set removed_at'
      using errcode = '23001';
  end if;

  return new;
end;
$$;

create trigger edges_allow_removal_only before update on public.edges
  for each row execute function public.edges_allow_removal_only();

-- edges and messages each carry a project_id alongside a node reference, and
-- nothing tied the two together: a row could claim project A while pointing at
-- a node in project B, and RLS filters on project_id, so it would surface under
-- the wrong project. Composite foreign keys make that unrepresentable.

alter table public.nodes
  add constraint nodes_id_project_id_key unique (id, project_id);

alter table public.edges
  drop constraint edges_source_id_fkey,
  drop constraint edges_target_id_fkey,
  add constraint edges_source_id_project_id_fkey
    foreign key (source_id, project_id) references public.nodes (id, project_id),
  add constraint edges_target_id_project_id_fkey
    foreign key (target_id, project_id) references public.nodes (id, project_id);

alter table public.messages
  drop constraint messages_node_id_fkey,
  add constraint messages_node_id_project_id_fkey
    foreign key (node_id, project_id) references public.nodes (id, project_id);
