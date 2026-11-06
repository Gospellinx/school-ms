import { BadRequestException, Injectable, PayloadTooLargeException, ServiceUnavailableException } from '@nestjs/common';
import { matchReadRows, ReadRow } from '@school-ms/core';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { AiService } from '../prep/ai.service';
import { ResultsService } from '../results/results.service';

/** Claude reads images up to about 5 MB; the web app shrinks photos well below this before sending. */
export const SNAP_MAX_BYTES = 5 * 1024 * 1024;
const SNAP_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type SnapType = (typeof SNAP_TYPES)[number];

const SYSTEM =
  'You read photos of handwritten score sheets from Nigerian schools for a teacher, who will check every number before it is saved. ' +
  'Accuracy matters more than completeness: when a digit could be read two ways, give your best reading and mark that box as unclear. ' +
  'Never guess a number for an empty box, and never copy a number from another row.';

const readZod = z.object({
  rows: z.array(
    z.object({
      line: z.number().int(),
      name: z.string(),
      admissionNumber: z.string(),
      scores: z.array(z.object({ key: z.string(), value: z.number() })),
      unclear: z.array(z.string()),
    }),
  ),
  notes: z.string(),
});

function readSchema(keys: string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['rows', 'notes'],
    properties: {
      rows: {
        type: 'array',
        description: 'One entry per student row on the sheet, top to bottom.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['line', 'name', 'admissionNumber', 'scores', 'unclear'],
          properties: {
            line: { type: 'integer', description: 'Row number on the sheet, from 1.' },
            name: { type: 'string', description: 'The name exactly as written on the sheet.' },
            admissionNumber: { type: 'string', description: 'Admission number if written on the row, otherwise an empty string.' },
            scores: {
              type: 'array',
              description: 'Only boxes with a number written in them. Leave out empty boxes.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['key', 'value'],
                properties: { key: { type: 'string', enum: keys }, value: { type: 'number' } },
              },
            },
            unclear: { type: 'array', items: { type: 'string', enum: keys }, description: 'Boxes on this row that were hard to read.' },
          },
        },
      },
      notes: {
        type: 'string',
        description: 'One or two sentences for the teacher about anything to check, e.g. a column you could not match, a torn corner or a blurry area. Empty if none.',
      },
    },
  };
}

/**
 * Snap-to-score: reads a photo of a handwritten score sheet and matches each row to the class list.
 * Nothing is saved here. The teacher checks the reading against the photo and then saves through the
 * normal score sheet, so every score still passes the usual checks and is recorded as theirs.
 */
@Injectable()
export class SnapService {
  constructor(
    private readonly ai: AiService,
    private readonly results: ResultsService,
  ) {}

  status() {
    return { enabled: this.ai.enabled, maxBytes: SNAP_MAX_BYTES };
  }

  async read(user: Principal, termId: string, classId: string, subjectId: string, data: Buffer, mimeType: string) {
    if (!this.ai.enabled) {
      throw new ServiceUnavailableException('Reading score sheet photos needs AI, which is not switched on for your school yet. Type the scores for now.');
    }
    if (!data.length) throw new BadRequestException('The photo is empty');
    if (data.length > SNAP_MAX_BYTES) throw new PayloadTooLargeException('The photo is too large. Try again: the app shrinks it before sending.');
    const type = SNAP_TYPES.find((t) => t === mimeType);
    if (!type) throw new BadRequestException('Send a JPG, PNG or WebP photo');

    // Checks the term, the class and that this teacher takes the subject there.
    const sheet = await this.results.scoreSheet(user, termId, classId, subjectId);
    if (!sheet.rows.length) throw new BadRequestException('There are no students in this class yet');
    const components = sheet.components;
    const keys = components.map((c) => c.key);

    const columns = components.map((c) => `- "${c.key}": ${c.label} (out of ${c.maxScore})`).join('\n');
    const classList = sheet.rows.map((r, i) => `${i + 1}. ${r.name} (${r.admissionNumber})`).join('\n');
    const out = await this.ai.json({
      feature: 'snap_score',
      schoolId: user.schoolId,
      staffId: user.staffId,
      system: SYSTEM,
      effort: 'medium',
      maxTokens: 12000,
      schema: readSchema(keys),
      validate: readZod,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type as SnapType, data: data.toString('base64') } },
            {
              type: 'text',
              text:
                'This is a photo of a handwritten score sheet. Read every student row.\n\n' +
                `The score columns in our system are:\n${columns}\n\n` +
                'Match the sheet’s column headings to these keys (e.g. "1st C.A", "CA 1" and "Test 1" are usually the first CA). ' +
                'If the sheet has a Total or Grade column, ignore it. If a heading matches none of the keys, leave that column out and say so in notes.\n\n' +
                `The class list, to help you read the handwriting of names (write each name as it appears on the sheet, not as listed here):\n${classList}`,
            },
          ],
        },
      ],
    });

    const read: ReadRow[] = out.rows.map((r) => ({
      line: r.line,
      name: r.name.trim(),
      admissionNumber: r.admissionNumber.trim() || null,
      scores: Object.fromEntries(r.scores.filter((s) => keys.includes(s.key)).map((s) => [s.key, s.value])),
      unclear: r.unclear.filter((k) => keys.includes(k)),
    }));
    const roster = sheet.rows.map((r) => ({ studentId: r.studentId, name: r.name, admissionNumber: r.admissionNumber }));
    const match = matchReadRows(roster, read, components);
    return { components, ...match, notes: out.notes.trim() || null };
  }
}
