-- Trigger and search behaviour for migration 0004_nodes.sql. Run by
-- `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(13);

-- updated_at trigger

select has_function('public', 'set_updated_at', 'function public.set_updated_at() exists');

select function_returns('public', 'set_updated_at', 'trigger',
  'set_updated_at returns trigger');

-- The exact stored form of an empty search_path is a Postgres detail; what the
-- test pins is that the function sets one at all rather than inheriting the
-- caller's.
select matches(
  (select array_to_string(proconfig, ',') from pg_proc
    where oid = 'public.set_updated_at'::regproc),
  '^search_path=',
  'set_updated_at pins its own search_path'
);

select trigger_is(
  'public', 'nodes', 'nodes_set_updated_at', 'public', 'set_updated_at',
  'nodes_set_updated_at runs public.set_updated_at()'
);

-- tgtype bits: ROW (1) | BEFORE (2) | UPDATE (16).
select is(
  (select tgtype::int from pg_trigger
    where tgrelid = 'public.nodes'::regclass and tgname = 'nodes_set_updated_at'),
  19,
  'nodes_set_updated_at is BEFORE UPDATE FOR EACH ROW'
);

-- Access

select ok(
  (select relrowsecurity from pg_class where oid = 'public.nodes'::regclass),
  'row level security is enabled on nodes'
);

select is_empty(
  $$ select policyname::text from pg_policies
      where schemaname = 'public' and tablename = 'nodes' $$,
  'nodes has no RLS policies yet: grants and policies land in slice 8c320d4b'
);

-- Behaviour

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'nodes-test@example.com', '', now(), now()
);

insert into public.projects (id, name, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'Nodes test',
        '00000000-0000-0000-0000-0000000000a1');

insert into public.nodes (id, project_id, title, status, created_by)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
        'Minimal node', 'human_braindump_needed', '00000000-0000-0000-0000-0000000000a1');

select row_eq(
  $$ select body, is_vision, spec, invalidation_reason,
            pr_number, claimed_by, claimed_at
       from public.nodes where id = '00000000-0000-0000-0000-0000000000c1' $$,
  row(''::text, false, null::text, null::text, null::integer,
      null::text, null::timestamptz),
  'a minimal node starts unclaimed, unlinked and not a vision'
);

-- Full-text search

insert into public.nodes (id, project_id, title, body, spec, invalidation_reason,
                          status, created_by, claimed_by, claimed_at)
values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1',
        'Alpha', 'Bravo', 'Charlie', 'Delta', 'invalidated',
        '00000000-0000-0000-0000-0000000000a1', 'Echo', now());

select ok(
  (select fts @@ to_tsquery('english', 'alpha & bravo & charlie & delta')
     from public.nodes where id = '00000000-0000-0000-0000-0000000000c2'),
  'fts covers title, body, spec and invalidation_reason together'
);

select ok(
  (select not (fts @@ to_tsquery('english', 'echo'))
     from public.nodes where id = '00000000-0000-0000-0000-0000000000c2'),
  'fts does not reach beyond those four columns'
);

-- updated_at

insert into public.nodes (id, project_id, title, status, created_by, created_at, updated_at)
values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1',
        'Stamped node', 'human_braindump_needed', '00000000-0000-0000-0000-0000000000a1',
        '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z');

select is(
  (select updated_at from public.nodes where id = '00000000-0000-0000-0000-0000000000c3'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'the trigger does not fire on INSERT: an explicit updated_at is kept'
);

update public.nodes set title = 'Stamped node, edited'
 where id = '00000000-0000-0000-0000-0000000000c3';

select is(
  (select updated_at from public.nodes where id = '00000000-0000-0000-0000-0000000000c3'),
  now(),
  'updating a node bumps updated_at to the transaction time'
);

select is(
  (select created_at from public.nodes where id = '00000000-0000-0000-0000-0000000000c3'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'created_at is untouched by the update'
);

select * from finish();
rollback;
