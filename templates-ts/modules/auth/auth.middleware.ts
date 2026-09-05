import type { RequestHandler } from 'express';

import type { AuthorizeFactory, RouteGuards } from '../../core/middleware/auth.types.js';
import { annotate } from '../../core/middleware/route-metadata.js';

import type { AuthController } from './auth.controller.js';
import { forbidden, invalidAccessToken, missingCredentials } from './auth.errors.js';
import { verifyAccessToken } from './auth.tokens.js';
import type { AuthenticatedUser } from './auth.types.js';

/**
 * The real guards, replacing the stubs every module's router was written
 * against.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `authenticate`. Absent on unauthenticated routes. */
      user?: AuthenticatedUser;
    }
  }
}

const BEARER = /^Bearer (.+)$/i;

export function createAuthGuards(controller: AuthController): RouteGuards {
  /**
   * Verifies the access token, then loads the caller's identity and current
   * permissions from the database.
   *
   * Permissions are resolved per request rather than embedded in the token.
   * That costs one indexed query, and buys correctness: revoking a role takes
   * effect immediately instead of whenever the last issued token happens to
   * expire. If that query ever shows up in a profile, cache it by user id
   * with a short TTL — but start correct.
   */
  const authenticate: RequestHandler = async (req, _res, next) => {
    const header = req.headers.authorization;
    const match = header ? BEARER.exec(header) : null;

    if (!match?.[1]) {
      next(missingCredentials());
      return;
    }

    let userId: string;
    try {
      const claims = await verifyAccessToken(match[1]);
      userId = claims.sub;
    } catch {
      // Signature, expiry, issuer and audience failures are all one answer to
      // the client — the distinction only helps an attacker.
      next(invalidAccessToken());
      return;
    }

    // A token can outlive the account it names: deleted, deactivated, or
    // simply gone since the token was minted.
    const user = await controller.loadAuthenticatedUser(userId);
    if (!user) {
      next(invalidAccessToken());
      return;
    }

    req.user = user;
    next();
  };

  /**
   * Checks the caller holds a named action.
   *
   * Always an action, never a role. Roles are a grouping that shifts per
   * project and per customer; actions are the vocabulary the code is written
   * against, so a route's requirement stays true no matter how roles are
   * reorganised around it.
   */
  const authorize: AuthorizeFactory = (action: string): RequestHandler => {
    const handler: RequestHandler = (req, _res, next) => {
      // Defence in depth: reaching here without `authenticate` in front is a
      // wiring bug, and it must fail closed rather than allow the request.
      if (!req.user) {
        next(missingCredentials());
        return;
      }

      if (!req.user.actions.includes(action)) {
        next(forbidden(action));
        return;
      }

      next();
    };

    // Records which action this route demands, so it can be documented
    // without the action being written down a second time.
    return annotate(handler, { action });
  };

  return { authenticate: annotate(authenticate, { authenticates: true }), authorize };
}
