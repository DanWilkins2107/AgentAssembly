import { describeAccess } from "./access.ts";

// pg_policies renders the predicate back with its own line breaks and casts.
const exists = (predicate: string) =>
  `(EXISTS ( SELECT 1\n   FROM project_members m\n  WHERE ${predicate}))`;
const IS_MEMBER = `((m.project_id = projects.id) AND (m.user_id = ( SELECT auth.uid() AS uid)))`;
const IS_OWNER = `((m.project_id = projects.id) AND (m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = 'owner'::text))`;

// No table-level grants at all: SELECT withholds webhook_secret and UPDATE
// withholds id/created_by/created_at, so both are column grants. No INSERT --
// bootstrap_project (2e6806f8) creates projects -- and no DELETE, since
// archiving is an archived_at write.
describeAccess("projects", {
  anon: [],
  authenticated: [],
  columns: {
    authenticated: {
      SELECT: ["archived_at", "created_at", "created_by", "id", "name", "repo_name", "repo_owner"],
      UPDATE: ["archived_at", "name", "repo_name", "repo_owner"],
    },
  },
  policies: [
    {
      name: "projects_select_member",
      command: "SELECT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: exists(IS_MEMBER),
      withCheck: null,
    },
    {
      name: "projects_update_owner",
      command: "UPDATE",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: exists(IS_OWNER),
      withCheck: exists(IS_OWNER),
    },
  ],
});
