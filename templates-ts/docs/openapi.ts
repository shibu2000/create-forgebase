import type { Router } from 'express';
import { z, type ZodType } from 'zod';

import { env } from '../core/env.js';
import {
  childMounts,
  metadataOf,
  rootMounts,
  type RouteMetadata,
} from '../core/middleware/route-metadata.js';

/**
 * Builds an OpenAPI document from the routes the application actually mounted.
 *
 * Nothing here is hand-maintained. Paths and methods come from the routers,
 * request shapes from the zod schemas already passed to `validate()`, and the
 * required permission from the action already passed to `authorize()`. A route
 * added next month is documented the moment it is written, and a document that
 * is generated from the running app cannot drift away from it — which is the
 * failure mode every hand-written spec eventually has.
 *
 * The cost of that is honesty about limits: response *bodies* are described by
 * the shared envelope rather than per endpoint, because the scaffold has no
 * schema for what a controller returns. Adding one per route is the natural
 * next step, and the shape below leaves room for it.
 */

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  [key: string]: unknown;
}

/** A route's metadata after the walk has resolved inherited `authenticate`. */
interface CollectedMetadata extends RouteMetadata {
  authenticated?: boolean;
}

interface Parameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  schema: JsonSchema;
  description?: string;
}

interface Operation {
  operationId: string;
  summary: string;
  tags: string[];
  security?: { bearerAuth: [] }[];
  parameters?: Parameter[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
  description?: string;
}

/**
 * Converts a zod schema to JSON Schema.
 *
 * `io: 'input'` matters: several schemas coerce (`z.coerce.number()` on query
 * strings) or apply defaults, and a client cares what it may *send*, not what
 * the handler ends up with. `unrepresentable: 'any'` keeps a `.refine()` — which
 * has no JSON Schema equivalent — from throwing and taking the whole document
 * with it.
 */
function toJsonSchema(schema: ZodType): JsonSchema | undefined {
  try {
    const result = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchema;

    // OpenAPI carries its own dialect; a nested `$schema` is noise at best and
    // rejected by some tooling at worst.
    delete result.$schema;
    return result;
  } catch {
    // A schema that cannot be represented is documented as "some object"
    // rather than being allowed to fail the whole document.
    return undefined;
  }
}

/** `/roles/:id/actions` → `/roles/{id}/actions`. */
function toOpenApiPath(path: string): string {
  return path.replace(/:(\w+)/g, '{$1}');
}

function joinPaths(prefix: string, path: string): string {
  const combined = `${prefix.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const normalised = combined.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
  return normalised === '' ? '/' : normalised;
}

/** Object schema → one parameter per property. */
function toParameters(schema: ZodType | undefined, location: 'path' | 'query'): Parameter[] {
  if (!schema) return [];

  const json = toJsonSchema(schema);
  if (!json?.properties) return [];

  return Object.entries(json.properties).map(([name, property]) => ({
    name,
    in: location,
    // Path parameters are part of the URL, so they are required by definition.
    required: location === 'path' || (json.required ?? []).includes(name),
    schema: property,
    ...(property.description ? { description: property.description } : {}),
  }));
}

/** `forgot-password` → `Forgot password`. */
function humanise(segment: string): string {
  const words = segment.replace(/[-_]/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Whether the last named segment reads as a collection.
 *
 * `/users` and `/types/{code}/items` are collections; `/auth/login` is an
 * action. The distinction decides both the wording and whether a POST creates
 * something — which is exactly the convention the controllers follow, where a
 * POST to a collection replies 201 and a POST to an action replies 200.
 */
function isCollection(path: string): boolean {
  const last = path.split('/').filter(Boolean).at(-1);
  return last !== undefined && !last.startsWith('{') && last.endsWith('s');
}

/**
 * A readable summary from the shape of the route.
 *
 * `GET /roles` is a list and `GET /roles/{id}` is a fetch, so those describe
 * themselves. A route that is an action rather than a resource cannot be
 * derived this way — `POST /auth/login` is not "creating a login" — and says
 * so itself through `describe()`; this is only the fallback.
 */
function summarise(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const words = segments.filter((segment) => !segment.startsWith('{'));
  const endsWithParameter = segments.at(-1)?.startsWith('{') ?? false;

  const resource = words.at(-1) ?? 'resource';

  // Not a collection: the path names an action or a singleton, so the best
  // available summary is the segment itself rather than invented CRUD wording.
  if (!resource.endsWith('s')) {
    return humanise(resource);
  }

  const singular = resource.slice(0, -1);
  const owner = words.length > 1 ? `${(words[0] ?? '').replace(/s$/, '')} ` : '';

  switch (method) {
    case 'get':
      return endsWithParameter ? `Get ${singular}` : `List ${owner}${resource}`;
    case 'post':
      return `Create ${owner}${singular}`;
    case 'patch':
      return `Update ${owner}${singular}`;
    case 'put':
      return `Replace ${owner}${resource}`;
    case 'delete':
      return `Delete ${owner}${singular}`;
    default:
      return `${method.toUpperCase()} ${path}`;
  }
}

function operationId(method: string, path: string): string {
  const slug = path
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment.startsWith('{')
        ? `By${segment.slice(1, -1).replace(/^./, (c) => c.toUpperCase())}`
        : segment,
    )
    .join('-');

  return `${method}-${slug || 'root'}`.replace(/[^a-zA-Z0-9-]/g, '');
}

const ENVELOPE_ERROR = { $ref: '#/components/schemas/ErrorResponse' };

function responsesFor(
  method: string,
  path: string,
  metadata: CollectedMetadata,
  hasPathParameter: boolean,
) {
  // Matches what the controllers do: `sendCreated` for a POST to a collection,
  // `sendSuccess` for a POST that performs an action.
  const success = method === 'post' && isCollection(path) ? '201' : '200';

  const responses: Record<string, unknown> = {
    [success]: {
      description: 'Success',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
    },
  };

  if (metadata.schemas) {
    responses['400'] = {
      description: 'The request failed validation',
      content: { 'application/json': { schema: ENVELOPE_ERROR } },
    };
  }

  if (metadata.authenticated) {
    responses['401'] = {
      description: 'Missing or invalid credentials',
      content: { 'application/json': { schema: ENVELOPE_ERROR } },
    };
  }

  if (metadata.action) {
    responses['403'] = {
      description: `The caller does not hold \`${metadata.action}\``,
      content: { 'application/json': { schema: ENVELOPE_ERROR } },
    };
  }

  if (hasPathParameter) {
    responses['404'] = {
      description: 'No such record',
      content: { 'application/json': { schema: ENVELOPE_ERROR } },
    };
  }

  return responses;
}

