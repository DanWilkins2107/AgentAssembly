-- Schema shape and behaviour for migration 0004_nodes.sql. Run by
-- `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(90);

-- Columns

select has_table('public', 'nodes', 'table public.nodes exists');

select columns_are(
  'public', 'nodes',
  array['id', 'project_id', 'title', 'body', 'status', 'is_vision',
        'breakdown_on_merge', 'spec', 'invalidation_reason', 'pr_url',
        'pr_number', 'merge_sha', 'claimed_by', 'claimed_at',
        'canvas_png_path', 'tldraw_doc', 'created_by', 'created_at',
        'updated_at', 'fts'],
  'nodes has exactly the twenty columns and no others'
);

select col_type_is('public', 'nodes', 'id',                 'uuid',                     'id is uuid');
select col_type_is('public', 'nodes', 'project_id',         'uuid',                     'project_id is uuid');
select col_type_is('public', 'nodes', 'title',              'text',                     'title is text');
select col_type_is('public', 'nodes', 'body',               'text',                     'body is text');
select col_type_is('public', 'nodes', 'is_vision',          'boolean',                  'is_vision is boolean');
select col_type_is('public', 'nodes', 'breakdown_on_merge', 'boolean',                  'breakdown_on_merge is boolean');
select col_type_is('public', 'nodes', 'spec',               'text',                     'spec is text');
select col_type_is('public', 'nodes', 'invalidation_reason','text',                     'invalidation_reason is text');
select col_type_is('public', 'nodes', 'pr_url',             'text',                     'pr_url is text');
select col_type_is('public', 'nodes', 'pr_number',          'integer',                  'pr_number is integer');
select col_type_is('public', 'nodes', 'merge_sha',          'text',                     'merge_sha is text');
select col_type_is('public', 'nodes', 'claimed_by',         'text',                     'claimed_by is text');
select col_type_is('public', 'nodes', 'claimed_at',         'timestamp with time zone', 'claimed_at is timestamptz');
select col_type_is('public', 'nodes', 'canvas_png_path',    'text',                     'canvas_png_path is text');
select col_type_is('public', 'nodes', 'tldraw_doc',         'jsonb',                    'tldraw_doc is jsonb');
select col_type_is('public', 'nodes', 'created_by',         'uuid',                     'created_by is uuid');
select col_type_is('public', 'nodes', 'created_at',         'timestamp with time zone', 'created_at is timestamptz');
select col_type_is('public', 'nodes', 'updated_at',         'timestamp with time zone', 'updated_at is timestamptz');
select col_type_is('public', 'nodes', 'fts',                'tsvector',                 'fts is tsvector');

-- Named by regtype rather than format_type: what matters is that status is the
-- node_status enum itself, so an unknown status cannot be stored as text.
select is(
  (select atttypid::regtype::text
     from pg_attribute
    where attrelid = 'public.nodes'::regclass and attname = 'status'),
  'node_status',
  'status is the public.node_status enum, not text'
);

-- Nullability

select col_not_null('public', 'nodes', 'id',                 'id is NOT NULL');
select col_not_null('public', 'nodes', 'project_id',         'project_id is NOT NULL');
select col_not_null('public', 'nodes', 'title',              'title is NOT NULL');
select col_not_null('public', 'nodes', 'body',               'body is NOT NULL');
select col_not_null('public', 'nodes', 'status',             'status is NOT NULL');
select col_not_null('public', 'nodes', 'is_vision',          'is_vision is NOT NULL');
select col_not_null('public', 'nodes', 'breakdown_on_merge', 'breakdown_on_merge is NOT NULL');
select col_not_null('public', 'nodes', 'created_by',         'created_by is NOT NULL');
select col_not_null('public', 'nodes', 'created_at',         'created_at is NOT NULL');
select col_not_null('public', 'nodes', 'updated_at',         'updated_at is NOT NULL');

select col_is_null('public', 'nodes', 'spec',                'spec is nullable: most nodes never get one');
select col_is_null('public', 'nodes', 'invalidation_reason', 'invalidation_reason is nullable and unconditioned: invalidating without a reason is legal');
select col_is_null('public', 'nodes', 'pr_url',              'pr_url is nullable: a node need not have a PR');
select col_is_null('public', 'nodes', 'pr_number',           'pr_number is nullable: a node need not have a PR');
select col_is_null('public', 'nodes', 'merge_sha',           'merge_sha is nullable until the PR merges');
select col_is_null('public', 'nodes', 'claimed_by',          'claimed_by is nullable: null means unclaimed');
select col_is_null('public', 'nodes', 'claimed_at',          'claimed_at is nullable: null means unclaimed');
select col_is_null('public', 'nodes', 'canvas_png_path',     'canvas_png_path is nullable: not every node has a canvas');
select col_is_null('public', 'nodes', 'tldraw_doc',          'tldraw_doc is nullable: not every node has a canvas');

-- Defaults

create function pg_temp.column_default(column_name text) returns text
language sql stable as $fn$
  select pg_get_expr(default_expr.adbin, default_expr.adrelid)
    from pg_attrdef default_expr
    join pg_attribute column_meta
      on column_meta.attrelid = default_expr.adrelid
     and column_meta.attnum = default_expr.adnum
   where default_expr.adrelid = 'public.nodes'::regclass
     and column_meta.attname = column_default.column_name;
$fn$;

select is(pg_temp.column_default('id'), 'gen_random_uuid()',
  'id defaults to gen_random_uuid()');

select is(pg_temp.column_default('body'), '''''::text',
  'body defaults to the empty string');

select is(pg_temp.column_default('is_vision'), 'false',
  'is_vision defaults to false');

select is(pg_temp.column_default('breakdown_on_merge'), 'false',
  'breakdown_on_merge defaults to false');

select is(pg_temp.column_default('created_at'), 'now()',
  'created_at defaults to now()');

select is(pg_temp.column_default('updated_at'), 'now()',
  'updated_at defaults to now()');

select is(pg_temp.column_default('status'), null::text,
  'status has no default: every caller states the status it means');

select is(
  (select attgenerated::text
     from pg_attribute
    where attrelid = 'public.nodes'::regclass and attname = 'fts'),
  's',
  'fts is GENERATED ALWAYS ... STORED'
);

-- Primary key and foreign keys

select col_is_pk('public', 'nodes', 'id', 'id is the primary key');

select fk_ok(
  'public', 'nodes', 'project_id', 'public', 'projects', 'id',
  'project_id references public.projects (id)'
);

select fk_ok(
  'public', 'nodes', 'created_by', 'auth', 'users', 'id',
  'created_by references auth.users (id)'
);

select set_eq(
  $$ select confrelid::regclass::text from pg_constraint
      where conrelid = 'public.nodes'::regclass and contype = 'f' $$,
  array['projects', 'auth.users'],
  'projects and auth.users are the only foreign key targets'
);

-- Delete-vs-archive is undecided, so nothing cascades: deleting a project a
-- node points at is refused rather than silently taking the graph with it.
select set_eq(
  $$ select distinct confdeltype::text from pg_constraint
      where conrelid = 'public.nodes'::regclass and contype = 'f' $$,
  array['a'],
  'every foreign key is ON DELETE NO ACTION: nothing cascades'
);

-- CHECK constraints

select set_eq(
  $$ select conname::text from pg_constraint
      where conrelid = 'public.nodes'::regclass and contype = 'c' $$,
  array['nodes_title_length', 'nodes_pr_url_length', 'nodes_pr_number_positive',
        'nodes_merge_sha_length', 'nodes_claimed_by_length',
        'nodes_canvas_png_path_length', 'nodes_claim_pair', 'nodes_pr_pair'],
  'nodes has exactly the eight named CHECK constraints'
);

-- Indexes

select indexes_are(
  'public', 'nodes',
  array['nodes_pkey', 'nodes_project_id_status_idx', 'nodes_fts_idx'],
  'nodes has the primary key index and exactly two secondary indexes'
);

select has_index(
  'public', 'nodes', 'nodes_project_id_status_idx',
  array['project_id', 'status'],
  'the board query index is on (project_id, status)'
);

select has_index(
  'public', 'nodes', 'nodes_fts_idx', 'fts',
  'the search index is on (fts)'
);

select is(
  (select access_method.amname::text
     from pg_class index_class
     join pg_am access_method on access_method.oid = index_class.relam
    where index_class.oid = 'public.nodes_fts_idx'::regclass),
  'gin',
  'the search index is a GIN index'
);

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
    where tgrelid = 'public.nodes'::regclass and not tgisinternal),
  19,
  'nodes_set_updated_at is BEFORE UPDATE FOR EACH ROW, and is the only trigger'
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
  $$ select body, is_vision, breakdown_on_merge, spec, invalidation_reason,
            pr_url, pr_number, merge_sha, claimed_by, claimed_at,
            canvas_png_path, tldraw_doc
       from public.nodes where id = '00000000-0000-0000-0000-0000000000c1' $$,
  row(''::text, false, false, null::text, null::text, null::text, null::integer,
      null::text, null::text, null::timestamptz, null::text, null::jsonb),
  'a minimal node starts unclaimed, unlinked, not a vision and not flagged for breakdown'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, created_by)
     values ('00000000-0000-0000-0000-0000000000b1', 'No status',
             '00000000-0000-0000-0000-0000000000a1') $$,
  '23502',
  null,
  'omitting status is rejected: there is no default to fall back on'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by)
     values ('00000000-0000-0000-0000-0000000000b1', 'Retired status',
             'evaluating_soft_block', '00000000-0000-0000-0000-0000000000a1') $$,
  '22P02',
  null,
  'a status outside node_status is rejected: soft blocking is retired, not storable'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by)
     values ('00000000-0000-0000-0000-0000000000b1', '',
             'human_braindump_needed', '00000000-0000-0000-0000-0000000000a1') $$,
  '23514',
  null,
  'an empty title is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by)
     values ('00000000-0000-0000-0000-0000000000b1', repeat('x', 301),
             'human_braindump_needed', '00000000-0000-0000-0000-0000000000a1') $$,
  '23514',
  null,
  'a title longer than 300 characters is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, pr_url, pr_number)
     values ('00000000-0000-0000-0000-0000000000b1', 'Long PR url',
             'pr_raised', '00000000-0000-0000-0000-0000000000a1', repeat('x', 2001), 1) $$,
  '23514',
  null,
  'a pr_url longer than 2000 characters is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, pr_url, pr_number)
     values ('00000000-0000-0000-0000-0000000000b1', 'Zero PR number',
             'pr_raised', '00000000-0000-0000-0000-0000000000a1', 'https://example.com/pr', 0) $$,
  '23514',
  null,
  'a pr_number of zero is rejected: PR numbers start at one'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, merge_sha)
     values ('00000000-0000-0000-0000-0000000000b1', 'Long sha',
             'done', '00000000-0000-0000-0000-0000000000a1', repeat('x', 65)) $$,
  '23514',
  null,
  'a merge_sha longer than 64 characters is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, claimed_by, claimed_at)
     values ('00000000-0000-0000-0000-0000000000b1', 'Long claimant',
             'ready_for_pickup', '00000000-0000-0000-0000-0000000000a1', repeat('x', 201), now()) $$,
  '23514',
  null,
  'a claimed_by longer than 200 characters is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, canvas_png_path)
     values ('00000000-0000-0000-0000-0000000000b1', 'Long canvas path',
             'human_braindump_needed', '00000000-0000-0000-0000-0000000000a1', repeat('x', 1025)) $$,
  '23514',
  null,
  'a canvas_png_path longer than 1024 characters is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, claimed_by)
     values ('00000000-0000-0000-0000-0000000000b1', 'Half claim',
             'ready_for_pickup', '00000000-0000-0000-0000-0000000000a1', 'Dans_Laptop:1') $$,
  '23514',
  null,
  'a claimed_by without a claimed_at is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, claimed_at)
     values ('00000000-0000-0000-0000-0000000000b1', 'Half claim',
             'ready_for_pickup', '00000000-0000-0000-0000-0000000000a1', now()) $$,
  '23514',
  null,
  'a claimed_at without a claimed_by is rejected'
);

select lives_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, claimed_by, claimed_at)
     values ('00000000-0000-0000-0000-0000000000b1', 'Whole claim',
             'ready_for_pickup', '00000000-0000-0000-0000-0000000000a1', 'Dans_Laptop:1', now()) $$,
  'a claim with both halves is accepted'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, pr_url)
     values ('00000000-0000-0000-0000-0000000000b1', 'Half PR',
             'pr_raised', '00000000-0000-0000-0000-0000000000a1', 'https://example.com/pr') $$,
  '23514',
  null,
  'a pr_url without a pr_number is rejected'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, pr_number)
     values ('00000000-0000-0000-0000-0000000000b1', 'Half PR',
             'pr_raised', '00000000-0000-0000-0000-0000000000a1', 7) $$,
  '23514',
  null,
  'a pr_number without a pr_url is rejected'
);

select lives_ok(
  $$ insert into public.nodes (project_id, title, status, created_by, pr_url, pr_number)
     values ('00000000-0000-0000-0000-0000000000b1', 'Whole PR',
             'pr_raised', '00000000-0000-0000-0000-0000000000a1', 'https://example.com/pr', 7) $$,
  'a PR with both halves is accepted'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by)
     values ('00000000-0000-0000-0000-0000000000bf', 'Orphan project',
             'human_braindump_needed', '00000000-0000-0000-0000-0000000000a1') $$,
  '23503',
  null,
  'project_id must reference a real project'
);

select throws_ok(
  $$ insert into public.nodes (project_id, title, status, created_by)
     values ('00000000-0000-0000-0000-0000000000b1', 'Orphan author',
             'human_braindump_needed', '00000000-0000-0000-0000-0000000000af') $$,
  '23503',
  null,
  'created_by must reference a real auth.users row'
);

select throws_ok(
  $$ delete from public.projects where id = '00000000-0000-0000-0000-0000000000b1' $$,
  '23503',
  null,
  'deleting a project that still has nodes is refused: delete-vs-archive is undecided, so nothing cascades'
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
