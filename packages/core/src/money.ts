/** Formats an amount in kobo as naira, e.g. 1500000 -> "₦15,000" and 1500050 -> "₦15,000.50". */
export function formatNaira(kobo: number): string {
  const naira = kobo / 100;
  const hasKobo = kobo % 100 !== 0;
  return `₦${naira.toLocaleString('en-NG', { minimumFractionDigits: hasKobo ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export type InvoiceStatus = 'unpaid' | 'part_paid' | 'paid';

export function invoiceStatus(totalKobo: number, paidKobo: number): InvoiceStatus {
  if (paidKobo <= 0) return 'unpaid';
  if (paidKobo >= totalKobo) return 'paid';
  return 'part_paid';
}
