import { Body, Controller, Delete, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { Principal } from '../auth/auth.types';
import { CurrentUser, LEADERSHIP, Roles } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { LessonBookService } from './lesson-book.service';

const bookQuery = z.object({ classId: z.string().uuid(), subjectId: z.string().uuid(), termId: z.string().uuid().optional() });
const overviewQuery = z.object({ termId: z.string().uuid().optional() });
const vetSchema = z.object({ comment: z.string().trim().max(500).nullish() });
const weekSchema = z.object({ week: z.number().int().min(1).max(16).nullable() });

/** Lesson notes books for inspection, and vetting by the head of school. */
@Controller('lesson-book')
export class LessonBookController {
  constructor(private readonly book: LessonBookService) {}

  @Get()
  get(@CurrentUser() u: Principal, @Query() q: unknown) {
    const { classId, subjectId, termId } = parse(bookQuery, q);
    return this.book.book(u, classId, subjectId, termId);
  }

  @Roles(...LEADERSHIP)
  @Get('overview')
  overview(@CurrentUser() u: Principal, @Query() q: unknown) {
    return this.book.overview(u, parse(overviewQuery, q).termId);
  }

  @Roles(...LEADERSHIP)
  @Put(':id/vet')
  vet(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.book.vet(u, parse(uuidParam, id), parse(vetSchema, body ?? {}).comment || null);
  }

  @Roles(...LEADERSHIP)
  @Delete(':id/vet')
  unvet(@CurrentUser() u: Principal, @Param('id') id: string) {
    return this.book.unvet(u, parse(uuidParam, id));
  }

  @Patch(':id')
  setWeek(@CurrentUser() u: Principal, @Param('id') id: string, @Body() body: unknown) {
    return this.book.setWeek(u, parse(uuidParam, id), parse(weekSchema, body).week);
  }
}
