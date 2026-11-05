import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { normalizeNigerianPhone } from '@school-ms/core';
import bcrypt from 'bcryptjs';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { DbService } from '../db/db.service';
import { guardians, loginCodes, schools, students } from '../db/schema';
import { MessagingProvider } from '../messaging/messaging.provider';
import { AuthService } from './auth.service';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const PIN_LOCK_FAILURES = 10;
const PIN_LOCK_MS = 15 * 60 * 1000;

function codeSecret(): string {
  return process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
}

/** Logins for parents (one-time code by SMS) and students (admission number and PIN). */
@Injectable()
export class PortalAuthService {
  private readonly logger = new Logger(PortalAuthService.name);
  /** Failed PIN logins per school+admission number. In memory: resets on restart, per instance. */
  private readonly pinFailures = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly dbs: DbService,
    private readonly auth: AuthService,
    private readonly messaging: MessagingProvider,
  ) {}

  private hashCode(guardianId: string, code: string): string {
    return createHmac('sha256', codeSecret()).update(`${guardianId}:${code}`).digest('hex');
  }

  private async schoolBySlug(slug: string) {
    const [school] = await this.dbs.db.select().from(schools).where(eq(schools.slug, slug));
    return school;
  }

  /**
   * Texts a 6-digit login code to a parent's phone. Always answers the same way,
   * so it cannot be used to find out which numbers are registered.
   */
  async requestParentCode(schoolSlug: string, rawPhone: string): Promise<{ sent: true }> {
    const school = await this.schoolBySlug(schoolSlug);
    const phone = normalizeNigerianPhone(rawPhone);
    if (!school || !phone) return { sent: true };

    const issued = await this.dbs.withSchool(school.id, async (tx) => {
      const [guardian] = await tx.select().from(guardians).where(eq(guardians.phone, phone));
      if (!guardian) return null;
      const [{ recent }] = await tx
        .select({ recent: sql<number>`count(*)::int` })
        .from(loginCodes)
        .where(and(eq(loginCodes.guardianId, guardian.id), gt(loginCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
      if (recent >= MAX_CODES_PER_HOUR) {
        throw new HttpException('Too many codes requested. Try again in an hour.', HttpStatus.TOO_MANY_REQUESTS);
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await tx.insert(loginCodes).values({
        schoolId: school.id,
        guardianId: guardian.id,
        codeHash: this.hashCode(guardian.id, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      });
      return { guardian, code };
    });
    if (!issued) return { sent: true };

    try {
      await this.messaging.send({
        channel: 'sms',
        to: issued.guardian.phone,
        body: `Your ${school.name} parent login code is ${issued.code}. It expires in 10 minutes. Do not share it.`,
        transactional: true,
      });
    } catch (err) {
      this.logger.error(`Could not send login code: ${(err as Error).message}`);
      throw new ServiceUnavailableException('We could not send the code. Please try again.');
    }
    return { sent: true };
  }

  async verifyParentCode(schoolSlug: string, rawPhone: string, code: string) {
    const school = await this.schoolBySlug(schoolSlug);
    const phone = normalizeNigerianPhone(rawPhone);
    const wrong = new UnauthorizedException('Wrong or expired code');
    if (!school || !phone) throw wrong;

    const guardian = await this.dbs.withSchool(school.id, async (tx) => {
      const [g] = await tx.select().from(guardians).where(eq(guardians.phone, phone));
      if (!g) return null;
      const [pending] = await tx
        .select()
        .from(loginCodes)
        .where(and(eq(loginCodes.guardianId, g.id), isNull(loginCodes.usedAt), gt(loginCodes.expiresAt, new Date())))
        .orderBy(desc(loginCodes.createdAt))
        .limit(1);
      if (!pending || pending.attempts >= MAX_CODE_ATTEMPTS) return null;
      const expected = Buffer.from(pending.codeHash, 'hex');
      const actual = Buffer.from(this.hashCode(g.id, code.trim()), 'hex');
      if (!timingSafeEqual(expected, actual)) {
        await tx.update(loginCodes).set({ attempts: pending.attempts + 1 }).where(eq(loginCodes.id, pending.id));
        return null;
      }
      await tx.update(loginCodes).set({ usedAt: new Date() }).where(eq(loginCodes.id, pending.id));
      return g;
    });
    if (!guardian) throw wrong;
    return {
      token: await this.auth.sign(guardian.id, school.id, 'parent'),
      guardian: { id: guardian.id, fullName: guardian.fullName },
      school: { id: school.id, name: school.name },
    };
  }

  async studentLogin(schoolSlug: string, admissionNumber: string, pin: string) {
    const key = `${schoolSlug}::${admissionNumber.toUpperCase()}`;
    const lock = this.pinFailures.get(key);
    if (lock && lock.count >= PIN_LOCK_FAILURES && lock.until > Date.now()) {
      throw new HttpException('Too many wrong PINs. Ask your teacher or wait 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const wrong = new UnauthorizedException('Wrong admission number or PIN');
    const school = await this.schoolBySlug(schoolSlug);
    if (!school) throw wrong;
    const [student] = await this.dbs.withSchool(school.id, (tx) =>
      tx.select().from(students).where(sql`upper(${students.admissionNumber}) = ${admissionNumber.toUpperCase()}`),
    );
    if (!student?.pinHash || !(await bcrypt.compare(pin, student.pinHash))) {
      const current = lock && lock.until > Date.now() ? lock.count : 0;
      this.pinFailures.set(key, { count: current + 1, until: Date.now() + PIN_LOCK_MS });
      throw wrong;
    }
    this.pinFailures.delete(key);
    return {
      token: await this.auth.sign(student.id, school.id, 'student'),
      student: { id: student.id, name: `${student.lastName} ${student.firstName}`, admissionNumber: student.admissionNumber },
      school: { id: school.id, name: school.name },
    };
  }
}

/** A 6-digit PIN students can type on a phone or exam-hall computer. */
export function newPin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
