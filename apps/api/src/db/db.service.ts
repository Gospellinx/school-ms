import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { createDb, Db, Tx } from './client';

/**
 * Limits a transaction to one school. Switches to the restricted `school_app` role
 * because superusers and BYPASSRLS roles would otherwise ignore row-level security.
 */
export async function scopeToSchool(tx: Tx, schoolId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.school_id', ${schoolId}, true)`);
  await tx.execute(sql`set local role school_app`);
}

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
      await scopeToSchool(tx, schoolId);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
