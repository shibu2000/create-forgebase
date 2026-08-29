import type { Express, RequestHandler, Router } from 'express';

import type { ValidationSchemas } from './validate.js';

/**
 * The two things OpenAPI generation needs that Express does not expose:
 * where each router is mounted, and what each handler expects.
 *
 * Both are recorded as the application assembles itself, rather than
 * reconstructed afterwards. Express 5 keeps mount paths only inside compiled
 * matcher functions, and a handler's zod schemas are a closure variable — so
 * anything that tried to recover them by inspection would be reading private
 * internals, and would break on a patch release.
 *
 * Nothing here is coupled to the documentation fragment. If it is not
 * installed, this is a list nobody reads and a few unused properties.
 */

export interface RouteMetadata {
  /** Schemas the route validates its request against. */
  schemas?: ValidationSchemas;
  /** The action a caller must hold, from `authorize()`. */
  action?: string;
  /** Set on the `authenticate` guard, so documented routes can be marked secured. */
  authenticates?: boolean;
  /** Overrides the summary the documentation would otherwise derive. */
  summary?: string;
  /** Longer prose for the documentation, when the summary is not enough. */
  description?: string;
}

const METADATA = Symbol.for('forgebase.routeMetadata');

interface Annotated {
  [METADATA]?: RouteMetadata;
}

/** Records metadata on a handler without changing how it behaves. */
export function annotate<T extends RequestHandler>(handler: T, metadata: RouteMetadata): T {
  Object.defineProperty(handler, METADATA, {
    value: { ...(handler as Annotated)[METADATA], ...metadata },
    enumerable: false,
    configurable: true,
  });

  return handler;
}

/**
 * Gives a route a human summary for the documentation.
 *
 * CRUD routes describe themselves — `GET /roles` is obviously a list — and are
 * left alone. This exists for the ones that do not: `POST /auth/login` is not
 * "creating a login", and no amount of cleverness applied to the path will work
 * that out.
 *
 * Annotating the handler rather than adding a middleware keeps this free at
 * runtime: nothing extra runs per request.
 */
export function describe<T extends RequestHandler>(
  handler: T,
  summary: string,
  description?: string,
): T {
  return annotate(handler, description === undefined ? { summary } : { summary, description });
}

export function metadataOf(handler: unknown): RouteMetadata | undefined {
  return typeof handler === 'function' ? (handler as Annotated)[METADATA] : undefined;
}

/** Anything a router can be mounted on: the app, or another router. */
export type Mountable = Express | Router;

export interface Mount {
  parent: Mountable;
  /** The path the router is mounted at, relative to its parent. */
  prefix: string;
  router: Router;
}

const mounts: Mount[] = [];

/**
 * Mounts a router and remembers where, so the documentation can report real
 * paths rather than guesses.
 *
 * Mount edges are recorded rather than absolute paths, because a router does
 * not know what its parent is mounted under at the time it is mounted. The
 * full path is resolved later by walking from the roots.
 */
export function mountRouter<T extends Mountable>(parent: T, prefix: string, router: Router): T {
  mounts.push({ parent, prefix, router });

  // `Express` and `Router` both have `use`, but TypeScript cannot resolve the
  // overload against the union, so the call is made through one of them. The
  // signatures are identical for this shape.
  (parent as Router).use(prefix, router);
  return parent;
}

/** Every recorded mount, in the order they happened. */
export function mountedRouters(): readonly Mount[] {
  return mounts;
}

/**
 * The mounts whose parent is not itself a mounted router — the entry points
 * for a walk. Identifying them this way avoids needing to tell an Express app
 * apart from a Router, which is not a distinction Express makes cleanly.
 */
export function rootMounts(): Mount[] {
  const mountedRouterSet = new Set<Mountable>(mounts.map((mount) => mount.router));
  return mounts.filter((mount) => !mountedRouterSet.has(mount.parent));
}

/** The routers mounted directly on the given parent. */
export function childMounts(parent: Mountable): Mount[] {
  return mounts.filter((mount) => mount.parent === parent);
}
