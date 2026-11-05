import { seededShuffle } from './cbt';

/** One subject total from one term's report card. `termOrder` increases with time. */
export interface SubjectTermResult {
  subjectId: string;
  subjectName: string;
  termOrder: number;
  termLabel: string;
  total: number;
}

/** How a student has done on CBT and practice questions for one topic. */
export interface TopicStat {
  subjectId: string;
  topic: string;
  attempted: number;
  correct: number;
}

export interface WeakTopic {
  topic: string;
  attempted: number;
  accuracy: number;
}

export interface SubjectFocus {
  subjectId: string;
  subjectName: string;
  latestScore: number | null;
  latestTerm: string | null;
  /** Change from the previous term's total, null with only one term. */
  trend: number | null;
  /** True when the latest score is under the WAEC credit line (50, a C6). */
  belowCredit: boolean;
  weakTopics: WeakTopic[];
  /** Higher means study this first. */
  priority: number;
  reasons: string[];
}

export interface StudyProfile {
  subjects: SubjectFocus[];
  overallAverage: number | null;
}

const CREDIT_LINE = 50;
const MIN_ATTEMPTS = 3;
const WEAK_ACCURACY = 60;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Builds a study profile from a student's own school results and CBT history:
 * which subjects need attention first, and which topics inside them are weak.
 * Pure and deterministic, so the AI layer only writes the plan, not the diagnosis.
 */
export function buildStudyProfile(results: SubjectTermResult[], topics: TopicStat[]): StudyProfile {
  const subjectIds = new Set([...results.map((r) => r.subjectId), ...topics.map((t) => t.subjectId)]);
  const names = new Map(results.map((r) => [r.subjectId, r.subjectName]));

  const subjects: SubjectFocus[] = [...subjectIds].map((subjectId) => {
    const history = results.filter((r) => r.subjectId === subjectId).sort((a, b) => a.termOrder - b.termOrder);
    const latest = history.at(-1) ?? null;
    const previous = history.length > 1 ? history[history.length - 2] : null;
    const trend = latest && previous ? round1(latest.total - previous.total) : null;

    const weakTopics = topics
      .filter((t) => t.subjectId === subjectId && t.attempted >= MIN_ATTEMPTS)
      .map((t) => ({ topic: t.topic, attempted: t.attempted, accuracy: round1((t.correct / t.attempted) * 100) }))
      .filter((t) => t.accuracy < WEAK_ACCURACY)
      .sort((a, b) => a.accuracy - b.accuracy || b.attempted - a.attempted);

    const reasons: string[] = [];
    let priority = 0;
    if (latest) {
      priority += Math.max(0, 75 - latest.total); // distance from an A1
      if (latest.total < CREDIT_LINE) {
        priority += 25;
        reasons.push(`Scored ${latest.total} in ${latest.termLabel}, below the credit line of ${CREDIT_LINE}`);
      }
    } else {
      priority += 10;
    }
    if (trend !== null && trend < 0) {
      priority += Math.min(20, -trend);
      reasons.push(`Dropped ${-trend} marks since the previous term`);
    }
    if (weakTopics.length) {
      priority += weakTopics.length * 5;
      reasons.push(`Weak topics: ${weakTopics.map((t) => t.topic).join(', ')}`);
    }

    return {
      subjectId,
      subjectName: names.get(subjectId) ?? '',
      latestScore: latest?.total ?? null,
      latestTerm: latest?.termLabel ?? null,
      trend,
      belowCredit: latest ? latest.total < CREDIT_LINE : false,
      weakTopics,
      priority: round1(priority),
      reasons,
    };
  });

  subjects.sort((a, b) => b.priority - a.priority || a.subjectName.localeCompare(b.subjectName));

  const latestScores = subjects.map((s) => s.latestScore).filter((s): s is number => s !== null);
  return {
    subjects,
    overallAverage: latestScores.length ? round1(latestScores.reduce((a, b) => a + b, 0) / latestScores.length) : null,
  };
}

export interface PoolQuestion {
  id: string;
  topic: string;
}

/**
 * Chooses practice questions: about two thirds from weak topics (weakest first), the rest from
 * other topics, preferring questions the student has not yet answered correctly.
 */
export function pickPracticeQuestions(
  pool: PoolQuestion[],
  opts: { weakTopics: string[]; mastered: Set<string>; count: number; seed: string },
): string[] {
  const fresh = (q: PoolQuestion) => !opts.mastered.has(q.id);
  const ordered = (qs: PoolQuestion[]) => [
    ...seededShuffle(qs.filter(fresh), opts.seed),
    ...seededShuffle(qs.filter((q) => !fresh(q)), opts.seed),
  ];
  const weakSet = new Set(opts.weakTopics.map((t) => t.toLowerCase()));
  const weak = ordered(pool.filter((q) => weakSet.has(q.topic.toLowerCase())));
  const rest = ordered(pool.filter((q) => !weakSet.has(q.topic.toLowerCase())));

  const weakQuota = weak.length ? Math.ceil((opts.count * 2) / 3) : 0;
  const picked = weak.slice(0, weakQuota);
  for (const q of [...rest, ...weak.slice(weakQuota)]) {
    if (picked.length >= opts.count) break;
    picked.push(q);
  }
  return picked.slice(0, opts.count).map((q) => q.id);
}
