import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 10, application_name: "PILOT_PROVISIONAL_BACKEND" });
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function query<T extends QueryResultRow>(pool: Pool, text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  return pool.query<T>(text, values);
}
