-- Schema shape for migration 0007_events.sql: the audit table's columns, its
-- identity primary key, the deliberate absence of foreign keys, both CHECKs,
-- both indexes, and the RLS-on-with-no-policies starting point. Scoped to
-- `events` only so sibling table slices stay independent of this file. Run by
-- `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(11);

-- Catalog identifiers are `name`, which collates as "C"; results_eq compares
-- them against default-collation literals, so pin every side to "default".
select results_eq(
  $$ select column_name::text collate "default",
            udt_name::text collate "default",
            is_nullable::text collate "default",
            coalesce(column_default, '')::text collate "default"
       from information_schema.columns
      where table_schema = 'public' and table_name = 'events'
      order by column_name collate "C" $$,
  $$ values ('actor_id'::text, 'uuid'::text, 'YES'::text, ''::text),
            ('actor_role', 'text', 'NO', ''),
            ('created_at', 'timestamptz', 'NO', 'now()'),
            ('data', 'jsonb', 'NO', '''{}''::jsonb'),
            ('id', 'int8', 'NO', ''),
            ('node_id', 'uuid', 'YES', ''),
            ('project_id', 'uuid', 'NO', ''),
            ('type', 'text', 'NO', '') $$,
  'events columns, types, nullability and defaults'
);

select is(
  (select attidentity::text from pg_attribute
    where attrelid = 'public.events'::regclass and attname = 'id'),
  'a',
  'events.id is GENERATED ALWAYS AS IDENTITY'
);

select is(
  (select string_agg(attribute.attname, ',' order by key.ordinality)
     from pg_constraint con
     cross join lateral unnest(con.conkey) with ordinality as key(attnum, ordinality)
     join pg_attribute attribute
       on attribute.attrelid = con.conrelid and attribute.attnum = key.attnum
    where con.conrelid = 'public.events'::regclass and con.contype = 'p'),
  'id',
  'primary key is (id)'
);

-- An audit record must never be gated by another table's rows, so project_id,
-- node_id and actor_id are plain uuid by design.
select is_empty(
  $$ select conname::text from pg_constraint
      where conrelid = 'public.events'::regclass and contype = 'f' $$,
  'events deliberately has no foreign keys'
);

select set_eq(
  $$ select conname::text from pg_constraint
      where conrelid = 'public.events'::regclass and contype = 'c' $$,
  array['events_actor_role_allowed', 'events_type_length'],
  'check constraints'
);

select throws_ok(
  $$ insert into public.events (project_id, actor_role, type)
     values ('00000000-0000-0000-0000-0000000000b1', 'robot', 'check_test') $$,
  '23514',
  null,
  'actor_role outside (human, agent, system) is rejected'
);

select throws_ok(
  $$ insert into public.events (project_id, actor_role, type)
     values ('00000000-0000-0000-0000-0000000000b1', 'system', repeat('x', 101)) $$,
  '23514',
  null,
  'type longer than 100 characters is rejected'
);

select set_eq(
  $$ select indexname::text from pg_indexes
      where schemaname = 'public' and tablename = 'events'
        and indexname not like '%_pkey' $$,
  array['events_project_id_created_at_idx', 'events_node_id_idx'],
  'the two non-primary-key indexes'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'row level security is enabled'
);

select is_empty(
  $$ select policyname::text from pg_policies
      where schemaname = 'public' and tablename = 'events' $$,
  'no policies yet: grants and policies land in slice 8c320d4b'
);

insert into public.events (project_id, actor_role, type)
values ('00000000-0000-0000-0000-0000000000b1', 'system', 'schema_test');

select row_eq(
  $$ select data, id > 0 from public.events where type = 'schema_test' $$,
  row('{}'::jsonb, true),
  'events defaults an empty data object and an identity id'
);

select * from finish();
rollback;
