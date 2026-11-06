import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { chunkSections, parseSchemeOfWork, SourceSection, toSearchQuery } from '@school-ms/core';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { LEADERSHIP } from '../auth/decorators';
import { config } from '../common/config';
import { assertOwned } from '../common/owned';
import { found } from '../common/validation';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { Citation, kbChunks, kbDocuments, kbFiles, subjects } from '../db/schema';
import { AiService } from '../prep/ai.service';
import { extractText, mimeFromName } from './extract';

type KbKind = (typeof kbDocuments.$inferSelect)['kind'];

export interface DocumentInput {
  title: string;
  kind: KbKind;
  subjectId?: string | null;
  classLevel?: string | null;
  termNumber?: number | null;
  /** Week of term, for lesson notes and plans. */
  week?: number | null;
  visibleToStudents?: boolean;
  fileName: string;
  mimeType?: string;
}

export interface SearchFilters {
  subjectId?: string | null;
  classLevel?: string | null;
  termNumber?: number | null;
  /** Students only see documents marked visible to them, never marking schemes. */
  studentsOnly?: boolean;
  /** Kinds to leave out, e.g. lesson plans when drafting a new one, so drafts do not quote drafts. */
  excludeKinds?: string[];
  limit?: number;
}

export interface Passage {
  chunkId: string;
  documentId: string;
  title: string;
  kind: string;
  locator: string | null;
  text: string;
  rank: number;
}

export const citationOf = (p: Passage): Citation => ({ documentId: p.documentId, title: p.title, locator: p.locator, kind: p.kind });

const answerZod = z.object({ answer: z.string(), sources: z.array(z.number().int()), coveredByMaterial: z.boolean() });
const answerSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'sources', 'coveredByMaterial'],
  properties: {
    answer: { type: 'string', description: 'The answer, citing sources inline as [1], [2]. Under 200 words.' },
    sources: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the sources actually used.' },
    coveredByMaterial: { type: 'boolean', description: "False when the school's material does not cover the question." },
  },
};

/** Character budget for passages quoted to the model, to keep calls cheap. */
const CONTEXT_CHARS = 6000;

