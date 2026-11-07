import { instalmentProgress, InstalmentProgress } from '@school-ms/core';
import { and, eq } from 'drizzle-orm';
import { todayInLagos } from '../common/access';
import { Tx } from '../db/client';
import { automationSettings, instalmentPlans, invoices } from '../db/schema';

type Plan = typeof instalmentPlans.$inferSelect;

export interface PlanView {
  id: string;
  schedule: Plan['schedule'];
  paidBeforeKobo: number;
  note: string | null;
  createdAt: Date;
  progress: InstalmentProgress;
}

/** A bill's instalment plan with how the parent is doing against it, or null when there is none. */
export async function planFor(tx: Tx, invoiceId: string, paidKobo: number, today = todayInLagos()): Promise<PlanView | null> {
  const [plan] = await tx.select().from(instalmentPlans).where(eq(instalmentPlans.invoiceId, invoiceId));
  return plan ? viewPlan(plan, paidKobo, today) : null;
}

export function viewPlan(plan: Plan, paidKobo: number, today = todayInLagos()): PlanView {
  return {
    id: plan.id,
    schedule: plan.schedule,
    paidBeforeKobo: plan.paidBeforeKobo,
    note: plan.note,
    createdAt: plan.createdAt,
    progress: instalmentProgress(plan.schedule, Math.max(0, paidKobo - plan.paidBeforeKobo), today),
  };
}

/**
 * True when report cards held for debt should still open because the parent agreed an
 * instalment plan and is keeping to it (the school can turn this off).
 */
export async function planReleasesResults(tx: Tx, termId: string, studentId: string): Promise<boolean> {
  const [row] = await tx
    .select({ invoice: invoices, plan: instalmentPlans })
    .from(invoices)
    .innerJoin(instalmentPlans, eq(instalmentPlans.invoiceId, invoices.id))
    .where(and(eq(invoices.termId, termId), eq(invoices.studentId, studentId)));
  if (!row) return false;
  const [settings] = await tx.select({ holdAllowsPlans: automationSettings.holdAllowsPlans }).from(automationSettings);
  if (settings && !settings.holdAllowsPlans) return false;
  return viewPlan(row.plan, row.invoice.paidKobo).progress.onTrack;
}
