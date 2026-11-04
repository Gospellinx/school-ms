import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { Tx } from '../db/client';

/**
 * Postgres foreign-key checks bypass row-level security, so before linking to a row by id
 * we read it through RLS to prove it belongs to the current school.
 */
export async function assertOwned(tx: Tx, table: PgTable & { id: PgColumn }, id: string, what: string): Promise<void> {
  const rows = await tx.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (rows.length === 0) throw new NotFoundException(`${what} not found`);
}
