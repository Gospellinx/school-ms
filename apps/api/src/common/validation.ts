import { BadRequestException, NotFoundException } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';

export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid request',
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

export const uuidParam = z.string().uuid();

export function found<T>(row: T | undefined, what: string): T {
  if (!row) throw new NotFoundException(`${what} not found`);
  return row;
}

/** Turns a Postgres unique-violation into a readable 400 instead of a 500. */
export function rethrowUnique(err: unknown, message: string): never {
  const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === '23505') throw new BadRequestException(message);
  throw err;
}
