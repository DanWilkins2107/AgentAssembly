import { describeAccess } from "./access.ts";

// pg_policies renders the predicate back with its own line breaks and casts.
const IS_MEMBER = `(EXISTS ( SELECT 1
   FROM project_members m
  WHERE ((m.project_id = nodes.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid)))))`;

// Table-level grants, not column ones: nodes holds no credential column to
// withhold. No DELETE -- board history is permanent and 0009 forbids it anyway.
describeAccess("nodes", {
  anon: [],
  authenticated: ["INSERT", "SELECT", "UPDATE"],
  policies: [
    {
      name: "nodes_insert_member",
      command: "INSERT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: null,
      withCheck: IS_MEMBER,
    },
    {
      name: "nodes_select_member",
      command: "SELECT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: IS_MEMBER,
      withCheck: null,
    },
    {
      name: "nodes_update_member",
      command: "UPDATE",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: IS_MEMBER,
      withCheck: IS_MEMBER,
    },
  ],
});
