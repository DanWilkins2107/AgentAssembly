import { describeAccess } from "./access.ts";

// pg_policies renders the predicate back with its own line breaks and casts.
const IS_MEMBER = `EXISTS ( SELECT 1
   FROM project_members m
  WHERE ((m.project_id = messages.project_id) AND (m.user_id = ( SELECT auth.uid() AS uid))))`;
const IS_AUTHOR = `author_id = ( SELECT auth.uid() AS uid)`;

// SELECT and INSERT are table-level: messages holds no credential column. No
// UPDATE or DELETE -- 0009 already forbids both with triggers, so a grant would
// buy a raised exception in place of a permission denial.
describeAccess("messages", {
  anon: [],
  authenticated: ["INSERT", "SELECT"],
  policies: [
    {
      name: "messages_insert_member",
      command: "INSERT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: null,
      withCheck: `((${IS_AUTHOR}) AND (${IS_MEMBER}))`,
    },
    {
      name: "messages_select_member",
      command: "SELECT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: `(${IS_MEMBER})`,
      withCheck: null,
    },
  ],
});
