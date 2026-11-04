/** One band of a grading scale, e.g. 75-100 => A1 "Excellent". Bounds are inclusive. */
export interface GradeBand {
  min: number;
  max: number;
  grade: string;
  remark: string;
}

export type GradingScale = GradeBand[];

/** WAEC-style nine-point scale, commonly used for SS classes. */
export const WAEC_SCALE: GradingScale = [
  { min: 75, max: 100, grade: 'A1', remark: 'Excellent' },
  { min: 70, max: 74.99, grade: 'B2', remark: 'Very good' },
  { min: 65, max: 69.99, grade: 'B3', remark: 'Good' },
  { min: 60, max: 64.99, grade: 'C4', remark: 'Credit' },
  { min: 55, max: 59.99, grade: 'C5', remark: 'Credit' },
  { min: 50, max: 54.99, grade: 'C6', remark: 'Credit' },
  { min: 45, max: 49.99, grade: 'D7', remark: 'Pass' },
  { min: 40, max: 44.99, grade: 'E8', remark: 'Pass' },
  { min: 0, max: 39.99, grade: 'F9', remark: 'Fail' },
];

/** Simple A-F scale, commonly used for nursery, primary and JSS. */
export const BASIC_SCALE: GradingScale = [
  { min: 70, max: 100, grade: 'A', remark: 'Excellent' },
  { min: 60, max: 69.99, grade: 'B', remark: 'Very good' },
  { min: 50, max: 59.99, grade: 'C', remark: 'Good' },
  { min: 45, max: 49.99, grade: 'D', remark: 'Fair' },
  { min: 40, max: 44.99, grade: 'E', remark: 'Pass' },
  { min: 0, max: 39.99, grade: 'F', remark: 'Fail' },
];

/** Throws if bands overlap, leave gaps wider than 0.01, or do not cover 0-100. */
export function validateScale(scale: GradingScale): void {
  if (scale.length === 0) throw new Error('Grading scale is empty');
  const sorted = [...scale].sort((a, b) => a.min - b.min);
  if (sorted[0].min !== 0) throw new Error('Grading scale must start at 0');
  if (sorted[sorted.length - 1].max !== 100) throw new Error('Grading scale must end at 100');
  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i];
    if (band.min > band.max) throw new Error(`Band ${band.grade} has min above max`);
    const next = sorted[i + 1];
    if (next) {
      if (next.min <= band.max) throw new Error(`Bands ${band.grade} and ${next.grade} overlap`);
      if (next.min - band.max > 0.011) throw new Error(`Gap between ${band.grade} and ${next.grade}`);
    }
  }
}

export function gradeFor(score: number, scale: GradingScale): GradeBand {
  const rounded = Math.round(score * 100) / 100;
  const band = scale.find((b) => rounded >= b.min && rounded <= b.max);
  if (!band) throw new Error(`No grade band covers score ${score}`);
  return band;
}
