import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { ZodType } from 'zod';
import { todayInLagos } from '../common/access';
import { config, costMicroUsd } from '../common/config';
import { Tx } from '../db/client';
import { DbService } from '../db/db.service';
import { aiUsage, schools } from '../db/schema';

interface AiRequestBase {
  /** Recorded in ai_usage, e.g. prep_plan, explain, tutor, kb_answer, kb_transcribe. */
  feature: string;
  schoolId: string;
  studentId?: string;
  staffId?: string;
  system: string;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
  /** Overrides AI_MODEL for this call (e.g. AI_TUTOR_MODEL for chat). */
  model?: string;
}

export interface JsonRequest<T> extends AiRequestBase {
  /** A single user turn. Use `messages` instead for a conversation. */
  prompt?: string;
  messages?: Anthropic.Beta.BetaMessageParam[];
  /** JSON Schema the reply must match (structured outputs). */
  schema: Record<string, unknown>;
  /** Second check on our side, and the TypeScript type of the result. */
  validate: ZodType<T>;
}

export interface TextRequest extends AiRequestBase {
  content: Anthropic.Beta.BetaContentBlockParam[];
}

/** Start of the current month in Nigeria, for the school's monthly AI budget. */
function monthStart(): string {
  return `${todayInLagos().slice(0, 8)}01T00:00:00+01:00`;
}

/**
 * The one place the API talks to Claude. Every call is checked against the school's monthly
 * budget, logged in ai_usage with its estimated cost, and (for json) returns data matching a
 * schema. Needs ANTHROPIC_API_KEY; without it every AI feature falls back to a stand-in.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client?: Anthropic;

  constructor(private readonly dbs: DbService) {}

  get enabled(): boolean {
    return Boolean(config.ai().apiKey);
  }

  private anthropic(): Anthropic {
    if (!this.enabled) throw new ServiceUnavailableException('AI features are not set up yet (ANTHROPIC_API_KEY is missing)');
    this.client ??= new Anthropic({ apiKey: config.ai().apiKey });
    return this.client;
  }

  // ------------------------------------------------------------ Limits

  /** This month's spend and the cap, in US cents. */
  async budget(schoolId: string) {
    const [school] = await this.dbs.db.select({ cap: schools.aiMonthlyBudgetCents }).from(schools).where(eq(schools.id, schoolId));
    const [{ micro }] = await this.dbs.withSchool(schoolId, (tx) =>
      tx
        .select({ micro: sql<number>`coalesce(sum(${aiUsage.costMicroUsd}), 0)::bigint` })
        .from(aiUsage)
        .where(gte(aiUsage.createdAt, sql`${monthStart()}::timestamptz`)),
    );
    const spentCents = Math.round(Number(micro) / 10_000);
    return { spentCents, capCents: school?.cap ?? 0, remainingCents: Math.max(0, (school?.cap ?? 0) - spentCents) };
  }

  private async assertBudget(schoolId: string) {
    const b = await this.budget(schoolId);
    if (b.spentCents >= b.capCents) {
      throw new HttpException('Your school has used this month’s AI allowance. Ask the school to raise it, or try again next month.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** How many AI calls a student may make per day (tutor replies, explanations, plans). */
  async studentDailyLimit(schoolId: string): Promise<number> {
    const [school] = await this.dbs.db.select({ limit: schools.aiStudentDailyLimit }).from(schools).where(eq(schools.id, schoolId));
    return school?.limit ?? config.ai().dailyLimitPerStudent;
  }

  /** Throws 429 once the student has used today's allowance. Call inside the school's transaction. */
  async assertStudentAllowance(tx: Tx, schoolId: string, studentId: string) {
    const limit = await this.studentDailyLimit(schoolId);
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(and(eq(aiUsage.studentId, studentId), gte(aiUsage.createdAt, sql`now() - interval '1 day'`)));
    if (n >= limit) throw new HttpException('You have used today’s AI tutor allowance. Try again tomorrow.', HttpStatus.TOO_MANY_REQUESTS);
  }

  // ------------------------------------------------------------ Calls

  private async call(req: AiRequestBase, messages: Anthropic.Beta.BetaMessageParam[], format?: Record<string, unknown>) {
    await this.assertBudget(req.schoolId);
    const model = req.model ?? config.ai().model;
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.anthropic().beta.messages.create({
        model,
        max_tokens: req.maxTokens ?? 8000,
        // If the model declines a request (e.g. a false positive), the API retries on a suitable fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        messages,
        output_config: { effort: req.effort ?? 'low', ...(format ? { format: { type: 'json_schema', schema: format } } : {}) },
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new ServiceUnavailableException('The AI tutor is busy. Try again in a minute.');
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Claude API ${err.status}: ${err.message}`);
        throw new BadGatewayException('The AI tutor is unavailable right now');
      }
      throw err;
    }

    await this.dbs
      .withSchool(req.schoolId, (tx) =>
        tx.insert(aiUsage).values({
          schoolId: req.schoolId,
          feature: req.feature,
          studentId: req.studentId,
          staffId: req.staffId,
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costMicroUsd: costMicroUsd(response.model, response.usage.input_tokens, response.usage.output_tokens),
        }),
      )
      .catch((err) => this.logger.warn(`Could not record AI usage: ${(err as Error).message}`));

    if (response.stop_reason === 'refusal') throw new BadGatewayException('The AI tutor could not answer that');
    if (response.stop_reason === 'max_tokens') throw new BadGatewayException('The AI reply was cut short');
    return response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  }

  async json<T>(req: JsonRequest<T>): Promise<T> {
    const messages = req.messages ?? [{ role: 'user' as const, content: req.prompt ?? '' }];
    const text = await this.call(req, messages, req.schema);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new BadGatewayException('The AI reply was not valid JSON');
    }
    const result = req.validate.safeParse(parsed);
    if (!result.success) throw new BadGatewayException('The AI reply did not match the expected format');
    return result.data;
  }

  /** Plain-text reply, e.g. transcribing a scanned page or photo for the knowledge base. */
  text(req: TextRequest): Promise<string> {
    return this.call(req, [{ role: 'user', content: req.content }]);
  }
}
