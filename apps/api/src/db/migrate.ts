import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client';

export async function runMigrations(url?: string): Promise<void> {
  const { pool, db } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', 'drizzle') });
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log('Migrations applied'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
