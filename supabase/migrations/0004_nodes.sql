create table public.nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  title text not null
    constraint nodes_title_length check (char_length(title) between 1 and 300),
  -- body, spec and invalidation_reason are uncapped by design: they carry
  -- braindumps, specs and post-mortems that a length limit would truncate.
  body text not null default '',
  -- The node_status enum, never text: an unknown status must fail to insert.
  -- No default: every caller states the status it means.
  status public.node_status not null,
  is_vision boolean not null default false,
  breakdown_on_merge boolean not null default false,
  spec text,
  invalidation_reason text,
  pr_url text
    constraint nodes_pr_url_length check (char_length(pr_url) <= 2000),
  pr_number integer
    constraint nodes_pr_number_positive check (pr_number > 0),
  merge_sha text
    constraint nodes_merge_sha_length check (char_length(merge_sha) <= 64),
  claimed_by text
    constraint nodes_claimed_by_length check (char_length(claimed_by) <= 200),
  claimed_at timestamptz,
  canvas_png_path text
    constraint nodes_canvas_png_path_length check (char_length(canvas_png_path) <= 1024),
  tldraw_doc jsonb,
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
  -- A claim is who plus when, and a raised PR is url plus number: half of
  -- either pair is a bug, so both-or-neither.
  constraint nodes_claim_pair check (num_nonnulls(claimed_by, claimed_at) <> 1),
  constraint nodes_pr_pair check (num_nonnulls(pr_url, pr_number) <> 1)
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
