import type { RequestHandler } from 'express';

/**
 * The guard contract every module's router is handed.
 *
 * Declared in core rather than in whichever module happened to need it first,
 * so no module depends on another for it. The auth module supplies the real
 * implementations; tests supply stubs.
 */

/** Produces middleware that rejects a request lacking the named action. */
export type AuthorizeFactory = (action: string) => RequestHandler;

export interface RouteGuards {
  /** Verifies credentials and attaches the caller's identity to the request. */
  authenticate: RequestHandler;
  /**
   * Checks the caller holds a named action. Always an action, never a role —
   * roles are a grouping that changes per project, actions are the stable
   * vocabulary code is written against.
   */
  authorize: AuthorizeFactory;
}
