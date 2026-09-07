import { describeAccess } from "./access.ts";

// Read-only for a signed-in caller, and only their own row. Writes stay shut:
// granting membership is a project owner's privilege, and it lands in 00201051.
describeAccess("project_members", {
  anon: [],
  authenticated: ["SELECT"],
  policies: [
    {
      name: "project_members_select_self",
      command: "SELECT",
      roles: "{authenticated}",
      permissive: "PERMISSIVE",
      qual: "(user_id = ( SELECT auth.uid() AS uid))",
      withCheck: null,
    },
  ],
});
