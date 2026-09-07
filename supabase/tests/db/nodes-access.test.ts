import { describeAccess } from "./access.ts";

// 0008 revoked the public schema from anon and authenticated. nodes opens
// nothing yet; its own grants-and-RLS slice replaces this declaration.
describeAccess("nodes", { anon: [], authenticated: [], policies: [] });
