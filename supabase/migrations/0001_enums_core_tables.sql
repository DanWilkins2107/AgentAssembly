create extension if not exists pgcrypto with schema extensions;

create type public.node_status as enum (
  'human_braindump_needed',
  'awaiting_agent_breakdown',
  'awaiting_human_response',
  'split_proposed',
  'split_approved',
  'broken_down',
  'awaiting_agent_spec',
  'spec_review',
  'ready_for_pickup',
  'human_only_action',
  'evaluating_soft_block',
  'pr_raised',
  'pr_changes_requested',
  'pr_base_moved',
  'done',
  'invalidated'
);

create type public.edge_type as enum (
  'subtask',
  'firm_block',
  'firm_block_plan',
  'soft_block',
  'soft_block_plan',
  'reassess_after',
  'relates_to'
);

create type public.message_type as enum (
  'note',
  'question',
  'answer',
  'split_proposal',
  'split_decision',
  'spec_submission',
  'review_comment',
  'system'
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint projects_name_length check (char_length(name) between 1 and 200),
  repo_owner text constraint projects_repo_owner_length check (char_length(repo_owner) <= 200),
  repo_name text constraint projects_repo_name_length check (char_length(repo_name) <= 200),
  webhook_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.project_members (
  project_id uuid not null references public.projects (id),
  user_id uuid not null references auth.users (id),
  role text not null constraint project_members_role_allowed check (role in ('owner', 'agent')),
  primary key (project_id, user_id)
);

create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  title text not null constraint nodes_title_length check (char_length(title) between 1 and 300),
  body text not null default '',
  status public.node_status not null default 'human_braindump_needed',
  is_vision boolean not null default false,
  breakdown_on_merge boolean not null default false,
  spec text,
  pr_url text constraint nodes_pr_url_length check (char_length(pr_url) <= 2000),
  pr_number integer constraint nodes_pr_number_positive check (pr_number > 0),
  merge_sha text constraint nodes_merge_sha_length check (char_length(merge_sha) <= 64),
  invalidation_reason text,
  claimed_by text constraint nodes_claimed_by_length check (char_length(claimed_by) <= 200),
  claimed_at timestamptz,
  tldraw_doc jsonb,
  canvas_png_path text constraint nodes_canvas_png_path_length check (char_length(canvas_png_path) <= 1024),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' || coalesce(body, '') || ' '
        || coalesce(spec, '') || ' ' || coalesce(invalidation_reason, '')
    )
  ) stored
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  source_id uuid not null references public.nodes (id),
  target_id uuid not null references public.nodes (id),
  type public.edge_type not null,
  removed_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint edges_no_self_loop check (source_id <> target_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes (id),
  project_id uuid not null references public.projects (id),
  stage public.node_status not null,
  author_role text not null
    constraint messages_author_role_allowed check (author_role in ('human', 'agent', 'system')),
  author_id uuid references auth.users (id),
  type public.message_type not null,
  body text not null,
  created_at timestamptz not null default now(),
  fts tsvector generated always as (to_tsvector('english', body)) stored
);

create table public.events (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  node_id uuid,
  actor_id uuid,
  actor_role text not null
    constraint events_actor_role_allowed check (actor_role in ('human', 'agent', 'system')),
  type text not null constraint events_type_length check (char_length(type) <= 100),
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index nodes_project_id_status_idx on public.nodes (project_id, status);
create index nodes_fts_idx on public.nodes using gin (fts);
create index edges_project_id_idx on public.edges (project_id);
create index edges_source_id_idx on public.edges (source_id);
create index edges_target_id_idx on public.edges (target_id);
create index messages_node_id_idx on public.messages (node_id);
create index messages_project_id_idx on public.messages (project_id);
create index messages_fts_idx on public.messages using gin (fts);
create index events_project_id_created_at_idx on public.events (project_id, created_at);
create index events_node_id_idx on public.events (node_id);

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger nodes_set_updated_at
before update on public.nodes
for each row execute function public.set_updated_at();

-- RLS on with zero policies: nothing is readable until slice 8c320d4b adds
-- grants and policies. supabase/tests/access_coverage_test.sql enforces this.
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
alter table public.messages enable row level security;
alter table public.events enable row level security;
