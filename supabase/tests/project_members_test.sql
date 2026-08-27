begin;
create extension if not exists pgtap;
select plan(29);

-- Columns

select has_table('public', 'project_members', 'table public.project_members exists');

select columns_are(
  'public', 'project_members',
  array['project_id', 'user_id', 'role'],
  'project_members has exactly the three columns and no others'
);

select col_type_is('public', 'project_members', 'project_id', 'uuid', 'project_id is uuid');
select col_type_is('public', 'project_members', 'user_id',    'uuid', 'user_id is uuid');
select col_type_is('public', 'project_members', 'role',       'text', 'role is text');

-- Nullability

select col_not_null('public', 'project_members', 'project_id', 'project_id is NOT NULL');
select col_not_null('public', 'project_members', 'user_id',    'user_id is NOT NULL');
select col_not_null('public', 'project_members', 'role',       'role is NOT NULL');

-- Primary key, and the uniqueness it carries

select col_is_pk(
  'public', 'project_members', array['project_id', 'user_id'],
  '(project_id, user_id) is the primary key'
);

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.project_members'::regclass and contype = 'u'),
  0,
  'no separate unique constraint: the primary key is the one membership per user per project'
);

-- Foreign keys

select fk_ok(
  'public', 'project_members', 'project_id', 'public', 'projects', 'id',
  'project_id references public.projects (id)'
);

select fk_ok(
  'public', 'project_members', 'user_id', 'auth', 'users', 'id',
  'user_id references auth.users (id)'
);

select set_eq(
  $$ select target.relnamespace::regnamespace::text || '.' || target.relname
       from pg_constraint constraint_row
       join pg_class target on target.oid = constraint_row.confrelid
      where constraint_row.conrelid = 'public.project_members'::regclass
        and constraint_row.contype = 'f' $$,
  array['public.projects', 'auth.users'],
  'projects and auth.users are the only foreign key targets'
);

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and contype = 'f' and confdeltype <> 'a'),
  0,
  'every foreign key is ON DELETE NO ACTION: delete-vs-archive is undecided, so deletes block'
);

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.project_members'::regclass
      and contype = 'f' and confupdtype <> 'a'),
  0,
  'every foreign key is ON UPDATE NO ACTION'
);

-- CHECK constraints

select set_eq(
  $$ select conname::text from pg_constraint
      where conrelid = 'public.project_members'::regclass and contype = 'c' $$,
  array['project_members_role_allowed'],
  'project_members has exactly the one named CHECK constraint'
);

-- Access

select ok(
  (select relrowsecurity from pg_class where oid = 'public.project_members'::regclass),
  'row level security is enabled on project_members'
);

select is_empty(
  $$ select policyname::text from pg_policies
      where schemaname = 'public' and tablename = 'project_members' $$,
  'project_members has no RLS policies yet: grants and policies land in slice 8c320d4b'
);

-- Behaviour

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'members-owner@example.com', '', now(), now()),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'members-agent@example.com', '', now(), now());

insert into public.projects (id, name, created_by)
values ('00000000-0000-0000-0000-0000000000d1', 'Members test',
        '00000000-0000-0000-0000-0000000000c1');

select lives_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000c1', 'owner') $$,
  'owner is an accepted role'
);

select lives_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000c2', 'agent') $$,
  'agent is an accepted role'
);

select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000c1', 'admin') $$,
  '23514',
  null,
  'a role outside the closed set is rejected on insert'
);

select throws_ok(
  $$ update public.project_members set role = 'admin'
      where project_id = '00000000-0000-0000-0000-0000000000d1'
        and user_id = '00000000-0000-0000-0000-0000000000c1' $$,
  '23514',
  null,
  'a role outside the closed set is rejected on update'
);

select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000c1', null) $$,
  '23502',
  null,
  'a null role is rejected'
);

select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000c1', 'agent') $$,
  '23505',
  null,
  'a user cannot hold two roles on the same project'
);

select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000df',
             '00000000-0000-0000-0000-0000000000c1', 'owner') $$,
  '23503',
  null,
  'project_id must reference a real projects row'
);

select throws_ok(
  $$ insert into public.project_members (project_id, user_id, role)
     values ('00000000-0000-0000-0000-0000000000d1',
             '00000000-0000-0000-0000-0000000000cf', 'owner') $$,
  '23503',
  null,
  'user_id must reference a real auth.users row'
);

select throws_ok(
  $$ delete from public.projects
      where id = '00000000-0000-0000-0000-0000000000d1' $$,
  '23503',
  null,
  'deleting a project with members is blocked, not cascaded'
);

select throws_ok(
  $$ delete from auth.users
      where id = '00000000-0000-0000-0000-0000000000c2' $$,
  '23503',
  null,
  'deleting a member user is blocked, not cascaded'
);

select bag_eq(
  $$ select role::text from public.project_members
      where project_id = '00000000-0000-0000-0000-0000000000d1' $$,
  array['owner', 'agent'],
  'the project ends with exactly one owner row and one agent row'
);

select * from finish();
rollback;
