/**
 * School knowledge base helpers: splitting extracted text into citable chunks,
 * reading a scheme of work's weekly topics, and turning a question into a search query.
 * Pure functions so they are easy to test and reuse.
 */

/** A block of extracted text and where it came from, e.g. "Page 3" or "Week 4". */
export interface SourceSection {
  locator: string | null;
  text: string;
}

export interface KnowledgeChunk {
  ordinal: number;
  /** Where in the document this came from, shown in citations. */
  locator: string | null;
  text: string;
}

const CHUNK_TARGET = 1100;
const CHUNK_MAX = 1600;

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits a paragraph that is too long on sentence boundaries. */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_MAX) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > CHUNK_TARGET) {
      out.push(cur.trim());
      cur = '';
    }
    if (s.length > CHUNK_MAX) {
      for (let i = 0; i < s.length; i += CHUNK_TARGET) out.push(s.slice(i, i + CHUNK_TARGET).trim());
      continue;
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const WEEK_HEADING = /^\s*(week|wk)\s*(\d{1,2})\b/i;

/**
 * Splits sections into chunks of roughly 1,100 characters on paragraph boundaries.
 * A "Week N" line starts a new chunk and becomes its locator, so a scheme of work or lesson
 * note is cited by week; otherwise the section's own locator (e.g. the page) is used.
 */
export function chunkSections(sections: SourceSection[]): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = [];
  for (const section of sections) {
    const text = normaliseWhitespace(section.text);
    if (!text) continue;
    let locator = section.locator;
    let buf = '';
    const flush = () => {
      if (buf.trim()) chunks.push({ ordinal: chunks.length, locator, text: buf.trim() });
      buf = '';
    };
    for (const raw of text.split(/\n\s*\n|\n(?=\s*(?:week|wk)\s*\d)/i)) {
      const para = raw.trim();
      if (!para) continue;
      const week = para.match(WEEK_HEADING);
      if (week) {
        flush();
        locator = section.locator ? `${section.locator}, Week ${Number(week[2])}` : `Week ${Number(week[2])}`;
      }
      for (const piece of splitLong(para)) {
        if (buf && buf.length + piece.length + 2 > CHUNK_TARGET) flush();
        buf += (buf ? '\n\n' : '') + piece;
      }
    }
    flush();
  }
  return chunks;
}

export interface OutlineEntry {
  week: number;
  topic: string;
}

/**
 * Reads the weekly topics from a scheme of work, from lines such as
 * "Week 3: Electric circuits", "WEEK 4 - Ohm's law" or "Wk 5. Revision".
 */
/** Weeks set aside for revision, tests or exams, which are not topics a student can study. */
const NON_TOPIC = /^(?:general\s+)?(?:revision|examinations?|exams?|mid[\s-]?term|tests?|continuous assessment|ca\b|closing|resumption|holiday|break)\b/i;

export function parseSchemeOfWork(text: string): OutlineEntry[] {
  const out = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:week|wk)\s*(\d{1,2})\s*[:.\-–—)]?\s*(.+?)\s*$/i);
    if (!m) continue;
    const week = Number(m[1]);
    const topic = m[2].replace(/^(topic|theme)\s*[:\-–]\s*/i, '').replace(/\s+/g, ' ').trim();
    if (week < 1 || week > 16 || topic.length < 2 || NON_TOPIC.test(topic) || out.has(week)) continue;
    out.set(week, topic.slice(0, 120));
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([week, topic]) => ({ week, topic }));
}

const STOP_WORDS = new Set(
  (
    'a an and are as at be but by can do does for from how i in is it me my of on or so that the this to was we what when where which who why will with you your ' +
    'please explain tell give show help understand about define meaning mean'
  ).split(' '),
);

/**
 * Turns a free-text question into a Postgres to_tsquery() string that matches any of
 * the useful words (prefix-matched), or null when nothing searchable is left.
 */
export function toSearchQuery(question: string, maxTerms = 12): string | null {
  const words = question
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const unique = [...new Set(words)].slice(0, maxTerms);
  if (!unique.length) return null;
  return unique.map((w) => `${w}:*`).join(' | ');
}

/** Which kinds of material students may read through the tutor by default. */
export const STUDENT_VISIBLE_KINDS = ['scheme_of_work', 'lesson_note', 'past_questions', 'textbook', 'other'] as const;
