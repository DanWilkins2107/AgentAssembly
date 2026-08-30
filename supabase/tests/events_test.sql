begin;
create extension if not exists pgtap;
select plan(5);

-- Indexes

select indexes_are(
  'public', 'events',
  array['events_pkey', 'events_project_id_created_at_idx', 'events_node_id_idx'],
  'events has the primary key index and exactly two secondary indexes'
);

select has_index(
  'public', 'events', 'events_project_id_created_at_idx',
  array['project_id', 'created_at'],
  'project timeline index is on (project_id, created_at)'
);

select has_index(
  'public', 'events', 'events_node_id_idx', 'node_id',
  'per-node history index is on (node_id)'
);

create function pg_temp.index_conditions_in_plan(query text) returns text[]
language plpgsql
set enable_seqscan = off
as $fn$
declare
  query_plan jsonb;
begin
  execute 'explain (format json) ' || query into query_plan;
  return array(
    select distinct index_name #>> '{}'
      from jsonb_path_query(query_plan, '$.**?(exists(@."Index Cond"))."Index Name"') as index_name
     order by 1
  );
end;
$fn$;

select is(
  pg_temp.index_conditions_in_plan(
    $$ select id from public.events
        where project_id = '00000000-0000-0000-0000-0000000000b1'
        order by created_at desc $$
  ),
  array['events_project_id_created_at_idx'],
  'the project timeline query finds its rows through events_project_id_created_at_idx'
);

select is(
  pg_temp.index_conditions_in_plan(
    $$ select id from public.events
        where node_id = '00000000-0000-0000-0000-0000000000c1' $$
  ),
  array['events_node_id_idx'],
  'the per-node history query finds its rows through events_node_id_idx'
);

select * from finish();
rollback;
