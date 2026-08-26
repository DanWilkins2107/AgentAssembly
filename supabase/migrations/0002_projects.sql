-- Root of the ownership hierarchy: members, nodes, edges, messages all hang off
-- projects.id. Foreign keys carry no ON DELETE, so nothing cascades anywhere --
-- a project is archived (archived_at), never deleted.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null
    constraint projects_name_length check (char_length(name) between 1 and 200),
  repo_owner text
    constraint projects_repo_owner_length check (char_length(repo_owner) <= 200),
  repo_name text
    constraint projects_repo_name_length check (char_length(repo_name) <= 200),
  -- A repo link is a pair. Deliberately not unique: two projects may track the
  -- same GitHub repo, and webhook routing keys off the per-project secret.
  constraint projects_repo_pair check (num_nonnulls(repo_owner, repo_name) <> 1),
  webhook_secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

-- webhook_secret is a bearer credential: slice 8c320d4b must withhold client
-- SELECT on that column specifically, not just on the table.
-- TODO 8c320d4b 2026-09-25: grants and RLS policies for projects.
alter table public.projects enable row level security;
