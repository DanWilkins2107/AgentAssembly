-- Only for gen_random_bytes(), which projects.webhook_secret defaults to.
-- Kept out of public so PostgREST never exposes it.
create extension if not exists pgcrypto with schema extensions;

create type public.node_status as enum (
  'human_braindump_needed',
  'awaiting_agent_breakdown',
  'awaiting_human_response',
  'split_proposed',
  'split_approved',
  'broken_down',
  'awaiting_agent_spec',
  'spec_review',
  'ready_for_pickup',
  'human_only_action',
  'pr_raised',
  'pr_changes_requested',
  'pr_base_moved',
  'done',
  'invalidated'
);

create type public.edge_type as enum (
  'subtask',
  'firm_block',
  'firm_block_plan',
  'relates_to'
);

create type public.message_type as enum (
  'note',
  'question',
  'answer',
  'split_proposal',
  'split_decision',
  'spec_submission',
  'review_comment',
  'system'
);
