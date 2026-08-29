/**
 * Persistence errors that services are expected to handle.
 *
 * Each ORM adapter translates its native error into one of these, so a
 * service can react to "that violated a unique index" without knowing which
 * ORM raised it.
 */

/**
 * Thrown by a repository when the database rejects a write for violating a
 * unique constraint.
 *
 * Checking for an existing row before inserting cannot be relied on: two
 * concurrent requests both see nothing and both insert. The unique index is
 * the only real guarantee, so writes are attempted and this is the failure
 * services map to a 409.
 */
export class UniqueViolationError extends Error {
  constructor(readonly constraint?: string) {
    super(`Unique constraint violated${constraint ? `: ${constraint}` : ''}`);
    this.name = 'UniqueViolationError';
  }
}

export function isUniqueViolation(error: unknown): error is UniqueViolationError {
  return error instanceof UniqueViolationError;
}

/** Postgres SQLSTATE for a unique violation. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * Properties under which an ORM may hide the underlying driver error.
 *
 * Every ORM wraps driver errors, and each picks a different property to do it
 * — Drizzle nests the `pg` error under `cause`, Sequelize under `parent` and
 * `original`. Matching on the SQLSTATE found anywhere in that chain is both
 * simpler and more durable than matching on an ORM's error class, which is
 * free to change between releases.
 */
const WRAPPED_ERROR_KEYS = ['cause', 'parent', 'original'] as const;

/**
 * Returns a `UniqueViolationError` if the given error — or anything it wraps
 * — is a Postgres unique violation.
 */
export function asUniqueViolation(error: unknown): UniqueViolationError | undefined {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    const candidate = current as Record<string, unknown>;

    if (candidate.code === PG_UNIQUE_VIOLATION) {
      const constraint =
        typeof candidate.constraint === 'string' ? candidate.constraint : undefined;
      return new UniqueViolationError(constraint);
    }

    for (const key of WRAPPED_ERROR_KEYS) {
      if (candidate[key]) queue.push(candidate[key]);
    }
  }

  return undefined;
}

/**
 * Wraps a write so constraint violations surface as domain errors.
 *
 * Shared by both ORM adapters — the SQLSTATE is a property of Postgres, not
 * of the ORM, so one implementation serves both.
 */
export async function translateWriteErrors<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const violation = asUniqueViolation(error);
    if (violation) throw violation;
    throw error;
  }
}
