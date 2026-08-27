create table public.project_members (
  project_id uuid not null references public.projects (id),
  user_id uuid not null references auth.users (id),
  -- Closed app-defined set, held by a CHECK rather than an enum: two values that
  -- would otherwise force an enum migration each time the set moves.
  role text not null
    constraint project_members_role_allowed check (role in ('owner', 'agent')),
  primary key (project_id, user_id)
);

-- role = 'agent' is the harness provisioning switch: that row is what makes the
-- spawn path clone the project's user-supplied repo_owner/repo_name. The CHECK
-- bounds the value; only a project owner may grant it, which is slice 00201051.
-- TODO 8c320d4b 2026-09-25: grants and RLS policies for project_members.
alter table public.project_members enable row level security;
