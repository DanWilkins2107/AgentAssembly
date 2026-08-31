import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";

const userId = "00000000-0000-0000-0000-0000000000a1";
const projectId = "00000000-0000-0000-0000-0000000000b1";
const stamp = "2020-01-01T00:00:00Z";

async function seed(sql: Client): Promise<void> {
  await sql.query(
    `insert into auth.users (id, instance_id, aud, role, email,
                             encrypted_password, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated',
             'authenticated', 'nodes-triggers-test@example.com', '', now(), now())`,
    [userId],
  );
  await sql.query(
    `insert into public.projects (id, name, created_by) values ($1, 'Nodes trigger test', $2)`,
    [projectId, userId],
  );
}

describe("nodes defaults", () => {
  it("a minimal node starts unclaimed, unlinked and not a vision", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      const { rows } = await sql.query(
        `insert into public.nodes (project_id, title, status, created_by)
         values ($1, 'Minimal node', 'human_braindump_needed', $2)
         returning body, is_vision, spec, invalidation_reason,
                   pr_number, claimed_by, claimed_at`,
        [projectId, userId],
      );
      expect(rows[0]).toEqual({
        body: "",
        is_vision: false,
        spec: null,
        invalidation_reason: null,
        pr_number: null,
        claimed_by: null,
        claimed_at: null,
      });
    });
  });
});

describe("nodes full-text search", () => {
  it("fts covers title, body, spec and invalidation_reason, and nothing else", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      const { rows } = await sql.query<{ covered: boolean; leaks: boolean }>(
        `insert into public.nodes (project_id, title, body, spec, invalidation_reason,
                                   status, created_by, claimed_by, claimed_at)
         values ($1, 'Alpha', 'Bravo', 'Charlie', 'Delta', 'invalidated', $2, 'Echo', now())
         returning fts @@ to_tsquery('english', 'alpha & bravo & charlie & delta') as covered,
                   fts @@ to_tsquery('english', 'echo') as leaks`,
        [projectId, userId],
      );
      expect(rows[0]).toEqual({ covered: true, leaks: false });
    });
  });
});

describe("nodes updated_at trigger", () => {
  it("keeps an explicit updated_at on insert, then bumps it on update", async () => {
    await withRollback(async (sql) => {
      await seed(sql);
      const { rows: inserted } = await sql.query<{ id: string; kept: boolean }>(
        `insert into public.nodes (project_id, title, status, created_by,
                                   created_at, updated_at)
         values ($1, 'Stamped node', 'human_braindump_needed', $2, $3, $3)
         returning id, updated_at = $3::timestamptz as kept`,
        [projectId, userId, stamp],
      );
      expect(inserted[0]?.kept).toBe(true);

      const { rows: updated } = await sql.query<{ bumped: boolean; createdAtKept: boolean }>(
        `update public.nodes set title = 'Stamped node, edited' where id = $1
         returning updated_at = now() as bumped,
                   created_at = $2::timestamptz as "createdAtKept"`,
        [inserted[0]?.id, stamp],
      );
      expect(updated[0]).toEqual({ bumped: true, createdAtKept: true });
    });
  });

  // The exact stored form of an empty search_path is a Postgres detail; what is
  // pinned is that the function sets one rather than inheriting the caller's.
  it("set_updated_at pins its own search_path", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ config: string[] | null }>(
        `select proconfig as config from pg_proc where oid = 'public.set_updated_at'::regproc`,
      );
      expect(rows[0]?.config?.[0]).toMatch(/^search_path=/);
    });
  });
});

describe("nodes access", () => {
  it("has row level security on and no policies yet: those land in slice 8c320d4b", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ enabled: boolean; policies: number }>(
        `select relrowsecurity as enabled,
                (select count(*)::int from pg_policies
                  where schemaname = 'public' and tablename = 'nodes') as policies
           from pg_class where oid = 'public.nodes'::regclass`,
      );

      expect(rows[0]).toEqual({ enabled: true, policies: 0 });
    });
  });
});
