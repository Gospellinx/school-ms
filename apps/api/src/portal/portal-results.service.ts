import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { formatNaira } from '@school-ms/core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Tx } from '../db/client';
import { academicSessions, resultPublications, schools, scores, studentGuardians, terms } from '../db/schema';
import { DbService } from '../db/db.service';
import { FeesService } from '../fees/fees.service';
import { ResultsService } from '../results/results.service';
import { planReleasesResults } from '../autopilot/plans';

/** Rules for what parents and students may see: published results only, and fees if the school requires it. */
@Injectable()
export class PortalResultsService {
  constructor(
    private readonly dbs: DbService,
    private readonly results: ResultsService,
    private readonly fees: FeesService,
  ) {}

  async assertGuardianOf(tx: Tx, guardianId: string, studentId: string) {
    const [link] = await tx
      .select()
      .from(studentGuardians)
      .where(and(eq(studentGuardians.guardianId, guardianId), eq(studentGuardians.studentId, studentId)));
    if (!link) throw new NotFoundException('Student not found');
  }

  /** Terms for which this student's class results have been published, newest first. */
  async publishedTerms(tx: Tx, studentId: string) {
    const scored = await tx.selectDistinct({ termId: scores.termId, classId: scores.classId }).from(scores).where(eq(scores.studentId, studentId));
    if (scored.length === 0) return [];
    const pubs = await tx
      .select({ termId: resultPublications.termId, classId: resultPublications.classId, publishedAt: resultPublications.publishedAt })
      .from(resultPublications)
      .where(inArray(resultPublications.termId, scored.map((s) => s.termId)));
    const published = scored.filter((s) => pubs.some((p) => p.termId === s.termId && p.classId === s.classId));
    if (published.length === 0) return [];
    const rows = await tx
      .select({ id: terms.id, name: terms.name, number: terms.number, session: academicSessions.name })
      .from(terms)
      .innerJoin(academicSessions, eq(academicSessions.id, terms.sessionId))
      .where(inArray(terms.id, published.map((p) => p.termId)))
      .orderBy(desc(academicSessions.name), desc(terms.number));
    return rows;
  }

  async reportCard(schoolId: string, studentId: string, termId: string) {
    return this.dbs.withSchool(schoolId, async (tx) => {
      const classId = await this.results.resultClassId(tx, termId, studentId);
      if (!classId || !(await this.results.isPublished(tx, termId, classId))) {
        throw new NotFoundException('This result has not been released yet');
      }
      const [school] = await this.dbs.db.select().from(schools).where(eq(schools.id, schoolId));
      if (school.withholdResultsForDebt) {
        const owed = await this.fees.balanceFor(tx, termId, studentId);
        if (owed > 0 && !(await planReleasesResults(tx, termId, studentId))) {
          throw new HttpException(
            { message: `Please clear the outstanding fees of ${formatNaira(owed)} to view this result`, balanceKobo: owed },
            HttpStatus.PAYMENT_REQUIRED,
          );
        }
      }
      return this.results.buildReportCard(tx, schoolId, termId, studentId);
    });
  }
}

