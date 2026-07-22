# Identity model

The authorization contract for AgentAssembly. Everything that reads or writes
project data — RLS policies, RPCs, edge functions, the CLI, the web app —
resolves permission the same way, described here.

This document is a decision, not an implementation. The schema and the RLS
policies that enforce it are built by the backend rebuild; the auth settings it
depends on live in `supabase/config.toml`.

## Who a caller is

Identity comes from Supabase Auth and nowhere else. A request carries a JWT
issued by GoTrue; inside Postgres it reduces to a single value:

| `auth.uid()` | Caller |
|---|---|
| a `uuid` | An authenticated user — the `auth.users.id` the JWT was issued for |
| `null` | No authenticated user: the `system` actor |

There is no second source of identity. No API key, header, or client-supplied
user id ever establishes who the caller is. A client can always lie about its
payload; it cannot lie about `auth.uid()`, so `auth.uid()` is the only input
authorization is allowed to trust.

`auth.uid()` is `null` for the service role key, for seeds, for migrations, and
for anything running outside a user session. That is the `system` actor: it
bypasses RLS by construction, so it must only ever be used server-side, never
handed to a client.

### Accounts are provisioned, not self-served

Public signup is off (`enable_signup = false` in both `[auth]` and
`[auth.email]`), anonymous sign-ins are off, and there is no external OAuth
provider. An `auth.users` row exists only because an operator created it in the
Supabase dashboard. Consequences worth stating explicitly:

- Membership is never granted by the act of signing up, because signing up is
  not a thing a stranger can do.
- Email confirmation is off (`enable_confirmations = false`): there is no
  unverified address to prove ownership of, since the operator set it.
- Knowing a valid email address gets an attacker nothing. Only credentials do.

## What a caller may do

`auth.uid()` says *who*; it says nothing about *what*. Authorization is derived
entirely from membership:

```
project_members (project_id, user_id, role)
  primary key (project_id, user_id)
  role in ('owner', 'agent')
```

A **project is the tenant**. Every piece of domain data belongs to exactly one
project, and access to it is decided by asking a single question: does a row in
`project_members` exist for this `project_id` and `auth.uid()`?

- **No row ⇒ no access.** Not read, not write, not existence. A non-member must
  not be able to tell a project apart from one that was never created.
- **A row ⇒ access at that row's `role`.** Membership is per project; the same
  user can be an `owner` of one project and hold nothing in another. There is
  no global admin and no cross-project role.

The primary key `(project_id, user_id)` means a user holds exactly one role per
project — roles do not stack, and "which role am I" is always a single lookup
with no precedence rules to get wrong.

### Roles

| Role | Holder | Grants |
|---|---|---|
| `owner` | A human | Everything `agent` can do, plus administering the project itself: managing membership and project-level settings |
| `agent` | An automated worker acting under its own Supabase user | Read and write the project's domain data |

Both roles are full participants in the project's data. The distinction is
administrative authority, not data access: an `agent` does the work, an `owner`
decides who is allowed in and how the project is configured. An `agent` must
never be able to add a member — that is the boundary that keeps a compromised
agent from widening its own blast radius.

Agents authenticate as ordinary Supabase users with their own credentials, one
identity per agent. They are not impersonating a human and they do not share the
human's session, so audit trails attribute actions to the actor that performed
them.

## Resolution, end to end

1. The caller presents a JWT; GoTrue validates it; Postgres exposes the subject
   as `auth.uid()`.
2. The target row identifies its project (`project_id`).
3. Membership lookup: `project_members` for `(project_id, auth.uid())`.
4. No row ⇒ deny. Row ⇒ allow if the operation is within that role's grants.
5. `auth.uid() is null` ⇒ the `system` actor; server-side only.

For event logging the same lookup names the actor: `agent` if the membership
row says so, `human` if it says `owner`, `system` if there is no authenticated
user.

## Non-goals

- **No RLS policies, triggers, or RPCs here.** This document fixes the contract
  they implement; the backend rebuild writes them, and the auth policy test
  suite proves them.
- **No org/team layer above projects, and no roles beyond `owner` and `agent`.**
  If either is ever needed, it is a deliberate change to this contract, not
  something a policy quietly introduces.
