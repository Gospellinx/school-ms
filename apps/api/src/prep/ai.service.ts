import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ZodType } from 'zod';
import { config } from '../common/config';
import { DbService } from '../db/db.service';
import { aiUsage } from '../db/schema';

export interface JsonRequest<T> {
  /** Recorded in ai_usage, e.g. prep_plan, explain, question_drafts, report_comment. */
  feature: string;
  schoolId: string;
  studentId?: string;
  staffId?: string;
  system: string;
  prompt: string;
  /** JSON Schema the reply must match (structured outputs). */
  schema: Record<string, unknown>;
  /** Second check on our side, and the TypeScript type of the result. */
  validate: ZodType<T>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high';
}

/**
 * The one place the API talks to Claude. Every call returns JSON matching a schema and is
 * logged in ai_usage for cost tracking. Needs ANTHROPIC_API_KEY; AI_MODEL overrides the model.
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

  async json<T>(req: JsonRequest<T>): Promise<T> {
    const model = config.ai().model;
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.anthropic().beta.messages.create({
        model,
        max_tokens: req.maxTokens ?? 8000,
        // If the model declines a request (e.g. a false positive), the API retries on a suitable fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { effort: req.effort ?? 'low', format: { type: 'json_schema', schema: req.schema } },
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
        }),
      )
      .catch((err) => this.logger.warn(`Could not record AI usage: ${(err as Error).message}`));

    if (response.stop_reason === 'refusal') throw new BadGatewayException('The AI tutor could not answer that');
    if (response.stop_reason === 'max_tokens') throw new BadGatewayException('The AI reply was cut short');
    const text = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
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
}
