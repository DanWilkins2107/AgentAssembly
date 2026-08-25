-- Machine audit trail: status transitions, claims, edge changes. Deliberately
-- carries no foreign keys -- an audit record must never be gated by, or
-- deletable through, another table's rows. `messages` is the human-readable
-- thread; this table is the machine record.
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

-- RLS on with zero policies: nothing is readable until slice 8c320d4b adds
-- grants and policies. supabase/tests/access_coverage_test.sql enforces this.
-- Append-only enforcement (revoking UPDATE/DELETE) lands with those grants.
alter table public.events enable row level security;
