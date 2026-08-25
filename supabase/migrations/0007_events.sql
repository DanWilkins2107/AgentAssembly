create table public.events (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  node_id uuid,
  actor_id uuid,
  actor_role text not null
    constraint events_actor_role_allowed check (actor_role in ('human', 'agent', 'system')),
  -- No value constraint: the audit vocabulary is open-ended and grows with the
  -- app, so `type` is capped for length only.
  type text not null constraint events_type_length check (char_length(type) <= 100),
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index events_project_id_created_at_idx on public.events (project_id, created_at);
create index events_node_id_idx on public.events (node_id);

-- TODO 8c320d4b: grants, RLS policies, and append-only (revoke UPDATE/DELETE).
alter table public.events enable row level security;
