-- Column-access coverage: every column in an app schema must be unreadable by
-- anon, by generic authenticated, and (for authenticated-readable tables) be
-- RLS-scoped against other users -- or be listed as an exception with a reason.
-- Schema-agnostic: introspects the live catalog, so any table added later is
-- gated automatically. Run by `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(1);

-- Allowlist a (schema, table, column, tier) that is intentionally readable.
-- tier: 'anon' | 'authenticated' | 'other_user'. reason is required.
-- Add rows below as intentional exceptions arise, e.g.:
--   insert into access_exceptions values
--     ('public','assets','geo_public','anon','Asset locations are world-readable');
create temp table access_exceptions (
  schema_name text not null,
  table_name  text not null,
  column_name text not null,
  tier        text not null check (tier in ('anon','authenticated','other_user')),
  reason      text not null check (length(trim(reason)) > 0)
);

-- A role can read a column when it holds the column SELECT grant AND (if RLS is
-- on) some permissive SELECT policy admits that role. Same rule for every role.
create function pg_temp.role_can_read(
  role text, tbl oid, sch text, tab text, rls boolean, col text
) returns boolean language sql stable as $$
  select has_column_privilege(role, tbl, col, 'SELECT')
    and (not rls or exists (
      select 1 from pg_policies p
      where p.schemaname = sch and p.tablename = tab
        and p.permissive = 'PERMISSIVE' and p.cmd in ('SELECT','ALL')
        and (role = any(p.roles) or 'public' = any(p.roles))
    ));
$$;

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
  pg_temp.role_can_read('anon', c.tbl, c.schema_name, c.table_name, c.rls, c.column_name) as anon_read,
  pg_temp.role_can_read('authenticated', c.tbl, c.schema_name, c.table_name, c.rls, c.column_name) as authed_read
from cols c;

-- Unpivot the three tiers, drop any that are allowlisted. What remains is a
-- column readable by someone it shouldn't be -- a coverage failure.
create temp view access_violations as
select r.schema_name, r.table_name, r.column_name, v.tier, v.detail
from access_readability r
cross join lateral (values
  ('anon',          r.anon_read,                 'readable by anon'),
  ('authenticated', r.authed_read,               'readable by generic authenticated role'),
  ('other_user',    r.authed_read and not r.rls, 'authenticated-readable but RLS off -> other users see all rows')
) as v(tier, violated, detail)
where v.violated
  and not exists (
    select 1 from access_exceptions e
    where e.schema_name = r.schema_name and e.table_name = r.table_name
      and e.column_name = r.column_name and e.tier = v.tier
  );

select is_empty(
  'select schema_name, table_name, column_name, tier, detail from access_violations order by 1,2,3,4',
  'Every column is access-protected or registered as an exception'
);

select * from finish();
rollback;
