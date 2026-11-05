/**
 * Normalises a Nigerian phone number to international form without the plus sign,
 * e.g. 08031234567, +234 803 123 4567 and 8031234567 all become 2348031234567.
 * This is the form SMS gateways such as Termii expect. Returns null if it is not a valid number.
 */
export function normalizeNigerianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;
  let national: string;
  if (digits.startsWith('234') && digits.length === 13) national = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 11) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;
  // Mobile numbers start 7, 8 or 9 after the leading zero (070x, 080x, 081x, 090x, 091x).
  if (!/^[789][01]\d{8}$/.test(national)) return null;
  return `234${national}`;
}
