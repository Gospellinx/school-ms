import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { KnowledgeService } from './knowledge.service';

const kinds = ['scheme_of_work', 'lesson_note', 'past_questions', 'textbook', 'marking_scheme', 'other'] as const;
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Upload metadata travels in the query string; the request body is the file itself (application/octet-stream). */
const uploadQuery = z.object({
  title: z.string().trim().min(2).max(160),
  kind: z.enum(kinds),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().max(120).optional(),
  subjectId: z.string().uuid().optional(),
  classLevel: z.string().trim().max(40).optional(),
  termNumber: z.coerce.number().int().min(1).max(3).optional(),
  visibleToStudents: bool.optional(),
});
const patchSchema = z.object({
  title: z.string().trim().min(2).max(160).optional(),
  kind: z.enum(kinds).optional(),
  subjectId: z.string().uuid().nullable().optional(),
  classLevel: z.string().trim().max(40).nullable().optional(),
  termNumber: z.number().int().min(1).max(3).nullable().optional(),
  visibleToStudents: z.boolean().optional(),
});
const listQuery = z.object({ subjectId: z.string().uuid().optional(), classLevel: z.string().max(40).optional() });
const askSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  subjectId: z.string().uuid().optional(),
  classLevel: z.string().max(40).optional(),
});

/** The school knowledge base, for staff: upload, manage and ask questions of the school's own material. */
@Controller('kb')
export class KnowledgeController {
  constructor(private readonly kb: KnowledgeService) {}

  @Post('documents')
  upload(@CurrentUser() u: Principal, @Query() q: unknown, @Req() req: Request) {
    const input = parse(uploadQuery, q);
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    return this.kb.upload(u, input, data);
  }

  @Get('documents')
  list(@CurrentUser() u: Principal, @Query() q: unknown) {
    return this.kb.list(u.schoolId, parse(listQuery, q));
  }

  @Get('documents/:id')
  get(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.kb.get(u.schoolId, parse(uuidParam, id));
  }

  /** The original file, for staff to download. */
  @Get('documents/:id/file')
  async file(@CurrentUser() u: Principal, @Param('id') id: string, @Res() res: Response) {
    const f = await this.kb.file(u.schoolId, parse(uuidParam, id));
    res.setHeader('content-type', f.mimeType);
    res.setHeader('content-disposition', `attachment; filename="${f.fileName.replace(/["\r\n]/g, '')}"`);
    res.send(f.data);
  }

  @Patch('documents/:id')
  update(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.kb.update(u, parse(uuidParam, id), parse(patchSchema, body));
  }

  @Delete('documents/:id')
  remove(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.kb.remove(u, parse(uuidParam, id));
  }

  /** Reads the file again, e.g. a scan or photo after AI is switched on. */
  @Post('documents/:id/reprocess')
  reprocess(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.kb.reprocess(u, parse(uuidParam, id));
  }

  /** Answers a question from the school's material, with citations. */
  @Post('ask')
  ask(@CurrentUser() u: Principal, @Body() body: unknown) {
    return this.kb.ask(u, parse(askSchema, body));
  }
}
