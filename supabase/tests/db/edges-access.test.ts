import { describeAccess } from "./access.ts";

// 0008 revoked the public schema from anon and authenticated. edges opens
// nothing yet; its own grants-and-RLS slice replaces this declaration.
describeAccess("edges", { anon: [], authenticated: [], policies: [] });
