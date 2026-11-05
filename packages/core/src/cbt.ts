/** Objective (multiple-choice) question as stored in the question bank. */
export interface ObjectiveQuestion {
  id: string;
  answer: string;
  marks?: number;
}

export interface GradedAnswer {
  questionId: string;
  chosen: string | null;
  correct: boolean;
  marks: number;
  awarded: number;
}

export interface GradedAttempt {
  score: number;
  maxScore: number;
  percentage: number;
  answered: number;
  correctCount: number;
  answers: GradedAnswer[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Marks an attempt. Unanswered questions score zero. Option keys compare case-insensitively. */
export function gradeAttempt(questions: ObjectiveQuestion[], answers: Record<string, string>): GradedAttempt {
  const graded = questions.map((q) => {
    const marks = q.marks ?? 1;
    const chosen = answers[q.id] ?? null;
    const correct = chosen !== null && chosen.trim().toUpperCase() === q.answer.trim().toUpperCase();
    return { questionId: q.id, chosen, correct, marks, awarded: correct ? marks : 0 };
  });
  const score = graded.reduce((s, g) => s + g.awarded, 0);
  const maxScore = graded.reduce((s, g) => s + g.marks, 0);
  return {
    score,
    maxScore,
    percentage: maxScore ? round2((score / maxScore) * 100) : 0,
    answered: graded.filter((g) => g.chosen !== null).length,
    correctCount: graded.filter((g) => g.correct).length,
    answers: graded,
  };
}

/** Converts a CBT percentage into marks for a score component, e.g. 75% of a 20-mark CA is 15. */
export function scaleToComponent(percentage: number, maxScore: number): number {
  return Math.round((percentage / 100) * maxScore * 10) / 10;
}

/** Deterministic Fisher-Yates shuffle, so a resumed attempt keeps the same question order. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
