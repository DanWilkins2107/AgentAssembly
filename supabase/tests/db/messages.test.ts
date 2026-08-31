import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import { withRollback } from "./harness.ts";
import { insertRow, seedNodes, seedProject, seedUsers } from "./seed.ts";

const USER_ID = "00000000-0000-0000-0000-0000000000a1";
const PROJECT_ID = "00000000-0000-0000-0000-0000000000b1";
const NODE_ID = "00000000-0000-0000-0000-0000000000c1";
const ABSENT_ID = "00000000-0000-0000-0000-0000000000ff";

const validMessage = {
  node_id: NODE_ID,
  project_id: PROJECT_ID,
  stage: "spec_review",
  type: "spec_submission",
  author_role: "agent",
  author_id: USER_ID,
  body: "the spec",
};

function withSeed(run: (sql: Client) => Promise<void>): () => Promise<void> {
  return () =>
    withRollback(async (sql) => {
      await seedUsers(sql, [USER_ID]);
      await seedProject(sql, PROJECT_ID, USER_ID);
      await seedNodes(sql, [NODE_ID], PROJECT_ID, USER_ID, "spec_review");
      await run(sql);
    });
}

function insertMessage(sql: Client, row: Record<string, unknown>) {
  return insertRow(sql, "public.messages", row);
}

async function insertRejected(
  sql: Client,
  row: Record<string, unknown>,
  code: string,
): Promise<void> {
  await sql.query("savepoint attempt");
  await expect(insertMessage(sql, row)).rejects.toMatchObject({ code });
  await sql.query("rollback to savepoint attempt");
}

describe("messages schema", () => {
  it("has exactly the ten columns, typed as declared", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ attname: string; type: string }>(
        `select attname::text, atttypid::regtype::text as type
           from pg_attribute
          where attrelid = 'public.messages'::regclass and attnum > 0 and not attisdropped
          order by attnum`,
      );
      expect(rows).toEqual([
        { attname: "id", type: "uuid" },
        { attname: "node_id", type: "uuid" },
        { attname: "project_id", type: "uuid" },
        { attname: "stage", type: "node_status" },
        { attname: "type", type: "message_type" },
        { attname: "author_role", type: "text" },
        { attname: "author_id", type: "uuid" },
        { attname: "body", type: "text" },
        { attname: "created_at", type: "timestamp with time zone" },
        { attname: "fts", type: "tsvector" },
      ]);
    });
  });

  // fts is generated, and Postgres never marks a generated column NOT NULL, so
  // author_id is the only column a writer may actually leave out.
  it("makes only author_id nullable", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ attname: string }>(
        `select attname::text from pg_attribute
          where attrelid = 'public.messages'::regclass and attnum > 0
            and not attisdropped and not attnotnull
          order by attnum`,
      );
      expect(rows.map((row) => row.attname)).toEqual(["author_id", "fts"]);
    });
  });

  it("defaults id and created_at, and generates fts as stored", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{
        attname: string;
        generated: string;
        expr: string | null;
      }>(
        `select column_meta.attname::text,
                column_meta.attgenerated::text as generated,
                pg_get_expr(default_expr.adbin, default_expr.adrelid) as expr
           from pg_attribute column_meta
           left join pg_attrdef default_expr
             on default_expr.adrelid = column_meta.attrelid
            and default_expr.adnum = column_meta.attnum
          where column_meta.attrelid = 'public.messages'::regclass
            and column_meta.attname in ('id', 'created_at', 'fts')`,
      );
      const byName = Object.fromEntries(rows.map((row) => [row.attname, row]));
      expect(byName.id?.expr).toBe("gen_random_uuid()");
      expect(byName.created_at?.expr).toBe("now()");
      expect(byName.fts?.generated).toBe("s");
    });
  });

  it("references nodes, projects and auth.users, cascading nothing", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ column_name: string; target: string; on_delete: string }>(
        `select attribute.attname::text as column_name,
                constraint_meta.confrelid::regclass::text as target,
                constraint_meta.confdeltype::text as on_delete
           from pg_constraint constraint_meta
           join pg_attribute attribute
             on attribute.attrelid = constraint_meta.conrelid
            and attribute.attnum = constraint_meta.conkey[1]
          where constraint_meta.conrelid = 'public.messages'::regclass
            and constraint_meta.contype = 'f'
          order by column_name`,
      );
      expect(rows).toEqual([
        { column_name: "author_id", target: "auth.users", on_delete: "a" },
        { column_name: "node_id", target: "nodes", on_delete: "a" },
        { column_name: "project_id", target: "projects", on_delete: "a" },
      ]);
    });
  });

  it("has exactly the two named CHECK constraints", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ conname: string }>(
        `select conname::text from pg_constraint
          where conrelid = 'public.messages'::regclass and contype = 'c'
          order by conname`,
      );
      expect(rows.map((row) => row.conname)).toEqual([
        "messages_author_role_allowed",
        "messages_body_length",
      ]);
    });
  });

  it("has the primary key plus the three lookup indexes", async () => {
    await withRollback(async (sql) => {
      const { rows } = await sql.query<{ name: string; method: string; definition: string }>(
        `select index_class.relname::text as name,
                access_method.amname::text as method,
                pg_get_indexdef(index_meta.indexrelid) as definition
           from pg_index index_meta
           join pg_class index_class on index_class.oid = index_meta.indexrelid
           join pg_am access_method on access_method.oid = index_class.relam
          where index_meta.indrelid = 'public.messages'::regclass
          order by name`,
      );
      expect(rows.map(({ name, method }) => ({ name, method }))).toEqual([
        { name: "messages_fts_idx", method: "gin" },
        { name: "messages_node_id_idx", method: "btree" },
        { name: "messages_pkey", method: "btree" },
        { name: "messages_project_id_idx", method: "btree" },
      ]);
      expect(rows.find((row) => row.name === "messages_fts_idx")?.definition).toContain("(fts)");
    });
  });
});

