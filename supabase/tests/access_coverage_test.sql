-- Column-access coverage: every column in an app schema must be unreadable by
-- anon, by generic authenticated, and (for authenticated-readable tables) be
-- RLS-scoped against other users -- or be listed as an exception with a reason.
-- Schema-agnostic: introspects the live catalog, so any table added later is
-- gated automatically. Run by `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(1);

-- === Exceptions registry ==================================================
-- Allowlist a (schema, table, column, tier) that is intentionally readable.
-- tier: 'anon' | 'authenticated' | 'other_user'. reason is required.
-- Add rows here as intentional exceptions arise, e.g.:
--   insert into access_exceptions values
--     ('public','assets','geo_public','anon','Asset public locations are world-readable');
create temp table access_exceptions (
  schema_name text not null,
  table_name  text not null,
  column_name text not null,
  tier        text not null check (tier in ('anon','authenticated','other_user')),
  reason      text not null check (length(trim(reason)) > 0)
);
-- (no exceptions yet)
-- ==========================================================================

create temp view access_readability as
with app_tables as (
  select c.oid as tbl, n.nspname as schema_name, c.relname as table_name,
         c.relrowsecurity as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r'
    and n.nspname not in (
      'pg_catalog','information_schema','pg_toast',
      'auth','storage','realtime','_realtime','vault',
      'pgsodium','pgsodium_masks','graphql','graphql_public',
      'extensions','supabase_functions','supabase_migrations',
      'cron','net','pgbouncer','_analytics','_supavisor'
    )
    and n.nspname not like 'pg_temp%'
    and n.nspname not like 'pg_toast_temp%'
),
cols as (
  select t.*, a.attname as column_name
  from app_tables t
  join pg_attribute a on a.attrelid = t.tbl
  where a.attnum > 0 and not a.attisdropped
)
select
  c.schema_name, c.table_name, c.column_name, c.rls,
  has_column_privilege('anon', c.tbl, c.column_name, 'SELECT')
    and (not c.rls or exists (
      select 1 from pg_policies p
      where p.schemaname = c.schema_name and p.tablename = c.table_name
        and p.permissive = 'PERMISSIVE' and p.cmd in ('SELECT','ALL')
        and ('anon' = any(p.roles) or 'public' = any(p.roles))
    )) as anon_read,
  has_column_privilege('authenticated', c.tbl, c.column_name, 'SELECT')
    and (not c.rls or exists (
      select 1 from pg_policies p
      where p.schemaname = c.schema_name and p.tablename = c.table_name
        and p.permissive = 'PERMISSIVE' and p.cmd in ('SELECT','ALL')
        and ('authenticated' = any(p.roles) or 'public' = any(p.roles))
    )) as authed_read
from cols c;

create temp view access_violations as
select schema_name, table_name, column_name, 'anon' as tier,
       'readable by anon' as detail
from access_readability r
where r.anon_read
  and not exists (
    select 1 from access_exceptions e
    where e.schema_name = r.schema_name and e.table_name = r.table_name
      and e.column_name = r.column_name and e.tier = 'anon'
  )
union all
select schema_name, table_name, column_name, 'authenticated',
       'readable by generic authenticated role'
from access_readability r
where r.authed_read
  and not exists (
    select 1 from access_exceptions e
    where e.schema_name = r.schema_name and e.table_name = r.table_name
      and e.column_name = r.column_name and e.tier = 'authenticated'
  )
union all
select schema_name, table_name, column_name, 'other_user',
       'authenticated-readable but RLS off -> other users see all rows'
from access_readability r
where r.authed_read and not r.rls
  and not exists (
    select 1 from access_exceptions e
    where e.schema_name = r.schema_name and e.table_name = r.table_name
      and e.column_name = r.column_name and e.tier = 'other_user'
  );

select is_empty(
  'select schema_name, table_name, column_name, tier, detail from access_violations order by 1,2,3,4',
  'Every column is access-protected or registered as an exception'
);

select * from finish();
rollback;
