import argon2 from 'argon2';

/**
 * Password hashing.
 *
 * Lives outside any one module because two of them need it: user
 * administration creates hashes, and the auth module verifies them at login.
 *
 * Argon2id is used with parameters at or above the OWASP recommendation. The
 * cost lives in the encoded hash, so raising these values later is safe:
 * existing hashes keep verifying with the parameters they were created with.
 */

export interface PasswordHasher {
  hash(plainText: string): Promise<string>;
  verify(hash: string, plainText: string): Promise<boolean>;
}

const options = {
  type: argon2.argon2id,
  /** 64 MiB. */
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

export const passwordHasher: PasswordHasher = {
  async hash(plainText: string): Promise<string> {
    return argon2.hash(plainText, options);
  },

  /**
   * Returns false rather than throwing on a malformed or unrecognised hash —
   * a corrupt stored value is a failed login, not a 500.
   */
  async verify(hash: string, plainText: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainText);
    } catch {
      return false;
    }
  },
};
