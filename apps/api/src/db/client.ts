import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://schoolms:schoolms@localhost:5432/schoolms';
}

export function createDb(url = databaseUrl()): { pool: Pool; db: Db } {
  const pool = new Pool({ connectionString: url });
  return { pool, db: drizzle(pool, { schema }) };
}