/**
 * The school knowledge base: teachers upload schemes of work, lesson notes, past questions
 * and textbooks; the text is split into passages and indexed with Postgres full-text search,
 * so the tutor and the "ask" box answer from the school's own material first and cite it.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly dbs: DbService,
    private readonly ai: AiService,
  ) {}

  // ------------------------------------------------------------ Upload and indexing

  async upload(user: Principal, input: DocumentInput, data: Buffer) {
    if (!data?.length) throw new BadRequestException('The file is empty');
    if (data.length > config.kbMaxUploadBytes()) throw new PayloadTooLargeException(`Files can be up to ${config.kbMaxUploadBytes() / 1024 / 1024} MB`);
    const mimeType = mimeFromName(input.fileName, input.mimeType);
    if (!mimeType) throw new BadRequestException('Upload a PDF, Word (.docx), text file or a photo (JPG or PNG). Old .doc files: save as .docx first.');

    const doc = await this.dbs.withSchool(user.schoolId, async (tx) => {
      if (input.subjectId) await assertOwned(tx, subjects, input.subjectId, 'Subject');
      const [d] = await tx
        .insert(kbDocuments)
        .values({
          schoolId: user.schoolId,
          title: input.title,
          kind: input.kind,
          subjectId: input.subjectId ?? null,
          classLevel: input.classLevel?.trim() || null,
          termNumber: input.termNumber ?? null,
          week: input.week ?? null,
          // Marking schemes are for staff unless the school says otherwise.
          visibleToStudents: input.visibleToStudents ?? input.kind !== 'marking_scheme',
          fileName: input.fileName,
          mimeType,
          sizeBytes: data.length,
          uploadedBy: user.staffId,
        })
        .returning();
      await tx.insert(kbFiles).values({ schoolId: user.schoolId, documentId: d.id, data });
      return d;
    });
    return this.process(user.schoolId, doc.id, data, user.staffId);
  }

  /**
   * Reads the file and indexes it. Text files, Word documents and text PDFs are indexed now;
   * scans and photos wait for AI (status needs_ai) and are read by Claude when it is set up.
   */
  private async process(schoolId: string, documentId: string, data: Buffer, staffId?: string) {
    const doc = await this.dbs.withSchool(schoolId, async (tx) => found((await tx.select().from(kbDocuments).where(eq(kbDocuments.id, documentId)))[0], 'Document'));
    let sections: SourceSection[];
    try {
      const extracted = await extractText(data, doc.mimeType);
      if (extracted.kind === 'needs_ai') {
        if (!this.ai.enabled) return this.setStatus(schoolId, documentId, 'needs_ai', `${extracted.reason} It will be read once AI is switched on.`);
        sections = [{ locator: null, text: await this.transcribe(schoolId, doc, data, staffId) }];
      } else {
        sections = extracted.sections;
      }
    } catch (err) {
      this.logger.warn(`Could not read ${doc.fileName}: ${(err as Error).message}`);
      return this.setStatus(schoolId, documentId, 'failed', 'This file could not be read. Try saving it again as PDF or .docx.');
    }
    return this.index(schoolId, documentId, sections);
  }

  private async transcribe(schoolId: string, doc: typeof kbDocuments.$inferSelect, data: Buffer, staffId?: string): Promise<string> {
    const b64 = data.toString('base64');
    const source =
      doc.mimeType === 'application/pdf'
        ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } } as const)
        : ({ type: 'image', source: { type: 'base64', media_type: doc.mimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: b64 } } as const);
    return this.ai.text({
      feature: 'kb_transcribe',
      schoolId,
      staffId,
      system: 'You transcribe school documents (lesson notes, schemes of work, past questions) for a search index.',
      content: [
        source,
        {
          type: 'text',
          text:
            'Transcribe all the text in this document in reading order. Keep headings such as "Week 3" on their own line. ' +
            'Write equations in plain text. Describe diagrams in one short line in square brackets. Output only the transcription.',
        },
      ],
      maxTokens: 16000,
    });
  }

  private async index(schoolId: string, documentId: string, sections: SourceSection[]) {
    const chunks = chunkSections(sections);
    if (!chunks.length) return this.setStatus(schoolId, documentId, 'failed', 'No readable text was found in this file.');
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [doc] = await tx.select().from(kbDocuments).where(eq(kbDocuments.id, documentId));
      await tx.delete(kbChunks).where(eq(kbChunks.documentId, documentId));
      for (let i = 0; i < chunks.length; i += 200) {
        await tx.insert(kbChunks).values(chunks.slice(i, i + 200).map((c) => ({ schoolId, documentId, ordinal: c.ordinal, locator: c.locator, text: c.text })));
      }
      const outline = doc.kind === 'scheme_of_work' ? parseSchemeOfWork(sections.map((s) => s.text).join('\n')) : [];
      const [updated] = await tx
        .update(kbDocuments)
        .set({ status: 'ready', error: null, chunkCount: chunks.length, outline })
        .where(eq(kbDocuments.id, documentId))
        .returning();
      return updated;
    });
  }

  private async setStatus(schoolId: string, documentId: string, status: 'needs_ai' | 'failed', error: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [d] = await tx.update(kbDocuments).set({ status, error, chunkCount: 0 }).where(eq(kbDocuments.id, documentId)).returning();
      return d;
    });
  }

  /** Reads a document again, e.g. a scan once AI has been switched on. */
  async reprocess(user: Principal, documentId: string) {
    const file = await this.dbs.withSchool(user.schoolId, async (tx) => {
      await this.mayChange(tx, user, documentId);
      const [f] = await tx.select().from(kbFiles).where(eq(kbFiles.documentId, documentId));
      return found(f, 'File');
    });
    return this.process(user.schoolId, documentId, file.data, user.staffId);
  }

  /** Teachers manage the documents they uploaded; leadership manages all of them. */
  private async mayChange(tx: Tx, user: Principal, documentId: string) {
    const [doc] = await tx.select().from(kbDocuments).where(eq(kbDocuments.id, documentId));
    found(doc, 'Document');
    if (!LEADERSHIP.includes(user.role) && doc.uploadedBy !== user.staffId) throw new ForbiddenException('Only the teacher who uploaded this, or the school admin, can change it');
    return doc;
  }

  // ------------------------------------------------------------ Documents

  list(schoolId: string, f: { subjectId?: string; classLevel?: string }) {
    return this.dbs.withSchool(schoolId, (tx) =>
      tx
        .select({
          id: kbDocuments.id,
          title: kbDocuments.title,
          kind: kbDocuments.kind,
          subjectId: kbDocuments.subjectId,
          subject: subjects.name,
          classLevel: kbDocuments.classLevel,
          termNumber: kbDocuments.termNumber,
          fileName: kbDocuments.fileName,
          mimeType: kbDocuments.mimeType,
          sizeBytes: kbDocuments.sizeBytes,
          status: kbDocuments.status,
          error: kbDocuments.error,
          chunkCount: kbDocuments.chunkCount,
          outlineWeeks: sql<number>`jsonb_array_length(${kbDocuments.outline})::int`,
          visibleToStudents: kbDocuments.visibleToStudents,
          uploadedBy: kbDocuments.uploadedBy,
          createdAt: kbDocuments.createdAt,
        })
        .from(kbDocuments)
        .leftJoin(subjects, eq(subjects.id, kbDocuments.subjectId))
        .where(
          and(
            f.subjectId ? eq(kbDocuments.subjectId, f.subjectId) : undefined,
            f.classLevel ? eq(kbDocuments.classLevel, f.classLevel) : undefined,
          ),
        )
        .orderBy(desc(kbDocuments.createdAt)),
    );
  }

  get(schoolId: string, documentId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [doc] = await tx.select().from(kbDocuments).where(eq(kbDocuments.id, documentId));
      found(doc, 'Document');
      const preview = await tx
        .select({ ordinal: kbChunks.ordinal, locator: kbChunks.locator, text: kbChunks.text })
        .from(kbChunks)
        .where(eq(kbChunks.documentId, documentId))
        .orderBy(asc(kbChunks.ordinal))
        .limit(3);
      return { ...doc, preview };
    });
  }

  file(schoolId: string, documentId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const [row] = await tx
        .select({ data: kbFiles.data, fileName: kbDocuments.fileName, mimeType: kbDocuments.mimeType })
        .from(kbFiles)
        .innerJoin(kbDocuments, eq(kbDocuments.id, kbFiles.documentId))
        .where(eq(kbFiles.documentId, documentId));
      return found(row, 'File');
    });
  }

  update(user: Principal, documentId: string, patch: Partial<Omit<DocumentInput, 'fileName' | 'mimeType'>>) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await this.mayChange(tx, user, documentId);
      if (patch.subjectId) await assertOwned(tx, subjects, patch.subjectId, 'Subject');
      const [d] = await tx
        .update(kbDocuments)
        .set({ ...patch, classLevel: patch.classLevel === undefined ? undefined : patch.classLevel?.trim() || null })
        .where(eq(kbDocuments.id, documentId))
        .returning();
      return d;
    });
  }

  remove(user: Principal, documentId: string) {
    return this.dbs.withSchool(user.schoolId, async (tx) => {
      await this.mayChange(tx, user, documentId);
      await tx.delete(kbDocuments).where(eq(kbDocuments.id, documentId));
      return { deleted: true };
    });
  }

  /** Weekly topics from the schemes of work, e.g. for the tutor's topic list. */
  async outline(tx: Tx, f: { subjectId: string; classLevel?: string | null; termNumber?: number | null; studentsOnly?: boolean }) {
    const docs = await tx
      .select({ outline: kbDocuments.outline, termNumber: kbDocuments.termNumber, title: kbDocuments.title, id: kbDocuments.id })
      .from(kbDocuments)
      .where(
        and(
          eq(kbDocuments.subjectId, f.subjectId),
          eq(kbDocuments.kind, 'scheme_of_work'),
          eq(kbDocuments.status, 'ready'),
          f.classLevel ? sql`(${kbDocuments.classLevel} is null or ${kbDocuments.classLevel} = ${f.classLevel})` : undefined,
          f.studentsOnly ? eq(kbDocuments.visibleToStudents, true) : undefined,
        ),
      )
      .orderBy(asc(kbDocuments.termNumber));
    return docs.flatMap((d) => d.outline.map((o) => ({ ...o, termNumber: d.termNumber, documentId: d.id, source: d.title })));
  }

  // ------------------------------------------------------------ Search and answers

  /**
   * Full-text search over the school's passages. Matches on the subject, class level and
   * term rank higher; documents for other subjects or levels are left out entirely.
   */
  async search(tx: Tx, question: string, f: SearchFilters): Promise<Passage[]> {
    const q = toSearchQuery(question);
    if (!q) return [];
    const rows = await tx.execute<{
      chunk_id: string;
      document_id: string;
      title: string;
      kind: string;
      locator: string | null;
      text: string;
      rank: number;
    }>(sql`
      select c.id as chunk_id, d.id as document_id, d.title, d.kind, c.locator, c.text,
        ts_rank_cd(c.tsv, q) *
          (case when d.subject_id is not distinct from ${f.subjectId ?? null}::uuid then 1.5 else 1 end) *
          (case when d.class_level = ${f.classLevel ?? null} then 1.3 else 1 end) *
          (case when d.term_number = ${f.termNumber ?? null}::int then 1.2 else 1 end) *
          (case when d.kind in ('lesson_note', 'textbook') then 1.2 else 1 end) as rank
      from kb_chunks c
      join kb_documents d on d.id = c.document_id,
        to_tsquery('english', ${q}) q
      where c.tsv @@ q
        and d.status = 'ready'
        ${f.subjectId ? sql`and (d.subject_id = ${f.subjectId}::uuid or d.subject_id is null)` : sql``}
        ${f.classLevel ? sql`and (d.class_level is null or d.class_level = ${f.classLevel})` : sql``}
        ${f.studentsOnly ? sql`and d.visible_to_students and d.kind <> 'marking_scheme'` : sql``}
        ${f.excludeKinds?.length ? sql`and d.kind::text not in (${sql.join(f.excludeKinds.map((k) => sql`${k}`), sql`, `)})` : sql``}
      order by rank desc
      limit ${f.limit ?? 6}
    `);
    return rows.rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      title: r.title,
      kind: r.kind,
      locator: r.locator,
      text: r.text,
      rank: Number(r.rank),
    }));
  }

  /** Numbered passages for a prompt, within a character budget. */
  static sourcesBlock(passages: Passage[]): { block: string; used: Passage[] } {
    const used: Passage[] = [];
    let budget = CONTEXT_CHARS;
    for (const p of passages) {
      if (budget <= 0) break;
      const text = p.text.slice(0, budget);
      budget -= text.length;
      used.push({ ...p, text });
    }
    const block = used.map((p, i) => `[${i + 1}] ${p.title}${p.locator ? ` (${p.locator})` : ''}\n${p.text}`).join('\n\n');
    return { block, used };
  }

  /**
   * Answers a staff question from the school's material, with citations. Without AI it returns
   * the best-matching passages, so the knowledge base is still useful before the key is added.
   */
  async ask(user: Principal, input: { question: string; subjectId?: string; classLevel?: string }) {
    const passages = await this.dbs.withSchool(user.schoolId, (tx) => this.search(tx, input.question, { ...input, limit: 6 }));
    const { block, used } = KnowledgeService.sourcesBlock(passages);
    if (!this.ai.enabled || used.length === 0) {
      return {
        answer: used.length
          ? 'AI answers are not switched on yet. These are the passages in your school’s material that best match the question.'
          : 'Nothing in your school’s material matches this question yet. Try other words, or upload the scheme of work or lesson notes for this topic.',
        passages: used.map((p, i) => ({ n: i + 1, ...citationOf(p), excerpt: p.text.slice(0, 400) })),
        citations: used.map(citationOf),
        coveredByMaterial: used.length > 0,
        source: 'search' as const,
      };
    }
    const out = await this.ai.json({
      feature: 'kb_answer',
      schoolId: user.schoolId,
      staffId: user.staffId,
      system:
        'You answer questions for teachers at a Nigerian school using the school’s own documents first. ' +
        'Cite each fact from a source inline as [n]. If the sources do not cover the question, say so in one sentence, then answer briefly from the Nigerian curriculum without citations.',
      prompt: `Sources from the school's knowledge base:\n\n${block}\n\nQuestion: ${input.question}`,
      schema: answerSchema,
      validate: answerZod,
      maxTokens: 3000,
    });
    const cited = out.sources.filter((n) => n >= 1 && n <= used.length).map((n) => used[n - 1]);
    return {
      answer: out.answer,
      passages: used.map((p, i) => ({ n: i + 1, ...citationOf(p), excerpt: p.text.slice(0, 400) })),
      citations: cited.map(citationOf),
      coveredByMaterial: out.coveredByMaterial,
      source: 'ai' as const,
    };
  }
}
