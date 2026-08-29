import type { RequestHandler } from 'express';
import { ZodError, type ZodType } from 'zod';

import { annotate } from './route-metadata.js';

/** Derived from ZodError so it tracks whichever zod major is installed. */
type Issue = ZodError['issues'][number];

/**
 * Zod validation middleware.
 *
 * Every route that accepts a body, query string or path parameter runs this
 * before the controller, so controllers can assume their input is already
 * well-formed and correctly typed.
 *
 * Parsed output lands on `req.validated` rather than overwriting `req.query`
 * — Express 5 exposes `req.query` as a getter, and assigning to it throws.
 * `req.body` is still replaced in place, since it is writable and callers
 * expect coerced values there.
 */

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
  headers?: ZodType;
}

export interface ValidatedData {
  body?: unknown;
  query?: unknown;
  params?: unknown;
  headers?: unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `validate()`. Empty object on routes that do not use it. */
      validated: ValidatedData;
    }
  }
}

type Section = keyof ValidationSchemas;

const SECTIONS: Section[] = ['body', 'query', 'params', 'headers'];

export function validate(schemas: ValidationSchemas): RequestHandler {
  const handler: RequestHandler = (req, _res, next) => {
    const issues: Issue[] = [];
    const validated: ValidatedData = {};

    for (const section of SECTIONS) {
      const schema = schemas[section];
      if (!schema) continue;

      const result = schema.safeParse(req[section]);

      if (result.success) {
        validated[section] = result.data;
      } else {
        // Prefix each issue path with its section so a client can tell
        // "query.page" apart from "body.page".
        for (const issue of result.error.issues) {
          issues.push({ ...issue, path: [section, ...issue.path] });
        }
      }
    }

    if (issues.length > 0) {
      next(new ZodError(issues));
      return;
    }

    req.validated = validated;
    if ('body' in validated) {
      req.body = validated.body;
    }

    next();
  };

  // The schemas are otherwise a closure variable, invisible to anything that
  // wants to describe this route.
  return annotate(handler, { schemas });
}