/**
 * Walks a router, gathering each route with the metadata its handlers carry.
 *
 * `authenticate` is applied with `router.use(...)`, so it appears as a
 * middleware layer that covers every route registered after it — which is why
 * the flag is carried forward through the walk rather than looked for on each
 * route individually.
 */
function collect(
  router: Router,
  prefix: string,
  paths: Record<string, Record<string, Operation>>,
  inherited: boolean,
): void {
  let authenticated = inherited;

  interface Layer {
    route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
    handle?: { stack?: Layer[] };
  }

  // Routers mounted through the registry are visited by their recorded edge,
  // which is the only place their prefix is known. Skipping them here keeps
  // them from also being walked at the wrong prefix via the parent's stack.
  const registered = childMounts(router);
  const registeredRouters = new Set<unknown>(registered.map((mount) => mount.router));

  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    if (layer.handle && registeredRouters.has(layer.handle)) continue;

    if (layer.route) {
      const routePath = toOpenApiPath(joinPaths(prefix, layer.route.path));

      const metadata: CollectedMetadata = { authenticated };
      for (const handler of layer.route.stack) {
        const found = metadataOf(handler.handle);
        if (!found) continue;
        if (found.schemas) metadata.schemas = found.schemas;
        if (found.action) metadata.action = found.action;
        if (found.summary) metadata.summary = found.summary;
        if (found.description) metadata.description = found.description;
        if (found.authenticates) metadata.authenticated = true;
      }

      const hasPathParameter = routePath.includes('{');

      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;

        const parameters = [
          ...toParameters(metadata.schemas?.params, 'path'),
          ...toParameters(metadata.schemas?.query, 'query'),
        ];

        const body = metadata.schemas?.body ? toJsonSchema(metadata.schemas.body) : undefined;

        const operation: Operation = {
          operationId: operationId(method, routePath),
          summary: metadata.summary ?? summarise(method, routePath),
          tags: [routePath.split('/').find(Boolean) ?? 'api'],
          responses: responsesFor(method, routePath, metadata, hasPathParameter),
        };

        const notes = [
          metadata.description,
          metadata.action ? `Requires the \`${metadata.action}\` action.` : undefined,
        ].filter(Boolean);

        if (notes.length > 0) operation.description = notes.join('\n\n');

        if (metadata.authenticated) operation.security = [{ bearerAuth: [] }];
        if (parameters.length > 0) operation.parameters = parameters;
        if (body) {
          operation.requestBody = {
            required: true,
            content: { 'application/json': { schema: body } },
          };
        }

        paths[routePath] ??= {};
        paths[routePath][method] = operation;
      }

      continue;
    }

    // A middleware layer. If it is the auth guard, everything registered after
    // it in this router is authenticated.
    const handleMetadata = metadataOf(layer.handle);
    if (handleMetadata?.authenticates) {
      authenticated = true;
      continue;
    }

    // A nested router mounted without going through the registry. Its prefix
    // is unknowable, so it is walked at the parent's — correct for the common
    // `router.use(subRouter)`, and better than dropping its routes silently.
    if (layer.handle?.stack) {
      collect(layer.handle as unknown as Router, prefix, paths, authenticated);
    }
  }

  for (const mount of registered) {
    collect(mount.router, joinPaths(prefix, mount.prefix), paths, authenticated);
  }
}

export interface OpenApiOptions {
  title?: string;
  version?: string;
  description?: string;
}

export function buildOpenApiDocument(options: OpenApiOptions = {}) {
  const paths: Record<string, Record<string, Operation>> = {};

  for (const { prefix, router } of rootMounts()) {
    collect(router, prefix, paths, false);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: options.title ?? 'API',
      version: options.version ?? '0.1.0',
      description:
        options.description ??
        'Generated from the routes this service actually mounts. Authorization is ' +
          'checked against actions, never role names.',
    },
    servers: [{ url: `http://localhost:${String(env.PORT)}`, description: 'Local' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', const: true },
            data: { description: 'The payload; shape depends on the endpoint.' },
            meta: {
              type: 'object',
              description: 'Pagination on list endpoints, otherwise empty.',
              additionalProperties: true,
            },
          },
        },
        ErrorResponse: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: { type: 'boolean', const: false },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string', description: 'Stable, machine-readable.' },
                message: { type: 'string' },
                details: { description: 'Field-level validation issues, when relevant.' },
              },
            },
          },
        },
      },
    },
    paths,
  };
}
