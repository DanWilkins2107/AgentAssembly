-- Schema shape for migration 0001_enums.sql: the three workflow enums (exact
-- labels and order) and pgcrypto in the extensions schema. Run by
-- `supabase test db`.

begin;
create extension if not exists pgtap;
select plan(4);

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum where enumtypid = 'public.node_status'::regtype),
  array[
    'human_braindump_needed', 'awaiting_agent_breakdown', 'awaiting_human_response',
    'split_proposed', 'split_approved', 'broken_down', 'awaiting_agent_spec',
    'spec_review', 'ready_for_pickup', 'human_only_action', 'pr_raised',
    'pr_changes_requested', 'pr_base_moved', 'done', 'invalidated'
  ],
  'node_status labels, in order'
);

select is(
  (select array_agg(enumlabel::text order by enumsortorder)
     from pg_enum where enumtypid = 'public.edge_type'::regtype),
  array[
    'subtask', 'firm_block', 'firm_block_plan', 'reassess_after', 'relates_to'
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

-- projects.webhook_secret will default to
-- encode(extensions.gen_random_bytes(32), 'hex'), so the install schema is part
-- of the contract, not just the extension being present.
select is(
  (select namespace.nspname::text
     from pg_extension extension
     join pg_namespace namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'pgcrypto'),
  'extensions',
  'pgcrypto is installed in schema extensions'
);

select * from finish();
rollback;