describe("messages constraints", () => {
  it(
    "accepts a message and fills in id, created_at and fts",
    withSeed(async (sql) => {
      const { rows } = await insertMessage(sql, validMessage);
      expect(rows[0]).toMatchObject({ node_id: NODE_ID, project_id: PROJECT_ID });
      expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect(rows[0].created_at).toBeInstanceOf(Date);
      expect(rows[0].fts).toContain("spec");
    }),
  );

  it(
    "accepts a null author_id, which is how system messages are written",
    withSeed(async (sql) => {
      const { rows } = await insertMessage(sql, {
        ...validMessage,
        type: "system",
        author_role: "system",
        author_id: null,
      });
      expect(rows[0].author_id).toBeNull();
    }),
  );

  it(
    "requires every column but author_id",
    withSeed(async (sql) => {
      const required = ["node_id", "project_id", "stage", "type", "author_role", "body"] as const;
      for (const column of required) {
        const row: Record<string, unknown> = { ...validMessage };
        delete row[column];
        await insertRejected(sql, row, "23502");
      }
    }),
  );

  it(
    "rejects a dangling node_id, project_id or author_id",
    withSeed(async (sql) => {
      await insertRejected(sql, { ...validMessage, node_id: ABSENT_ID }, "23503");
      await insertRejected(sql, { ...validMessage, project_id: ABSENT_ID }, "23503");
      await insertRejected(sql, { ...validMessage, author_id: ABSENT_ID }, "23503");
    }),
  );

  it(
    "rejects an author_role outside human, agent and system",
    withSeed(async (sql) => {
      await insertRejected(sql, { ...validMessage, author_role: "robot" }, "23514");
      await insertRejected(sql, { ...validMessage, author_role: "" }, "23514");
    }),
  );

  it(
    "rejects a body longer than 20000 characters",
    withSeed(async (sql) => {
      await insertRejected(sql, { ...validMessage, body: "x".repeat(20001) }, "23514");
      const { rows } = await insertMessage(sql, { ...validMessage, body: "x".repeat(20000) });
      expect(rows).toHaveLength(1);
    }),
  );

  it(
    "rejects a stage or type outside its enum, so neither can be stored as free text",
    withSeed(async (sql) => {
      await insertRejected(sql, { ...validMessage, stage: "evaluating_soft_block" }, "22P02");
      await insertRejected(sql, { ...validMessage, type: "chit_chat" }, "22P02");
    }),
  );
});
