create table public.messages (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes (id),
  project_id uuid not null references public.projects (id),
  stage public.node_status not null,
  type public.message_type not null,
  author_role text not null
    constraint messages_author_role_allowed check (author_role in ('human', 'agent', 'system')),
  author_id uuid references auth.users (id),
  body text not null
    constraint messages_body_length check (char_length(body) <= 20000),
  created_at timestamptz not null default now(),
  fts tsvector generated always as (to_tsvector('english', body)) stored
);

create index messages_node_id_idx on public.messages (node_id);
create index messages_project_id_idx on public.messages (project_id);
create index messages_fts_idx on public.messages using gin (fts);

-- TODO 8c320d4b 2026-09-25: grants and RLS policies for messages.
alter table public.messages enable row level security;
