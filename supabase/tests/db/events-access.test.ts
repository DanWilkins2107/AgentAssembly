import { describeAccess } from "./access.ts";

// pg_policies renders the predicate back with its own line breaks and casts.
const IS_MEMBER = `EXISTS ( SELECT 1
   FROM project_members m
  WHERE ((m.project_id = events.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))`;

// SELECT only, and table-level: events hold no credential column, and the audit
// trail is written server-side under service_role, which bypasses RLS. No
// INSERT, so a member cannot forge history; no UPDATE or DELETE -- 0009 already
// forbids both with triggers, so a grant would buy a raised exception in place
// of a permission denial.
describeAccess("events", {
  anon: [],
  authenticated: ["SELECT"],
  policies: [
    {
      name: "events_select_member",
      command: "SELECT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: `(${IS_MEMBER})`,
      withCheck: null,
    },
  ],
});
