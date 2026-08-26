begin;
create extension if not exists pgtap;
select plan(41);

-- Columns

select has_table('public', 'projects', 'table public.projects exists');

select columns_are(
  'public', 'projects',
  array['id', 'name', 'repo_owner', 'repo_name',
        'webhook_secret', 'created_by', 'created_at', 'archived_at'],
  'projects has exactly the eight columns and no others'
);

select col_type_is('public', 'projects', 'id',             'uuid',                     'id is uuid');
select col_type_is('public', 'projects', 'name',           'text',                     'name is text');
select col_type_is('public', 'projects', 'repo_owner',     'text',                     'repo_owner is text');
select col_type_is('public', 'projects', 'repo_name',      'text',                     'repo_name is text');
select col_type_is('public', 'projects', 'webhook_secret', 'text',                     'webhook_secret is text');
select col_type_is('public', 'projects', 'created_by',     'uuid',                     'created_by is uuid');
select col_type_is('public', 'projects', 'created_at',     'timestamp with time zone', 'created_at is timestamptz');
select col_type_is('public', 'projects', 'archived_at',    'timestamp with time zone', 'archived_at is timestamptz');

-- Nullability

select col_not_null('public', 'projects', 'id',             'id is NOT NULL');
select col_not_null('public', 'projects', 'name',           'name is NOT NULL');
select col_not_null('public', 'projects', 'webhook_secret', 'webhook_secret is NOT NULL');
select col_not_null('public', 'projects', 'created_by',     'created_by is NOT NULL');
select col_not_null('public', 'projects', 'created_at',     'created_at is NOT NULL');

select col_is_null('public', 'projects', 'repo_owner',  'repo_owner is nullable: a project need not track a repo');
select col_is_null('public', 'projects', 'repo_name',   'repo_name is nullable: a project need not track a repo');
select col_is_null('public', 'projects', 'archived_at', 'archived_at is nullable: null means active');

-- Defaults

-- pg_get_expr deparses against the live search_path, so a function living in a
-- schema that happens to be on it prints unqualified. Pinning search_path to
-- pg_catalog makes the deparsed text deterministic and the assertions exact.
create function pg_temp.column_default(target_column text) returns text
language sql stable set search_path = pg_catalog as $fn$
  select pg_get_expr(default_expr.adbin, default_expr.adrelid)
    from pg_attrdef default_expr
    join pg_attribute column_meta
      on column_meta.attrelid = default_expr.adrelid
     and column_meta.attnum = default_expr.adnum
   where default_expr.adrelid = 'public.projects'::regclass
     and column_meta.attname = target_column;
$fn$;

select is(
  pg_temp.column_default('id'),
  'gen_random_uuid()',
  'id defaults to pg_catalog.gen_random_uuid()'
);

select is(pg_temp.column_default('created_at'), 'now()', 'created_at defaults to now()');

select is(
  pg_temp.column_default('webhook_secret'),
  'encode(extensions.gen_random_bytes(32), ''hex''::text)',
  'webhook_secret defaults to 32 pgcrypto random bytes, hex-encoded'
);

-- Primary key and foreign keys

select col_is_pk('public', 'projects', 'id', 'id is the primary key');

select fk_ok(
  'public', 'projects', 'created_by', 'auth', 'users', 'id',
  'created_by references auth.users (id)'
);

select is(
  (select confdeltype::text from pg_constraint
    where conrelid = 'public.projects'::regclass and contype = 'f'),
  'a',
  'the created_by foreign key is ON DELETE NO ACTION: nothing cascades'
);

select set_eq(
  $$ select confrelid::regclass::text from pg_constraint
      where conrelid = 'public.projects'::regclass and contype = 'f' $$,
  array['auth.users'],
  'auth.users is the only foreign key target'
);

-- CHECK constraints

select set_eq(
  $$ select conname::text from pg_constraint
      where conrelid = 'public.projects'::regclass and contype = 'c' $$,
  array['projects_name_length', 'projects_repo_owner_length',
        'projects_repo_name_length', 'projects_repo_pair'],
  'projects has exactly the four named CHECK constraints'
);

