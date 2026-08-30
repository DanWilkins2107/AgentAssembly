create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  title text not null
    constraint nodes_title_length check (char_length(title) between 1 and 300),
  body text not null default ''
    constraint nodes_body_length check (char_length(body) <= 20000),
  status public.node_status not null,
  is_vision boolean not null default false,
  spec text
    constraint nodes_spec_length check (char_length(spec) <= 20000),
  invalidation_reason text
    constraint nodes_invalidation_reason_length
      check (char_length(invalidation_reason) <= 5000),
  pr_number integer
    constraint nodes_pr_number_positive check (pr_number > 0),
  claimed_by text
    constraint nodes_claimed_by_length check (char_length(claimed_by) <= 200),
  claimed_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector(
      'english',
      title || ' ' || body || ' ' ||
      coalesce(spec, '') || ' ' || coalesce(invalidation_reason, '')
    )
  ) stored,
  -- A claim is who plus when: half of the pair is a bug, so both-or-neither.
  constraint nodes_claim_pair check (num_nonnulls(claimed_by, claimed_at) <> 1)
);

create index nodes_project_id_status_idx on public.nodes (project_id, status);
create index nodes_fts_idx on public.nodes using gin (fts);

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

-- TODO 8c320d4b 2026-09-25: grants and RLS policies for nodes.
alter table public.nodes enable row level security;
