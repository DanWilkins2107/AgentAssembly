import { describeAccess } from "./access.ts";

// pg_policies renders the predicate back with its own line breaks and casts.
const IS_MEMBER = `(EXISTS ( SELECT 1
   FROM project_members m
  WHERE ((m.project_id = edges.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))`;

// SELECT and INSERT are table-level: edges holds no credential column. UPDATE
// is a column grant on removed_at alone, matching 0009's removal-only trigger.
// No DELETE -- board history is permanent and 0009 forbids it anyway.
describeAccess("edges", {
  anon: [],
  authenticated: ["INSERT", "SELECT"],
  columns: {
    authenticated: {
      UPDATE: ["removed_at"],
    },
  },
  policies: [
    {
      name: "edges_insert_member",
      command: "INSERT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: null,
      withCheck: IS_MEMBER,
    },
    {
      name: "edges_select_member",
      command: "SELECT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: IS_MEMBER,
      withCheck: null,
    },
    {
      name: "edges_update_member",
      command: "UPDATE",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: IS_MEMBER,
      withCheck: IS_MEMBER,
    },
  ],
});
