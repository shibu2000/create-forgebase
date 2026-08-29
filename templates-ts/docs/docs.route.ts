import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { isProduction } from '../core/env.js';

import { buildOpenApiDocument, type OpenApiOptions } from './openapi.js';

/**
 * Serves the API documentation.
 *
 * The document is built on first request rather than at import time, because
 * it describes routers that are still being mounted while this module is
 * being imported. Building it lazily also means the mount order of this
 * fragment cannot affect what it reports.
 *
 * The UI is pointed at `openapi.json` rather than handed the document inline,
 * so the specification is fetchable on its own — which is what client
 * generators, Postman and contract tests all actually want.
 */
export function createDocsRouter(options: OpenApiOptions = {}): Router {
  const router = Router();

  let document: ReturnType<typeof buildOpenApiDocument> | undefined;
  const specification = () => (document ??= buildOpenApiDocument(options));

  router.get('/openapi.json', (_req, res) => {
    res.json(specification());
  });

  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: { url: 'openapi.json' },
      customSiteTitle: `${options.title ?? 'API'} — documentation`,
    }),
  );

  return router;
}

/**
 * Whether the documentation should be exposed.
 *
 * Off in production unless explicitly enabled: an accurate map of every
 * endpoint and the permission it needs is useful to a developer and equally
 * useful to someone probing the service.
 */
export function docsEnabled(): boolean {
  const setting = process.env.DOCS_ENABLED;
  if (setting !== undefined) return ['true', '1', 'yes', 'on'].includes(setting.toLowerCase());
  return !isProduction;
}
