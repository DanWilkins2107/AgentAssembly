-- Schema shape for migration 0001_enums_core_tables.sql: enums, the six core
-- tables, their constraints and indexes, the updated_at trigger, and the
-- RLS-on-with-no-policies starting point. Run by `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(23);

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum where enumtypid = 'public.node_status'::regtype),
  array[
    'human_braindump_needed', 'awaiting_agent_breakdown', 'awaiting_human_response',
    'split_proposed', 'split_approved', 'broken_down', 'awaiting_agent_spec',
    'spec_review', 'ready_for_pickup', 'human_only_action', 'evaluating_soft_block',
    'pr_raised', 'pr_changes_requested', 'pr_base_moved', 'done', 'invalidated'
  ],
  'node_status labels, in order'
);

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum where enumtypid = 'public.edge_type'::regtype),
  array[
    'subtask', 'firm_block', 'firm_block_plan', 'soft_block', 'soft_block_plan',
    'reassess_after', 'relates_to'
  ],
  'edge_type labels, in order'
);

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum where enumtypid = 'public.message_type'::regtype),
  array[
    'note', 'question', 'answer', 'split_proposal', 'split_decision',
    'spec_submission', 'review_comment', 'system'
  ],
  'message_type labels, in order'
);

select set_eq(
  $$ select table_name::text from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' $$,
  array['projects', 'project_members', 'nodes', 'edges', 'messages', 'events'],
  'public holds exactly the six core tables'
);

-- Catalog identifiers are `name`, which collates as "C"; results_eq compares
-- them against default-collation literals, so pin every side to "default".
create temp view column_shape as
select
  table_name::text collate "default" as table_name,
  column_name::text collate "default" as column_name,
  udt_name::text collate "default" as type_name,
  is_nullable::text collate "default" as is_nullable
from information_schema.columns
where table_schema = 'public';

select results_eq(
  $$ select column_name, type_name, is_nullable from column_shape
      where table_name = 'projects' order by column_name collate "C" $$,
  $$ values ('archived_at'::text, 'timestamptz'::text, 'YES'::text),
            ('created_at', 'timestamptz', 'NO'),
            ('created_by', 'uuid', 'NO'),
            ('id', 'uuid', 'NO'),
            ('name', 'text', 'NO'),
            ('repo_name', 'text', 'YES'),
            ('repo_owner', 'text', 'YES'),
            ('webhook_secret', 'text', 'NO') $$,
  'projects columns'
);

select results_eq(
  $$ select column_name, type_name, is_nullable from column_shape
      where table_name = 'project_members' order by column_name collate "C" $$,
  $$ values ('project_id'::text, 'uuid'::text, 'NO'::text),
            ('role', 'text', 'NO'),
            ('user_id', 'uuid', 'NO') $$,
  'project_members columns'
);

select results_eq(
  $$ select column_name, type_name, is_nullable from column_shape
      where table_name = 'nodes' order by column_name collate "C" $$,
  $$ values ('body'::text, 'text'::text, 'NO'::text),
            ('breakdown_on_merge', 'bool', 'NO'),
            ('canvas_png_path', 'text', 'YES'),
            ('claimed_at', 'timestamptz', 'YES'),
            ('claimed_by', 'text', 'YES'),
            ('created_at', 'timestamptz', 'NO'),
            ('created_by', 'uuid', 'NO'),
            ('fts', 'tsvector', 'YES'),
            ('id', 'uuid', 'NO'),
            ('invalidation_reason', 'text', 'YES'),
            ('is_vision', 'bool', 'NO'),
            ('merge_sha', 'text', 'YES'),
            ('pr_number', 'int4', 'YES'),
            ('pr_url', 'text', 'YES'),
            ('project_id', 'uuid', 'NO'),
            ('spec', 'text', 'YES'),
            ('status', 'node_status', 'NO'),
            ('title', 'text', 'NO'),
            ('tldraw_doc', 'jsonb', 'YES'),
            ('updated_at', 'timestamptz', 'NO') $$,
  'nodes columns, with no stored stale column'
);

select results_eq(
  $$ select column_name, type_name, is_nullable from column_shape
      where table_name = 'edges' order by column_name collate "C" $$,
  $$ values ('created_at'::text, 'timestamptz'::text, 'NO'::text),
            ('created_by', 'uuid', 'NO'),
            ('id', 'uuid', 'NO'),
            ('project_id', 'uuid', 'NO'),
            ('removed_at', 'timestamptz', 'YES'),
            ('source_id', 'uuid', 'NO'),
            ('target_id', 'uuid', 'NO'),
            ('type', 'edge_type', 'NO') $$,
  'edges columns'
);

select results_eq(
  $$ select column_name, type_name, is_nullable from column_shape
      where table_name = 'messages' order by column_name collate "C" $$,
  $$ values ('author_id'::text, 'uuid'::text, 'YES'::text),
            ('author_role', 'text', 'NO'),
            ('body', 'text', 'NO'),
            ('created_at', 'timestamptz', 'NO'),
            ('fts', 'tsvector', 'YES'),
            ('id', 'uuid', 'NO'),
            ('node_id', 'uuid', 'NO'),
            ('project_id', 'uuid', 'NO'),
            ('stage', 'node_status', 'NO'),
            ('type', 'message_type', 'NO') $$,
  'messages columns'
);

select results_eq(
  $$ select column_name, type_name, is_nullable from column_shape
      where table_name = 'events' order by column_name collate "C" $$,
  $$ values ('actor_id'::text, 'uuid'::text, 'YES'::text),
            ('actor_role', 'text', 'NO'),
            ('created_at', 'timestamptz', 'NO'),
            ('data', 'jsonb', 'NO'),
            ('id', 'int8', 'NO'),
            ('node_id', 'uuid', 'YES'),
            ('project_id', 'uuid', 'NO'),
            ('type', 'text', 'NO') $$,
  'events columns'
);

create temp view constraint_shape as
select
  class.relname::text collate "default" as table_name,
  con.contype::text collate "default" as kind,
  con.conname::text collate "default" as constraint_name,
  con.confdeltype::text collate "default" as delete_action,
  coalesce(referenced_ns.nspname || '.' || referenced.relname, '')::text
    collate "default" as references_table,
  coalesce(constrained.columns, '')::text collate "default" as columns
from pg_constraint con
join pg_class class on class.oid = con.conrelid
left join pg_class referenced on referenced.oid = con.confrelid
left join pg_namespace referenced_ns on referenced_ns.oid = referenced.relnamespace
left join lateral (
  select string_agg(attribute.attname, ',' order by key.ordinality) as columns
  from unnest(con.conkey) with ordinality as key(attnum, ordinality)
  join pg_attribute attribute
    on attribute.attrelid = con.conrelid and attribute.attnum = key.attnum
) as constrained on true
where class.relnamespace = 'public'::regnamespace;

select results_eq(
  $$ select table_name, columns from constraint_shape
      where kind = 'p' order by table_name collate "C" $$,
  $$ values ('edges'::text, 'id'::text),
            ('events', 'id'),
            ('messages', 'id'),
            ('nodes', 'id'),
            ('project_members', 'project_id,user_id'),
            ('projects', 'id') $$,
  'primary keys'
);

select results_eq(
  $$ select table_name, columns, references_table from constraint_shape
      where kind = 'f' order by table_name collate "C", columns collate "C" $$,
  $$ values ('edges'::text, 'created_by'::text, 'auth.users'::text),
            ('edges', 'project_id', 'public.projects'),
            ('edges', 'source_id', 'public.nodes'),
            ('edges', 'target_id', 'public.nodes'),
            ('messages', 'author_id', 'auth.users'),
            ('messages', 'node_id', 'public.nodes'),
            ('messages', 'project_id', 'public.projects'),
            ('nodes', 'created_by', 'auth.users'),
            ('nodes', 'project_id', 'public.projects'),
            ('project_members', 'project_id', 'public.projects'),
            ('project_members', 'user_id', 'auth.users'),
            ('projects', 'created_by', 'auth.users') $$,
  'foreign keys; events deliberately has none'
);

select is_empty(
  $$ select constraint_name from constraint_shape
      where kind = 'f' and delete_action <> 'a' $$,
  'no foreign key has an ON DELETE action'
);

select set_eq(
  $$ select constraint_name from constraint_shape where kind = 'c' $$,
  array[
    'projects_name_length', 'projects_repo_owner_length', 'projects_repo_name_length',
    'project_members_role_allowed',
    'nodes_title_length', 'nodes_pr_url_length', 'nodes_pr_number_positive',
    'nodes_merge_sha_length', 'nodes_claimed_by_length', 'nodes_canvas_png_path_length',
    'edges_no_self_loop',
    'messages_author_role_allowed',
    'events_actor_role_allowed', 'events_type_length'
  ],
  'check constraints'
);

select set_eq(
  $$ select indexname::text from pg_indexes
      where schemaname = 'public' and indexname not like '%_pkey' $$,
  array[
    'nodes_project_id_status_idx', 'nodes_fts_idx',
    'edges_project_id_idx', 'edges_source_id_idx', 'edges_target_id_idx',
    'messages_node_id_idx', 'messages_project_id_idx', 'messages_fts_idx',
    'events_project_id_created_at_idx', 'events_node_id_idx'
  ],
  'the ten non-primary-key indexes'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values (
  '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'core-schema-test@example.com', '', now(), now()
);

insert into public.projects (id, name, created_by)
values (
  '00000000-0000-0000-0000-0000000000b1', 'Core schema test',
  '00000000-0000-0000-0000-0000000000aa'
);

select ok(
  (select webhook_secret ~ '^[0-9a-f]{64}$' and archived_at is null and repo_owner is null
     from public.projects where id = '00000000-0000-0000-0000-0000000000b1'),
  'projects defaults a 32-byte hex webhook_secret and stays unarchived/unlinked'
);

insert into public.nodes (id, project_id, title, created_by)
values (
  '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1',
  'Test node', '00000000-0000-0000-0000-0000000000aa'
);

select row_eq(
  $$ select body, status::text, is_vision, breakdown_on_merge from public.nodes
      where id = '00000000-0000-0000-0000-0000000000b2' $$,
  row(''::text, 'human_braindump_needed'::text, false, false),
  'nodes defaults'
);

select ok(
  (select fts @@ to_tsquery('english', 'node') from public.nodes
     where id = '00000000-0000-0000-0000-0000000000b2'),
  'nodes.fts is generated from the title'
);

insert into public.messages (node_id, project_id, stage, author_role, type, body)
values (
  '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1',
  'ready_for_pickup', 'system', 'system', 'Indexed message body'
);

select ok(
  (select fts @@ to_tsquery('english', 'indexed') from public.messages
     where node_id = '00000000-0000-0000-0000-0000000000b2'),
  'messages.fts is generated from the body'
);

insert into public.events (project_id, actor_role, type)
values ('00000000-0000-0000-0000-0000000000b1', 'system', 'schema_test');

select row_eq(
  $$ select data, id > 0 from public.events where type = 'schema_test' $$,
  row('{}'::jsonb, true),
  'events defaults an empty data object and an identity id'
);

update public.nodes
set title = 'Renamed node', updated_at = timestamptz '2000-01-01'
where id = '00000000-0000-0000-0000-0000000000b2';

select ok(
  (select updated_at > timestamptz '2020-01-01' from public.nodes
     where id = '00000000-0000-0000-0000-0000000000b2'),
  'set_updated_at overwrites nodes.updated_at on UPDATE'
);

select is_empty(
  $$ select relname::text from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r'
        and not relrowsecurity $$,
  'row level security is enabled on every core table'
);

select is_empty(
  $$ select policyname::text from pg_policies where schemaname = 'public' $$,
  'no policies yet: grants and policies land in a later slice'
);

select * from finish();
rollback;
