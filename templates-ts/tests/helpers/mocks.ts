import { jest } from '@jest/globals';

import type { Repo, TxContext, UnitOfWork } from '../../src/db/unit-of-work.js';

/**
 * Test doubles for unit tests.
 *
 * Services receive repositories as `Repo<T>` factories, so a unit test hands
 * them a function returning an object of `jest.fn()`s — no container to
 * reset, no database, no ORM. That the seam is this easy to fake is the
 * payoff for injecting dependencies rather than importing them.
 */

/** Wraps a plain object as a repository factory, ignoring the transaction. */
export function repoOf<T>(implementation: Partial<T>): Repo<T> {
  return () => implementation as T;
}

/**
 * A unit-of-work that simply runs the callback.
 *
 * Correct for unit tests: there is no database, so there is nothing to commit
 * or roll back. Transactional behaviour is what the *integration* tests are
 * for — asserting a rollback against a fake would only prove the fake works.
 */
export const fakeUnitOfWork: UnitOfWork = {
  async run<T>(work: (tx: TxContext) => Promise<T>): Promise<T> {
    return work(undefined as unknown as TxContext);
  },
};

/**
 * A hasher that is instant, unlike real Argon2.
 *
 * The digest is opaque rather than derived from the input — a fake that
 * returned `hashed:${plain}` would embed the plaintext, quietly defeating any
 * test asserting the password never reaches persistence.
 */
const fakeDigests = new Map<string, string>();

export const fakeHasher = {
  hash: jest.fn(async (plain: string) => {
    const digest = `$fake$${fakeDigests.size}$${'x'.repeat(16)}`;
    fakeDigests.set(digest, plain);
    return digest;
  }),
  verify: jest.fn(async (digest: string, plain: string) => fakeDigests.get(digest) === plain),
};

/** Captures sent mail so a test can assert on the link that was generated. */
export function fakeEmailService() {
  const sent: { to: string; subject: string; text: string }[] = [];

  return {
    sent,
    service: {
      send: jest.fn(async (message: { to: string; subject: string; text: string }) => {
        sent.push(message);
      }),
    },
  };
}
