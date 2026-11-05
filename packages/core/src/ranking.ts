/**
 * Standard competition ranking ("1224"): equal values share a position,
 * and the next position skips. Higher values rank first.
 */
export function rank<T>(items: T[], value: (item: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => value(b) - value(a));
  const positions = new Map<T, number>();
  sorted.forEach((item, i) => {
    const prev = sorted[i - 1];
    positions.set(item, prev !== undefined && value(prev) === value(item) ? positions.get(prev)! : i + 1);
  });
  return positions;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 22 -> "22nd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
