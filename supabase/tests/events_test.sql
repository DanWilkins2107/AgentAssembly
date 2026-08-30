begin;
create extension if not exists pgtap;
select plan(29);

-- Columns

select has_table('public', 'events', 'table public.events exists');

select columns_are(
  'public', 'events',
  array['id', 'project_id', 'node_id', 'actor_id',
        'actor_role', 'type', 'data', 'created_at'],
  'events has exactly the eight audit columns and no others'
);

select col_type_is('public', 'events', 'id',         'bigint',                   'id is bigint');
select col_type_is('public', 'events', 'project_id', 'uuid',                     'project_id is uuid');
select col_type_is('public', 'events', 'node_id',    'uuid',                     'node_id is uuid');
select col_type_is('public', 'events', 'actor_id',   'uuid',                     'actor_id is uuid');
select col_type_is('public', 'events', 'actor_role', 'text',                     'actor_role is text');
select col_type_is('public', 'events', 'type',       'text',                     'type is text');
select col_type_is('public', 'events', 'data',       'jsonb',                    'data is jsonb');
select col_type_is('public', 'events', 'created_at', 'timestamp with time zone', 'created_at is timestamptz');

-- Nullability

select col_not_null('public', 'events', 'id',         'id is NOT NULL');
select col_not_null('public', 'events', 'project_id', 'project_id is NOT NULL');
select col_not_null('public', 'events', 'actor_role', 'actor_role is NOT NULL');
select col_not_null('public', 'events', 'type',       'type is NOT NULL');
select col_not_null('public', 'events', 'data',       'data is NOT NULL');
select col_not_null('public', 'events', 'created_at', 'created_at is NOT NULL');

select col_is_null('public', 'events', 'node_id',  'node_id is nullable: not every event has a subject node');
select col_is_null('public', 'events', 'actor_id', 'actor_id is nullable: system events have no acting user');

-- Defaults

select is(
  (select pg_get_expr(default_expr.adbin, default_expr.adrelid)
     from pg_attrdef default_expr
     join pg_attribute column_meta
       on column_meta.attrelid = default_expr.adrelid
      and column_meta.attnum = default_expr.adnum
    where default_expr.adrelid = 'public.events'::regclass
      and column_meta.attname = 'data'),
  '''{}''::jsonb',
  'data defaults to an empty jsonb object'
);

select is(
  (select pg_get_expr(default_expr.adbin, default_expr.adrelid)
     from pg_attrdef default_expr
     join pg_attribute column_meta
       on column_meta.attrelid = default_expr.adrelid
      and column_meta.attnum = default_expr.adnum
    where default_expr.adrelid = 'public.events'::regclass
      and column_meta.attname = 'created_at'),
  'now()',
  'created_at defaults to now()'
);

-- Primary key

select col_is_pk('public', 'events', 'id', 'id is the primary key');

select is(
  (select column_meta.attidentity::text
     from pg_attribute column_meta
    where column_meta.attrelid = 'public.events'::regclass
      and column_meta.attname = 'id'),
  'a',
  'id is GENERATED ALWAYS AS IDENTITY'
);

-- Foreign keys

select hasnt_fk('public', 'events', 'events deliberately has no foreign keys');

-- CHECK constraints

select set_eq(
  $$ select conname::text from pg_constraint
      where conrelid = 'public.events'::regclass and contype = 'c' $$,
  array['events_actor_role_allowed', 'events_type_length'],
  'events has exactly the two named CHECK constraints'
);

select throws_ok(
  $$ insert into public.events (project_id, actor_role, type)
     values ('00000000-0000-0000-0000-0000000000b1', 'robot', 'check_test') $$,
  '23514',
  null,
  'inserting actor_role outside (human, agent, system) is rejected'
);

select throws_ok(
  $$ insert into public.events (project_id, actor_role, type)
     values ('00000000-0000-0000-0000-0000000000b1', 'system', repeat('x', 101)) $$,
  '23514',
  null,
  'inserting a type longer than 100 characters is rejected'
);

-- Access

select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'row level security is enabled on events'
);

select is_empty(
  $$ select policyname::text from pg_policies
      where schemaname = 'public' and tablename = 'events' $$,
  'events has no RLS policies yet: grants and policies land in slice 8c320d4b'
);

-- Minimal insert

insert into public.events (project_id, actor_role, type)
values ('00000000-0000-0000-0000-0000000000b1', 'system', 'minimal_insert_test');

select row_eq(
  $$ select data, id > 0 from public.events where type = 'minimal_insert_test' $$,
  row('{}'::jsonb, true),
  'a minimal insert gets an empty data object and a positive identity id'
);

select * from finish();
rollback;
