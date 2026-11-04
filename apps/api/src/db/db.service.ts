import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { createDb, Db, Tx } from './client';

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly pool: Pool;
  /** Unscoped access. Only the `schools` table is readable this way; every other table is hidden by row-level security. */
  readonly db: Db;

  constructor() {
    const { pool, db } = createDb();
    this.pool = pool;
    this.db = db;
  }

  /** Runs `fn` in a transaction where row-level security exposes only this school's rows. */
  withSchool<T>(schoolId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
