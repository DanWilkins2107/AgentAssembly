create table public.edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  source_id uuid not null references public.nodes (id),
  target_id uuid not null references public.nodes (id),
  type public.edge_type not null,
  -- Removal is a flag, never a delete: an edge that once existed stays readable
  -- as history.
  removed_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  -- Deliberately not unique on (source_id, target_id, type): re-adding a removed
  -- edge is a second row, and cycles between nodes are legal data.
  constraint edges_no_self_loop check (source_id <> target_id)
);

create index edges_project_id_idx on public.edges (project_id);
create index edges_source_id_idx on public.edges (source_id);
create index edges_target_id_idx on public.edges (target_id);

-- TODO 8c320d4b 2026-09-25: grants and RLS policies for edges.
alter table public.edges enable row level security;
