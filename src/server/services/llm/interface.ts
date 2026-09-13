import type { z } from 'zod';
import { toProviderJsonSchema } from '../../../shared/schemas.js';

export enum ReasoningLevel {
  MINIMAL = 'minimal',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface LLMOptions {
  reasoning?: ReasoningLevel;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/** A document (e.g. a PDF e-ticket) attached to the final user message. */
export interface LLMFile {
  filename: string;
  mimeType: string;
  base64: string;
}

/**
 * What a request is for, which picks the configured model. Extraction turns a
 * booking email into itinerary entries; matching decides which trip they belong to.
 */
export type LLMTask = 'extract' | 'match';

export interface LLMRequest {
  task: LLMTask;
  systemPrompt?: string;
  messages: Message[];
  files?: LLMFile[];
  options?: LLMOptions;
}

export interface StructuredRequest<T> extends LLMRequest {
  /** Constrains generation and validates the reply. */
  schema: z.ZodType<T>;
  /** Provider-facing schema identifier: letters, digits and underscores. */
  schemaName: string;
}

export interface LLM {
  /** Schema-constrained reply, parsed and validated against `schema`. */
  completeStructured<T>(request: StructuredRequest<T>): Promise<T>;
}

/** Raised when a provider replies with something that isn't usable. */
export class LLMResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMResponseError';
  }
}

/**
 * Shared behaviour for every provider. Subclasses supply the transport; schema
 * conversion, JSON parsing and validation happen once, here.
 */
export abstract class BaseLLM implements LLM {
  /** Issue a request constrained to `jsonSchema` and return the raw JSON text. */
  protected abstract completeJson(
    request: LLMRequest,
    schema: { name: string; jsonSchema: Record<string, unknown> },
  ): Promise<string>;

  async completeStructured<T>({ schema, schemaName, ...request }: StructuredRequest<T>): Promise<T> {
    const raw = await this.completeJson(request, {
      name: schemaName,
      jsonSchema: toProviderJsonSchema(schema),
    });
    return parseAgainstSchema(schema, raw, schemaName);
  }
}

/** Parse provider JSON text and validate it, with errors that name the offending fields. */
export function parseAgainstSchema<T>(schema: z.ZodType<T>, raw: string, schemaName: string): T {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new LLMResponseError(
      `Expected JSON for "${schemaName}" but the model returned: ${raw.slice(0, 200)}`,
    );
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new LLMResponseError(`Model response did not match the "${schemaName}" schema - ${problems}`);
  }

  return result.data;
}
