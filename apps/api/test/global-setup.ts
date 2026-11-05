import { Client } from 'pg';
import { runMigrations } from '../src/db/migrate';

/** Resets the test database's schema and applies all migrations before the suite runs. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://schoolms:schoolms@localhost:5432/schoolms_test';
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;');
  await client.end();
  await runMigrations(url);
}
