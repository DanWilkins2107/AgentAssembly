-- Column-access coverage: every column in an app schema must be unreadable by
-- anon, by generic authenticated, and (for authenticated-readable tables) be
-- RLS-scoped against other users -- or be listed as an exception with a reason.
-- Schema-agnostic: introspects the live catalog, so any table added later is
-- gated automatically. Run by `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(1);

-- Allowlist of (schema, table, column, tier) columns that are intentionally
-- readable. tier is 'anon' | 'authenticated' | 'other_user'; reason is required.
create temp table access_exceptions (
  schema_name text not null,
  table_name  text not null,
  column_name text not null,
  tier        text not null check (tier in ('anon','authenticated','other_user')),
  reason      text not null check (length(trim(reason)) > 0)
);

-- === Add intentional exceptions here ===
-- One insert per exception. Every column is named, so a row reads as a sentence.
-- Example (delete once you add a real one):
--   insert into access_exceptions (schema_name, table_name, column_name, tier, reason)
--   values ('public', 'assets', 'geo_public', 'anon', 'Asset locations are world-readable');

-- A role can read a column when it holds the column SELECT grant AND (if RLS is
-- on) some permissive SELECT policy admits that role. Same rule for every role.
create function pg_temp.role_can_read(
  role_name    text,
  table_oid    oid,
  schema_name  text,
  table_name   text,
  rls_enabled  boolean,
  column_name  text
) returns boolean language sql stable as $$
  select has_column_privilege(role_name, table_oid, column_name, 'SELECT')
    and (not rls_enabled or exists (
      select 1 from pg_policies policy
      where policy.schemaname = schema_name and policy.tablename = table_name
        and policy.permissive = 'PERMISSIVE' and policy.cmd in ('SELECT','ALL')
        and (role_name = any(policy.roles) or 'public' = any(policy.roles))
    ));
$$;

create temp view access_readability as
with app_tables as (
  select
    class.oid          as table_oid,
    namespace.nspname  as schema_name,
    class.relname      as table_name,
    class.relrowsecurity as rls_enabled
  from pg_class class
  join pg_namespace namespace on namespace.oid = class.relnamespace
  where class.relkind = 'r'
    and namespace.nspname not in (
      'pg_catalog','information_schema','pg_toast',
      'auth','storage','realtime','_realtime','vault',
      'pgsodium','pgsodium_masks','graphql','graphql_public',
      'extensions','supabase_functions','supabase_migrations',
      'cron','net','pgbouncer','_analytics','_supavisor'
    )
    and namespace.nspname not like 'pg_temp%'
    and namespace.nspname not like 'pg_toast_temp%'
),
app_columns as (
  select app_tables.*, attribute.attname as column_name
  from app_tables
  join pg_attribute attribute on attribute.attrelid = app_tables.table_oid
  where attribute.attnum > 0 and not attribute.attisdropped
)
select
  app_columns.schema_name,
  app_columns.table_name,
  app_columns.column_name,
  app_columns.rls_enabled,
  pg_temp.role_can_read(
    'anon', app_columns.table_oid, app_columns.schema_name,
    app_columns.table_name, app_columns.rls_enabled, app_columns.column_name
  ) as anon_can_read,
  pg_temp.role_can_read(
    'authenticated', app_columns.table_oid, app_columns.schema_name,
    app_columns.table_name, app_columns.rls_enabled, app_columns.column_name
  ) as authenticated_can_read
from app_columns;

-- Unpivot the three tiers, drop any that are allowlisted. What remains is a
-- column readable by someone it shouldn't be -- a coverage failure.
create temp view access_violations as
select
  readability.schema_name,
  readability.table_name,
  readability.column_name,
  tier_check.tier,
  tier_check.detail
from access_readability readability
cross join lateral (values
  ('anon',          readability.anon_can_read,          'readable by anon'),
  ('authenticated', readability.authenticated_can_read, 'readable by generic authenticated role'),
  ('other_user',    readability.authenticated_can_read and not readability.rls_enabled,
                    'authenticated-readable but RLS off -> other users see all rows')
) as tier_check(tier, is_violated, detail)
where tier_check.is_violated
  and not exists (
    select 1 from access_exceptions allow_entry
    where allow_entry.schema_name = readability.schema_name
      and allow_entry.table_name  = readability.table_name
      and allow_entry.column_name = readability.column_name
      and allow_entry.tier        = tier_check.tier
  );

select is_empty(
  'select schema_name, table_name, column_name, tier, detail from access_violations order by 1,2,3,4',
  'Every column is access-protected or registered as an exception'
);

select * from finish();
rollback;
