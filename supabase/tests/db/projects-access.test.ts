import { describeAccess } from "./access.ts";

// 0008 revoked the public schema from anon and authenticated. projects opens
// nothing yet; its own grants-and-RLS slice replaces this declaration.
describeAccess("projects", { anon: [], authenticated: [], policies: [] });
