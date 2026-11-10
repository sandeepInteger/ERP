import { z } from "zod";

// Error objects follow the HRMS convention: `throw { statusCode, message }`, picked up by
// the error handler in app.ts. `details` is passed through to the client when present.
export interface HttpError {
  statusCode: number;
  message: string;
  details?: unknown;
}

export function httpError(statusCode: number, message: string, details?: unknown): HttpError {
  return details === undefined ? { statusCode, message } : { statusCode, message, details };
}

export function notFound(what = "Not found"): HttpError {
  return httpError(404, what);
}

export function forbidden(message = "Forbidden"): HttpError {
  return httpError(403, message);
}

type Defined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/**
 * Drops keys whose value is undefined. zod `.optional()` fields come through as
 * `T | undefined`, which exactOptionalPropertyTypes rejects for Prisma inputs;
 * omitting the key is what "leave unchanged" means to Prisma anyway.
 */
export function defined<T extends Record<string, unknown>>(obj: T): Partial<Defined<T>> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<Defined<T>>;
}

/**
 * Query-string boolean. z.coerce.boolean() is wrong here: Boolean("false") is true.
 */
export const queryBool = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");

/** YYYY-MM-DD → a Date at UTC midnight, for @db.Date columns. */
export function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