-- Uniqueness is deliberately the primary key and nothing else

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.projects'::regclass and contype = 'u'),
  0,
  'no unique constraint on the repo pair: two projects may track the same repo'
);

-- Access

select ok(
  (select relrowsecurity from pg_class where oid = 'public.projects'::regclass),
  'row level security is enabled on projects'
);

select is_empty(
  $$ select policyname::text from pg_policies
      where schemaname = 'public' and tablename = 'projects' $$,
  'projects has no RLS policies yet: grants and policies land in slice 8c320d4b'
);

-- Behaviour

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'projects-test@example.com', '', now(), now()
);

insert into public.projects (id, name, created_by) values
  ('00000000-0000-0000-0000-0000000000b1', 'Projects test',
   '00000000-0000-0000-0000-0000000000aa'),
  ('00000000-0000-0000-0000-0000000000b2', 'Projects test two',
   '00000000-0000-0000-0000-0000000000aa');

select ok(
  (select webhook_secret ~ '^[0-9a-f]{64}$'
     from public.projects where id = '00000000-0000-0000-0000-0000000000b1'),
  'webhook_secret defaults to 64 hex characters'
);

select isnt(
  (select webhook_secret from public.projects where id = '00000000-0000-0000-0000-0000000000b1'),
  (select webhook_secret from public.projects where id = '00000000-0000-0000-0000-0000000000b2'),
  'each project gets its own webhook_secret'
);

select row_eq(
  $$ select repo_owner, repo_name, archived_at from public.projects
      where id = '00000000-0000-0000-0000-0000000000b1' $$,
  row(null::text, null::text, null::timestamptz),
  'a new project starts unlinked and unarchived'
);

select throws_ok(
  $$ insert into public.projects (name, created_by)
     values ('', '00000000-0000-0000-0000-0000000000aa') $$,
  '23514',
  null,
  'an empty name is rejected'
);

select throws_ok(
  $$ insert into public.projects (name, created_by)
     values (repeat('x', 201), '00000000-0000-0000-0000-0000000000aa') $$,
  '23514',
  null,
  'a name longer than 200 characters is rejected'
);

select throws_ok(
  $$ insert into public.projects (name, repo_owner, repo_name, created_by)
     values ('Long owner', repeat('x', 201), 'AgentAssembly',
             '00000000-0000-0000-0000-0000000000aa') $$,
  '23514',
  null,
  'a repo_owner longer than 200 characters is rejected'
);

select throws_ok(
  $$ insert into public.projects (name, repo_owner, repo_name, created_by)
     values ('Long name', 'DanWilkins2107', repeat('x', 201),
             '00000000-0000-0000-0000-0000000000aa') $$,
  '23514',
  null,
  'a repo_name longer than 200 characters is rejected'
);

select throws_ok(
  $$ insert into public.projects (name, repo_owner, created_by)
     values ('Half link', 'DanWilkins2107', '00000000-0000-0000-0000-0000000000aa') $$,
  '23514',
  null,
  'a repo_owner without a repo_name is rejected'
);

select throws_ok(
  $$ insert into public.projects (name, repo_name, created_by)
     values ('Half link', 'AgentAssembly', '00000000-0000-0000-0000-0000000000aa') $$,
  '23514',
  null,
  'a repo_name without a repo_owner is rejected'
);

select throws_ok(
  $$ insert into public.projects (name, created_by)
     values ('Orphan', '00000000-0000-0000-0000-0000000000ff') $$,
  '23503',
  null,
  'created_by must reference a real auth.users row'
);

select lives_ok(
  $$ insert into public.projects (name, repo_owner, repo_name, created_by)
     values ('Both halves', 'DanWilkins2107', 'AgentAssembly',
             '00000000-0000-0000-0000-0000000000aa') $$,
  'a full repo pair is accepted'
);

select lives_ok(
  $$ insert into public.projects (name, repo_owner, repo_name, created_by)
     values ('Same repo again', 'DanWilkins2107', 'AgentAssembly',
             '00000000-0000-0000-0000-0000000000aa') $$,
  'a second project may track the same repo'
);

select * from finish();
rollback;
