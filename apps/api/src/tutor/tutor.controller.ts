import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { StudentPrincipal } from '../auth/auth.types';
import { CurrentUser, ForAudience } from '../auth/decorators';
import { parse, uuidParam } from '../common/validation';
import { TUTOR_INTENTS, TutorService } from './tutor.service';

const startSchema = z.object({ subjectId: z.string().uuid(), topic: z.string().trim().max(120).optional() });
const sendSchema = z.object({ text: z.string().max(1000).optional(), intent: z.enum(TUTOR_INTENTS).default('ask') });
const quizSchema = z.object({ choice: z.string().regex(/^[A-Da-d]$/) });
const topicsQuery = z.object({ subjectId: z.string().uuid() });

/** The student's AI tutor: one conversation per subject and topic. */
@ForAudience('student')
@Controller('student/tutor')
export class TutorController {
  constructor(private readonly tutor: TutorService) {}

  @Get('topics')
  topics(@CurrentUser() s: StudentPrincipal, @Query() q: unknown) {
    return this.tutor.topics(s, parse(topicsQuery, q).subjectId);
  }

  @Get('conversations')
  list(@CurrentUser() s: StudentPrincipal) {
    return this.tutor.listConversations(s);
  }

  @Post('conversations')
  start(@CurrentUser() s: StudentPrincipal, @Body() body: unknown) {
    return this.tutor.startConversation(s, parse(startSchema, body));
  }

  @Get('conversations/:id')
  get(@CurrentUser() s: StudentPrincipal, @Param('id') id: string) {
    return this.tutor.getConversation(s, parse(uuidParam, id));
  }

  /** Sends a message (or a button: explain, example, quiz, hint) and returns the tutor's reply. */
  @Post('conversations/:id/messages')
  send(@CurrentUser() s: StudentPrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.tutor.send(s, parse(uuidParam, id), parse(sendSchema, body ?? {}));
  }

  @Post('messages/:id/quiz')
  answer(@CurrentUser() s: StudentPrincipal, @Param('id') id: string, @Body() body: unknown) {
    return this.tutor.answerQuiz(s, parse(uuidParam, id), parse(quizSchema, body).choice);
  }
}
