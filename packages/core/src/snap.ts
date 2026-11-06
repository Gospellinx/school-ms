import type { AssessmentComponent } from './results';

/**
 * Snap-to-score: a teacher photographs a handwritten score sheet, AI transcribes each row,
 * and this module matches those rows to the class list. Nothing here trusts the photo: every
 * match carries a confidence and any problems, and the teacher confirms before anything is saved.
 */

export interface RosterStudent {
  studentId: string;
  /** "Surname Firstname", as on the score sheet. */
  name: string;
  admissionNumber: string;
}

/** One row as read from the photo. */
export interface ReadRow {
  /** Row number on the sheet, from 1. */
  line: number;
  name: string;
  admissionNumber?: string | null;
  /** Component key to the number written; null when the box is empty. */
  scores: Record<string, number | null>;
  /** Cells the reader was unsure of (smudged, crossed out, ambiguous digit). */
  unclear?: string[];
}

export type MatchConfidence = 'high' | 'medium' | 'low';

export interface SnapMatch {
  studentId: string;
  line: number;
  nameAsWritten: string;
  confidence: MatchConfidence;
  /** Scores that passed the checks, ready to put in the score sheet. */
  scores: Record<string, number>;
  /** Component keys to check against the photo. */
  check: string[];
  issues: string[];
}

export interface SnapResult {
  matches: SnapMatch[];
  /** Rows on the photo that matched nobody in the class. */
  unmatched: ReadRow[];
  /** Students in the class with no row on the photo. */
  missing: string[];
}

const HONORIFICS = new Set(['master', 'miss', 'mr', 'mrs', 'ms']);

/** Lower-case name words without punctuation, e.g. "ADEBAYO, Tolu-Ade." gives ["adebayo", "tolu", "ade"]. */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((t) => t && !HONORIFICS.has(t));
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** How alike two name words are, from 0 to 1. Handles initials ("T" for "Tolu") and small spelling slips. */
function tokenScore(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? 0.8 : 0;
  const longest = Math.max(a.length, b.length);
  const d = editDistance(a, b);
  const allowed = longest >= 8 ? 2 : longest >= 4 ? 1 : 0;
  if (d <= allowed) return 1 - d / (longest + 1);
  // Shortened names: "Chukwu" for "Chukwuemeka".
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.75;
  return 0;
}

/** How alike two names are, from 0 to 1, whatever the word order (surname first or last). */
export function nameSimilarity(a: string, b: string): number {
  const x = nameTokens(a);
  const y = nameTokens(b);
  if (!x.length || !y.length) return 0;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const used = new Set<number>();
  let total = 0;
  for (const t of short) {
    let best = 0;
    let bestIdx = -1;
    long.forEach((u, i) => {
      if (used.has(i)) return;
      const s = tokenScore(t, u);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) used.add(bestIdx);
    total += best;
  }
  // A middle name missing from the sheet costs a little, not a lot.
  return total / short.length - (long.length - short.length) * 0.05;
}

const normAdmission = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Matches rows read from a photo to students in the class, and checks every number against the
 * component's maximum. Each student and each row is used at most once, best matches first.
 */
export function matchReadRows(roster: RosterStudent[], rows: ReadRow[], components: AssessmentComponent[]): SnapResult {
  const max = new Map(components.map((c) => [c.key, c.maxScore]));
  const label = new Map(components.map((c) => [c.key, c.label]));

  type Pair = { r: number; s: number; score: number; byNumber: boolean };
  const pairs: Pair[] = [];
  rows.forEach((row, r) => {
    const adm = normAdmission(row.admissionNumber);
    roster.forEach((st, s) => {
      if (adm && adm.length >= 3 && adm === normAdmission(st.admissionNumber)) {
        pairs.push({ r, s, score: 2, byNumber: true });
        return;
      }
      const score = nameSimilarity(row.name, st.name);
      // A shared surname alone (0.5) is not a match: siblings are often in the same class.
      if (score >= 0.6) pairs.push({ r, s, score, byNumber: false });
    });
  });
  pairs.sort((p, q) => q.score - p.score || p.r - q.r);

  const rowUsed = new Set<number>();
  const studentUsed = new Set<number>();
  const matches: SnapMatch[] = [];
  for (const p of pairs) {
    if (rowUsed.has(p.r) || studentUsed.has(p.s)) continue;
    rowUsed.add(p.r);
    studentUsed.add(p.s);
    const row = rows[p.r]!;
    const st = roster[p.s]!;
    let confidence: MatchConfidence = p.byNumber || p.score >= 0.95 ? 'high' : p.score >= 0.75 ? 'medium' : 'low';
    const issues: string[] = [];
    const check = new Set<string>((row.unclear ?? []).filter((k) => max.has(k)));
    const scores: Record<string, number> = {};
    for (const [key, value] of Object.entries(row.scores)) {
      if (value === null || value === undefined) continue;
      const m = max.get(key);
      if (m === undefined) continue;
      if (!Number.isFinite(value) || value < 0 || value > m) {
        issues.push(`${label.get(key)} reads as ${value}, but the most is ${m}`);
        check.add(key);
        continue;
      }
      scores[key] = Math.round(value * 100) / 100;
    }
    if (check.size && confidence === 'high') confidence = 'medium';
    if (row.unclear?.length) issues.push(`Hard to read: ${row.unclear.map((k) => label.get(k) ?? k).join(', ')}`);
    if (!p.byNumber && p.score < 0.95) issues.push(`Name on the sheet is "${row.name}"`);
    matches.push({ studentId: st.studentId, line: row.line, nameAsWritten: row.name, confidence, scores, check: [...check], issues });
  }

  return {
    matches: matches.sort((a, b) => a.line - b.line),
    unmatched: rows.filter((_, i) => !rowUsed.has(i)),
    missing: roster.filter((_, i) => !studentUsed.has(i)).map((s) => s.studentId),
  };
}
