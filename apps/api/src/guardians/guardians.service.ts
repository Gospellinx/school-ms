import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeNigerianPhone } from '@school-ms/core';
import { sql } from 'drizzle-orm';
import { Tx } from '../db/client';
import { guardians, studentGuardians } from '../db/schema';

export interface GuardianInput {
  fullName: string;
  phone: string;
  email?: string;
  preferredChannel?: 'sms' | 'whatsapp';
}

export function phoneOrThrow(phone: string): string {
  const normalised = normalizeNigerianPhone(phone);
  if (!normalised) throw new BadRequestException(`"${phone}" is not a valid Nigerian mobile number`);
  return normalised;
}

@Injectable()
export class GuardiansService {
  /** Creates a guardian, or updates the one with the same phone number (one parent, several children). */
  async upsert(tx: Tx, schoolId: string, input: GuardianInput) {
    const phone = phoneOrThrow(input.phone);
    const [row] = await tx
      .insert(guardians)
      .values({ schoolId, fullName: input.fullName, phone, email: input.email?.toLowerCase(), preferredChannel: input.preferredChannel })
      .onConflictDoUpdate({
        target: [guardians.schoolId, guardians.phone],
        set: {
          fullName: input.fullName,
          email: input.email ? input.email.toLowerCase() : sql`${guardians.email}`,
          preferredChannel: input.preferredChannel ?? sql`${guardians.preferredChannel}`,
        },
      })
      .returning();
    return row;
  }

  async link(tx: Tx, schoolId: string, guardianId: string, studentId: string, relationship?: string) {
    await tx
      .insert(studentGuardians)
      .values({ schoolId, guardianId, studentId, relationship })
      .onConflictDoUpdate({
        target: [studentGuardians.studentId, studentGuardians.guardianId],
        set: { relationship: relationship ?? sql`${studentGuardians.relationship}` },
      });
  }
}
