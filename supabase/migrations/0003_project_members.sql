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
--
-- Authorization contract the policies must enforce. Identity is auth.uid() and
-- nothing else: no header, API key or client-supplied id ever establishes who
-- the caller is. Access to a project is decided by one question: does a
-- project_members row exist for (project_id, auth.uid())? No row means no
-- access: not read, not write, not existence. A row grants exactly that row's
-- role, per project; the primary key makes it a single lookup with no
-- precedence rules. 'owner' is 'agent' plus administering the project itself
-- (membership and settings), so a compromised agent cannot widen its own reach.
-- auth.uid() is null for the service role, seeds and migrations: the system
-- actor, which bypasses RLS by construction and is server-side only.
alter table public.project_members enable row level security;
