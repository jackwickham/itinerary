import type { ZodError } from 'zod';

/** An error with an HTTP status that is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(what: string) {
    super(404, `${what} not found`);
  }
}

export function formatZodError(err: ZodError): string {
  return err.issues
    .map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

export function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid id "${value}"`);
  return id;
}
