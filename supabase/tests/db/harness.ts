import { Client } from "pg";
import { env } from "./env.ts";

export async function withRollback(run: (sql: Client) => Promise<void>): Promise<void> {
  const sql = new Client({ connectionString: env.DB_URL });
  await sql.connect();
  try {
    await sql.query("begin");
    try {
      await run(sql);
    } finally {
      await sql.query("rollback");
    }
  } finally {
    await sql.end();
  }
}
