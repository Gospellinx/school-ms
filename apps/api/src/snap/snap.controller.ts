import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { SnapService } from './snap.service';

const snapQuery = z.object({ mimeType: z.string().max(60).default('image/jpeg') });

/** Snap-to-score. The photo is the request body (application/octet-stream); it is read, not stored. */
@Controller()
export class SnapController {
  constructor(private readonly snap: SnapService) {}

  @Get('snap/status')
  status() {
    return this.snap.status();
  }

  /** Reads a photo of a handwritten score sheet and returns the scores per student, for the teacher to check. Saves nothing. */
  @Post('terms/:termId/classes/:classId/subjects/:subjectId/scores/snap')
  read(
    @CurrentUser() u: Principal,
    @Param('termId') t: string,
    @Param('classId') c: string,
    @Param('subjectId') s: string,
    @Query() q: unknown,
    @Req() req: Request,
  ) {
    const { mimeType } = parse(snapQuery, q);
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    return this.snap.read(u, parse(uuidParam, t), parse(uuidParam, c), parse(uuidParam, s), data, mimeType);
  }
}
