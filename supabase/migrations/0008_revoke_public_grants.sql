-- Supabase's stock setup grants ALL on every public table to anon and
-- authenticated, so a table with RLS and no policies answers an empty 200
-- rather than refusing. Shut the door at the grant level; slice 8c320d4b opens
-- back exactly what each role needs.
revoke all on all tables in schema public from anon, authenticated;

-- Tables added by later migrations inherit the revoked default, so a new table
-- is closed without an edit here.
alter default privileges in schema public revoke all on tables from anon, authenticated;
